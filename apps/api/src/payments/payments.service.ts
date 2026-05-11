import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreatePaymentInput, PaymentView } from "@bandari/shared";
import { PrismaService } from "../prisma/prisma.service";
import { FxService } from "../fx/fx.service";
import { KycService } from "../kyc/kyc.service";
import { EventsService } from "../events/events.service";
import { OrchestratorService } from "../orchestration/orchestrator.service";
import { PaymentEngine } from "./payment-engine.service";
import { MpesaAdapter } from "../adapters/mpesa.adapter";
import { AppConfigService } from "../config/app-config.service";
import { toPaymentView } from "./mappers";

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: FxService,
    private readonly kyc: KycService,
    private readonly events: EventsService,
    private readonly orchestrator: OrchestratorService,
    private readonly engine: PaymentEngine,
    private readonly mpesa: MpesaAdapter,
    private readonly config: AppConfigService,
  ) {}

  async create(input: CreatePaymentInput): Promise<PaymentView> {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw new NotFoundException(`Supplier ${input.supplierId} not found`);
    if (supplier.importerId !== input.importerId) {
      throw new BadRequestException("Supplier does not belong to importer");
    }

    // KYC gate before the first money movement.
    await this.kyc.ensureVerified(input.importerId);

    const quote = await this.fx.getQuoteOrThrow(input.quoteId);
    this.fx.assertUsable(quote);

    const idempotencyKey = `quote:${quote.id}`;
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) throw new ConflictException(`A payment already exists for quote ${quote.id}`);

    const payment = await this.prisma.$transaction(async (tx) => {
      await this.fx.consume(quote.id, tx);
      const created = await tx.payment.create({
        data: {
          status: "Quoted",
          importerId: input.importerId,
          supplierId: input.supplierId,
          quoteId: quote.id,
          reference: input.reference,
          idempotencyKey,
          sendMinorKes: quote.sendMinorKes,
          allInMinorKes: quote.allInMinorKes,
          feeMinorKes: quote.feeMinorKes,
          usdMinor: quote.usdMinor,
          receiveMinorCny: quote.receiveMinorCny,
        },
      });
      await this.events.record(
        created.id,
        {
          type: "created",
          message: "Payment created from quote",
          toStatus: "Quoted",
          data: { quoteId: quote.id, allInMinorKes: quote.allInMinorKes },
        },
        tx,
      );
      return created;
    });

    // Drive Quoted -> AwaitingFunding (initiates STK push).
    await this.orchestrator.drive(payment.id);
    return this.get(payment.id);
  }

  async get(id: string): Promise<PaymentView> {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    const events = await this.prisma.paymentEvent.findMany({
      where: { paymentId: id },
      orderBy: { createdAt: "asc" },
    });
    return toPaymentView(payment, events);
  }

  async list(): Promise<PaymentView[]> {
    const payments = await this.prisma.payment.findMany({ orderBy: { createdAt: "desc" } });
    return payments.map((p) => toPaymentView(p));
  }

  /** Mock-mode helper: synthesize the M-Pesa STK success callback. */
  async simulateFunding(id: string): Promise<PaymentView> {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    if (payment.status !== "AwaitingFunding") {
      throw new BadRequestException(`Payment is ${payment.status}, not AwaitingFunding`);
    }
    const callbackPayload = this.mpesa.buildMockCallback(
      payment.mpesaCheckoutId ?? "unknown",
      payment.allInMinorKes,
    );
    const parsed = this.mpesa.parseCallback(callbackPayload);
    await this.orchestrator.onFunding(id, parsed);
    return this.get(id);
  }

  async retry(id: string): Promise<PaymentView> {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    if (["Settled", "Failed", "Refunded"].includes(payment.status)) {
      throw new BadRequestException(`Payment is terminal (${payment.status})`);
    }
    await this.orchestrator.drive(id);
    return this.get(id);
  }

  async refund(id: string): Promise<PaymentView> {
    await this.engine.refund(id, "manual refund via ops console");
    return this.get(id);
  }
}
