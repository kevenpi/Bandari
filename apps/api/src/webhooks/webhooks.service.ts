import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MpesaAdapter } from "../adapters/mpesa.adapter";
import { OrchestratorService } from "../orchestration/orchestrator.service";

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger("Webhooks");

  constructor(
    private readonly prisma: PrismaService,
    private readonly mpesa: MpesaAdapter,
    private readonly orchestrator: OrchestratorService,
  ) {}

  /** Handle an inbound M-Pesa STK callback (idempotent + deduped). */
  async handleMpesaStk(payload: unknown): Promise<{ ResultCode: number; ResultDesc: string }> {
    const parsed = this.mpesa.parseCallback(payload);
    const dedupeKey = `mpesa:${parsed.checkoutRequestId}`;

    const existing = await this.prisma.webhookEvent.findUnique({ where: { dedupeKey } });
    if (existing?.processedAt) {
      this.logger.log(`Duplicate M-Pesa callback ignored: ${dedupeKey}`);
      return { ResultCode: 0, ResultDesc: "Duplicate ignored" };
    }

    await this.prisma.webhookEvent.upsert({
      where: { dedupeKey },
      create: {
        source: "mpesa",
        externalId: parsed.checkoutRequestId,
        dedupeKey,
        signatureValid: true,
        payload: payload as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
      update: { processedAt: new Date() },
    });

    const payment = await this.prisma.payment.findFirst({
      where: { mpesaCheckoutId: parsed.checkoutRequestId },
    });
    if (!payment) {
      this.logger.warn(`No payment for checkoutRequestId=${parsed.checkoutRequestId}`);
      return { ResultCode: 0, ResultDesc: "Accepted (no matching payment)" };
    }

    await this.orchestrator.onFunding(payment.id, parsed);
    return { ResultCode: 0, ResultDesc: "Accepted" };
  }

  /** Store a Circle webhook (notifications about transaction state). */
  async handleCircle(payload: unknown): Promise<{ ok: true }> {
    const dedupeKey = `circle:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    await this.prisma.webhookEvent.create({
      data: {
        source: "circle",
        dedupeKey,
        signatureValid: true,
        payload: payload as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    });
    return { ok: true };
  }
}
