import { Injectable, Logger } from "@nestjs/common";
import { Prisma, type Payment, type PaymentStatus } from "@prisma/client";
import { assertTransition } from "@bandari/shared";
import { PrismaService } from "../prisma/prisma.service";
import { EventsService } from "../events/events.service";
import { ACCOUNTS, LedgerService } from "../ledger/ledger.service";
import { AppConfigService } from "../config/app-config.service";
import { MpesaAdapter, type ParsedCallback } from "../adapters/mpesa.adapter";
import { OnRampAdapter } from "../adapters/onramp.adapter";
import { CustodyAdapter } from "../adapters/custody.adapter";
import { ChinaPayoutAdapter } from "../adapters/china-payout.adapter";
import { AdapterError } from "../adapters/types";

export interface StepResult {
  paymentId: string;
  status: PaymentStatus;
  /** True when the payment is waiting on an external event (e.g. M-Pesa callback). */
  waiting: boolean;
  /** True when the payment reached a terminal state. */
  done: boolean;
}

type Tx = Prisma.TransactionClient;

/** Markers that can be embedded in a payment reference to force a failure (for tests). */
const FAIL_MARKERS: Record<string, PaymentStatus> = {
  FAIL_ONRAMP: "Funded",
  FAIL_BRIDGE: "OnRamped",
  FAIL_PAYOUT: "Bridged",
};

@Injectable()
export class PaymentEngine {
  private readonly logger = new Logger("PaymentEngine");

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly ledger: LedgerService,
    private readonly config: AppConfigService,
    private readonly mpesa: MpesaAdapter,
    private readonly onramp: OnRampAdapter,
    private readonly custody: CustodyAdapter,
    private readonly chinaPayout: ChinaPayoutAdapter,
  ) {}

  private async load(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { quote: true, supplier: true },
    });
    if (!payment) throw new Error(`Payment ${paymentId} not found`);
    return payment;
  }

  private shouldFail(payment: Payment, atStatus: PaymentStatus): boolean {
    const ref = payment.reference ?? "";
    for (const [marker, status] of Object.entries(FAIL_MARKERS)) {
      if (status === atStatus && ref.includes(marker)) return true;
    }
    return false;
  }

  /** Advance the payment by exactly one transition. */
  async step(paymentId: string): Promise<StepResult> {
    const payment = await this.load(paymentId);
    try {
      switch (payment.status) {
        case "Quoted":
          return await this.doInitiateFunding(payment);
        case "AwaitingFunding":
          return this.result(payment.id, "AwaitingFunding", { waiting: true });
        case "Funded":
          if (this.shouldFail(payment, "Funded")) throw new AdapterError("Injected failure: on-ramp");
          return await this.doOnRamp(payment);
        case "OnRamped":
          if (this.shouldFail(payment, "OnRamped")) throw new AdapterError("Injected failure: bridge");
          return await this.doBridgeSend(payment);
        case "Bridging":
          return await this.doBridgeConfirm(payment);
        case "Bridged":
          if (this.shouldFail(payment, "Bridged")) throw new AdapterError("Injected failure: payout");
          return await this.doCreatePayout(payment);
        case "PayingOut":
          return await this.doConfirmPayout(payment);
        default:
          return this.result(payment.id, payment.status, { done: true });
      }
    } catch (err) {
      return await this.handleFailure(payment, err as Error);
    }
  }

  // ---- Quoted -> AwaitingFunding (STK push) ----
  private async doInitiateFunding(payment: Payment): Promise<StepResult> {
    const importer = await this.prisma.importer.findUniqueOrThrow({ where: { id: payment.importerId } });
    const callbackUrl = `${this.config.publicBaseUrl}${this.config.mpesa.callbackPath}`;
    const stk = await this.mpesa.initiateStkPush({
      amountMinorKes: payment.allInMinorKes,
      msisdn: importer.msisdn,
      accountRef: payment.id.slice(0, 12),
      description: "Bandari payment",
      callbackUrl,
    });
    await this.prisma.$transaction(async (tx) => {
      await this.transition(tx, payment, "AwaitingFunding", {
        type: "stk_push_sent",
        message: `STK push sent (${stk.mode}); awaiting M-Pesa confirmation`,
        data: { checkoutRequestId: stk.checkoutRequestId, mode: stk.mode },
        patch: { mpesaCheckoutId: stk.checkoutRequestId },
      });
    });
    return this.result(payment.id, "AwaitingFunding", { waiting: true });
  }

  // ---- AwaitingFunding -> Funded (called from webhook / simulate) ----
  async applyFunding(paymentId: string, callback: ParsedCallback): Promise<StepResult> {
    const payment = await this.load(paymentId);
    if (payment.status !== "AwaitingFunding") {
      return this.result(payment.id, payment.status, { waiting: false });
    }
    if (!callback.success) {
      return await this.handleFailure(payment, new Error(`Funding declined: ${callback.resultDesc}`));
    }
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.postPair(
        {
          paymentId: payment.id,
          currency: "KES",
          debitAccount: ACCOUNTS.mpesaCollected,
          creditAccount: ACCOUNTS.importerExternal,
          amountMinor: payment.allInMinorKes,
          memo: "M-Pesa collection (all-in)",
        },
        tx,
      );
      await this.transition(tx, payment, "Funded", {
        type: "funded",
        message: `Funds collected via M-Pesa (${callback.mpesaReceipt ?? "n/a"})`,
        data: { mpesaReceipt: callback.mpesaReceipt, amountMinorKes: callback.amountMinorKes },
      });
    });
    return this.result(payment.id, "Funded", {});
  }

  // ---- Funded -> OnRamped (KES -> USDC) ----
  private async doOnRamp(payment: Payment & { quote: { rateKesPerUsd: number } }): Promise<StepResult> {
    const result = await this.onramp.convertKesToUsdc({
      amountMinorKes: payment.sendMinorKes,
      rateKesPerUsd: payment.quote.rateKesPerUsd,
    });
    await this.prisma.$transaction(async (tx) => {
      // KES leaves our holding to the on-ramp.
      await this.ledger.postPair(
        {
          paymentId: payment.id,
          currency: "KES",
          debitAccount: ACCOUNTS.onrampExternalKes,
          creditAccount: ACCOUNTS.mpesaCollected,
          amountMinor: payment.sendMinorKes,
          memo: "KES sent to on-ramp",
        },
        tx,
      );
      // USDC arrives in treasury.
      await this.ledger.postPair(
        {
          paymentId: payment.id,
          currency: "USDC",
          debitAccount: ACCOUNTS.treasuryUsdc,
          creditAccount: ACCOUNTS.onrampExternalUsdc,
          amountMinor: result.usdcMinor,
          memo: "USDC received from on-ramp",
        },
        tx,
      );
      await this.transition(tx, payment, "OnRamped", {
        type: "onramped",
        message: `KES converted to ${(result.usdcMinor / 1e6).toFixed(2)} USDC (${result.mode})`,
        data: { usdcMinor: result.usdcMinor, providerRef: result.providerRef },
        patch: { usdcMinor: result.usdcMinor },
      });
    });
    return this.result(payment.id, "OnRamped", {});
  }

  // ---- OnRamped -> Bridging (send USDC treasury -> HK) ----
  private async doBridgeSend(payment: Payment): Promise<StepResult> {
    const usdcMinor = payment.usdcMinor ?? 0;
    const sent = await this.custody.send({
      amountUsdcMinor: usdcMinor,
      fromWallet: this.config.circle.treasuryWalletId || "treasury",
      toWallet: this.config.circle.hkWalletId || "hk",
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.walletTransaction.create({
        data: {
          paymentId: payment.id,
          txHash: sent.txHash,
          chain: sent.chain,
          amountUsdcMinor: usdcMinor,
          fromWallet: this.config.circle.treasuryWalletId || "treasury",
          toWallet: this.config.circle.hkWalletId || "hk",
          status: "pending",
          raw: (sent.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });
      await this.transition(tx, payment, "Bridging", {
        type: "bridge_sent",
        message: `USDC transfer submitted (${sent.mode}) tx=${sent.txHash.slice(0, 12)}...`,
        data: { txHash: sent.txHash, chain: sent.chain },
        patch: { walletTxHash: sent.txHash },
      });
    });
    return this.result(payment.id, "Bridging", {});
  }

  // ---- Bridging -> Bridged (confirm on-chain / attestation) ----
  private async doBridgeConfirm(payment: Payment): Promise<StepResult> {
    const txHash = payment.walletTxHash ?? "";
    const confirm = await this.custody.confirm(txHash);
    if (!confirm.confirmed) {
      // Stay in Bridging; caller will re-poll.
      return this.result(payment.id, "Bridging", { waiting: true });
    }
    const usdcMinor = payment.usdcMinor ?? 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.walletTransaction.updateMany({
        where: { paymentId: payment.id, txHash },
        data: { status: "complete", confirmations: confirm.confirmations, attestationId: confirm.attestationId },
      });
      // Move USDC treasury -> HK wallet.
      await this.ledger.postPair(
        {
          paymentId: payment.id,
          currency: "USDC",
          debitAccount: ACCOUNTS.hkUsdc,
          creditAccount: ACCOUNTS.treasuryUsdc,
          amountMinor: usdcMinor,
          memo: "USDC bridged to HK wallet",
        },
        tx,
      );
      await this.transition(tx, payment, "Bridged", {
        type: "bridged",
        message: `USDC confirmed on-chain (att=${confirm.attestationId ?? "n/a"})`,
        data: { attestationId: confirm.attestationId, confirmations: confirm.confirmations },
        patch: { attestationId: confirm.attestationId ?? null },
      });
    });
    return this.result(payment.id, "Bridged", {});
  }

  // ---- Bridged -> PayingOut (create CNY payout) ----
  private async doCreatePayout(
    payment: Payment & { supplier: any },
  ): Promise<StepResult> {
    const usdcMinor = payment.usdcMinor ?? 0;
    const created = await this.chinaPayout.createPayout({
      amountUsdcMinor: usdcMinor,
      cnyMinor: payment.receiveMinorCny,
      beneficiary: {
        name: payment.supplier.name,
        country: payment.supplier.country,
        payoutMethod: payment.supplier.payoutMethod,
        accountName: payment.supplier.accountName,
        accountNumber: payment.supplier.accountNumber,
        bankName: payment.supplier.bankName ?? undefined,
      },
    });
    await this.prisma.$transaction(async (tx) => {
      // USDC leaves the HK wallet to the payout partner.
      await this.ledger.postPair(
        {
          paymentId: payment.id,
          currency: "USDC",
          debitAccount: ACCOUNTS.payoutExternalUsdc,
          creditAccount: ACCOUNTS.hkUsdc,
          amountMinor: usdcMinor,
          memo: "USDC sent to payout partner",
        },
        tx,
      );
      const hk = created.hkFx
        ? `HK off-ramp USDC→HK$${(created.hkFx.hkdMinor / 100).toFixed(2)} @ ${created.hkFx.rate.toFixed(2)}; `
        : "";
      await this.transition(tx, payment, "PayingOut", {
        type: "payout_created",
        message: `${hk}payout created (${created.mode}) id=${created.payoutId}`,
        data: { payoutId: created.payoutId, hkFx: created.hkFx ?? null } as Prisma.InputJsonValue,
        patch: { payoutId: created.payoutId },
      });
    });
    return this.result(payment.id, "PayingOut", {});
  }

  // ---- PayingOut -> Settled (confirm payout) ----
  private async doConfirmPayout(payment: Payment): Promise<StepResult> {
    const confirm = await this.chinaPayout.confirmPayout(payment.payoutId ?? "");
    if (!confirm.settled) return this.result(payment.id, "PayingOut", { waiting: true });
    await this.prisma.$transaction(async (tx) => {
      // CNY delivered to the supplier.
      await this.ledger.postPair(
        {
          paymentId: payment.id,
          currency: "CNY",
          debitAccount: ACCOUNTS.payoutExternalCny,
          creditAccount: ACCOUNTS.supplierPaidCny,
          amountMinor: payment.receiveMinorCny,
          memo: "CNY delivered to supplier",
        },
        tx,
      );
      await this.transition(tx, payment, "Settled", {
        type: "settled",
        message: `Supplier paid; settlement ${confirm.settlementId}`,
        data: { settlementId: confirm.settlementId },
        patch: { settlementId: confirm.settlementId ?? null },
      });
    });
    return this.result(payment.id, "Settled", { done: true });
  }

  /** Manually refund/compensate a non-terminal payment. */
  async refund(paymentId: string, reason = "manual refund"): Promise<StepResult> {
    const payment = await this.load(paymentId);
    if (["Settled", "Failed", "Refunded", "Refunding"].includes(payment.status)) {
      throw new Error(`Cannot refund a payment in state ${payment.status}`);
    }
    return this.handleFailure(payment, new Error(reason));
  }

  // ---- Failure / refund handling ----
  private async handleFailure(payment: Payment, error: Error): Promise<StepResult> {
    const collected = ["Funded", "OnRamped", "Bridging", "Bridged", "PayingOut"].includes(payment.status);
    this.logger.warn(`Payment ${payment.id} failed at ${payment.status}: ${error.message}`);
    if (!collected) {
      await this.prisma.$transaction(async (tx) => {
        await this.transition(tx, payment, "Failed", {
          type: "failed",
          message: `Failed before funding: ${error.message}`,
          patch: { failureReason: error.message },
        });
      });
      return this.result(payment.id, "Failed", { done: true });
    }
    // Money was collected -> reverse everything and refund.
    await this.prisma.$transaction(async (tx) => {
      await this.transition(tx, payment, "Refunding", {
        type: "refunding",
        message: `Downstream failure at ${payment.status}: ${error.message}; reversing ledger`,
        patch: { failureReason: error.message },
      });
      await this.reverseAll(tx, payment.id);
      const refunding = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      await this.transition(tx, refunding, "Refunded", {
        type: "refunded",
        message: "Importer refunded; all ledger postings reversed",
      });
    });
    return this.result(payment.id, "Refunded", { done: true });
  }

  /** Post the opposite of every existing ledger entry so all balances return to zero. */
  private async reverseAll(tx: Tx, paymentId: string): Promise<void> {
    const entries = await tx.ledgerEntry.findMany({ where: { paymentId, memo: { not: "refund-reversal" } } });
    if (entries.length === 0) return;
    await tx.ledgerEntry.createMany({
      data: entries.map((e) => ({
        paymentId,
        currency: e.currency,
        account: e.account,
        direction: e.direction === "debit" ? ("credit" as const) : ("debit" as const),
        amountMinor: e.amountMinor,
        memo: "refund-reversal",
      })),
    });
  }

  private async transition(
    tx: Tx,
    payment: Payment,
    to: PaymentStatus,
    opts: {
      type: string;
      message: string;
      data?: Prisma.InputJsonValue;
      patch?: Prisma.PaymentUpdateInput;
    },
  ): Promise<void> {
    assertTransition(payment.status, to);
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: to, ...(opts.patch ?? {}) },
    });
    await this.events.record(
      payment.id,
      { type: opts.type, message: opts.message, fromStatus: payment.status, toStatus: to, data: opts.data },
      tx,
    );
  }

  private result(paymentId: string, status: PaymentStatus, opts: { waiting?: boolean; done?: boolean }): StepResult {
    return {
      paymentId,
      status,
      waiting: opts.waiting ?? false,
      done: opts.done ?? ["Settled", "Failed", "Refunded"].includes(status),
    };
  }
}
