import type { Payment, PaymentEvent } from "@prisma/client";
import type { PaymentEventView, PaymentView } from "@bandari/shared";

export function toPaymentEventView(e: PaymentEvent): PaymentEventView {
  return {
    id: e.id,
    paymentId: e.paymentId,
    type: e.type,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    message: e.message,
    data: e.data ?? undefined,
    createdAt: e.createdAt.toISOString(),
  };
}

export function toPaymentView(payment: Payment, events?: PaymentEvent[]): PaymentView {
  const fundedEvent = events?.find((e) => e.type === "funded");
  const mpesaReceipt =
    fundedEvent && fundedEvent.data && typeof fundedEvent.data === "object"
      ? ((fundedEvent.data as Record<string, unknown>).mpesaReceipt as string | undefined) ?? null
      : null;
  return {
    id: payment.id,
    status: payment.status,
    importerId: payment.importerId,
    supplierId: payment.supplierId,
    quoteId: payment.quoteId,
    reference: payment.reference,
    sendMinorKes: payment.sendMinorKes,
    usdMinor: payment.usdMinor,
    usdcMinor: payment.usdcMinor,
    receiveMinorCny: payment.receiveMinorCny,
    mpesaReceipt,
    walletTxHash: payment.walletTxHash,
    attestationId: payment.attestationId,
    settlementId: payment.settlementId,
    failureReason: payment.failureReason,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    events: events?.map(toPaymentEventView),
  };
}
