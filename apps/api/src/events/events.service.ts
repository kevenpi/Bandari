import { Injectable, Logger } from "@nestjs/common";
import { Prisma, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type Tx = Prisma.TransactionClient;

export interface PaymentEventInput {
  type: string;
  message: string;
  fromStatus?: PaymentStatus | null;
  toStatus?: PaymentStatus | null;
  data?: Prisma.InputJsonValue;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger("EventLog");

  constructor(private readonly prisma: PrismaService) {}

  /** Append an immutable audit event for a payment and emit a structured log line. */
  async record(paymentId: string, input: PaymentEventInput, client: Tx = this.prisma) {
    const event = await client.paymentEvent.create({
      data: {
        paymentId,
        type: input.type,
        message: input.message,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        data: input.data ?? Prisma.JsonNull,
      },
    });
    this.logger.log(
      JSON.stringify({
        paymentId,
        type: input.type,
        from: input.fromStatus ?? null,
        to: input.toStatus ?? null,
        message: input.message,
      }),
    );
    return event;
  }

  async list(paymentId: string) {
    return this.prisma.paymentEvent.findMany({
      where: { paymentId },
      orderBy: { createdAt: "asc" },
    });
  }
}
