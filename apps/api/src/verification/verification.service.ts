import { Injectable, NotFoundException } from "@nestjs/common";
import type { Currency, LedgerEntry } from "@prisma/client";
import {
  convertMinor,
  type ProbeResult,
  type Segment,
  type SuiteResult,
  type VerifierResult,
} from "@bandari/shared";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { AppConfigService } from "../config/app-config.service";
import { ACCOUNTS } from "../ledger/ledger.service";
import { MpesaAdapter } from "../adapters/mpesa.adapter";
import { OnRampAdapter } from "../adapters/onramp.adapter";
import { CustodyAdapter } from "../adapters/custody.adapter";
import { ChinaPayoutAdapter } from "../adapters/china-payout.adapter";
import { KycAdapter } from "../adapters/kyc.adapter";
import type { SegmentAdapter } from "../adapters/types";

@Injectable()
export class VerificationService {
  private readonly bySegment: Record<Segment, SegmentAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly config: AppConfigService,
    mpesa: MpesaAdapter,
    onramp: OnRampAdapter,
    custody: CustodyAdapter,
    chinaPayout: ChinaPayoutAdapter,
    kyc: KycAdapter,
  ) {
    this.bySegment = {
      mpesa,
      onramp,
      custody,
      "china-payout": chinaPayout,
      kyc,
    };
  }

  // ---- Segment probes ----
  async healthChecks(): Promise<ProbeResult[]> {
    return Promise.all(Object.values(this.bySegment).map((a) => a.healthCheck()));
  }

  async probe(segment: Segment): Promise<ProbeResult> {
    const adapter = this.bySegment[segment];
    if (!adapter) throw new NotFoundException(`Unknown segment ${segment}`);
    return adapter.runProbe();
  }

  async probes(): Promise<ProbeResult[]> {
    return Promise.all(Object.values(this.bySegment).map((a) => a.runProbe()));
  }

  // ---- Stage verifiers ----
  /** Run all deterministic post-condition checks for a payment. */
  async verifyPayment(paymentId: string): Promise<SuiteResult> {
    const startedAt = new Date().toISOString();
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { quote: true, walletTxs: true },
    });
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);

    const events = await this.prisma.paymentEvent.findMany({ where: { paymentId } });
    const entries = await this.prisma.ledgerEntry.findMany({ where: { paymentId } });
    const seen = new Set(events.map((e) => e.toStatus).filter(Boolean) as string[]);
    const reached = (s: string) => seen.has(s) || payment.status === s;

    const net = (account: string, currency: Currency) => accountNet(entries, account, currency);
    const hasPosting = (account: string, currency: Currency, dir: "debit" | "credit", amt: number) =>
      entries.some(
        (e) => e.account === account && e.currency === currency && e.direction === dir && e.amountMinor === amt,
      );

    const verifiers: VerifierResult[] = [];

    // 1) Ledger balances to zero per currency (always checked).
    const balances = await this.ledger.balancesByCurrency(paymentId);
    const unbalanced = balances.filter((b) => !b.balanced);
    verifiers.push({
      stage: "ledger",
      name: "ledger.balancedPerCurrency",
      outcome: unbalanced.length === 0 ? "pass" : "fail",
      expected: "every currency: total debits == total credits",
      actual: balances,
      message:
        unbalanced.length === 0
          ? "Double-entry ledger balances in every currency."
          : `Unbalanced currencies: ${unbalanced.map((b) => b.currency).join(", ")}`,
    });

    // 2) Funded: all-in KES collected.
    verifiers.push(
      this.gate(reached("Funded"), "Funded", "funded.kesCollected", payment.allInMinorKes, () => {
        const ok = hasPosting(ACCOUNTS.mpesaCollected, "KES", "debit", payment.allInMinorKes);
        return {
          ok,
          actual: net(ACCOUNTS.mpesaCollected, "KES"),
          message: ok
            ? `Collected all-in ${payment.allInMinorKes} (minor KES) via M-Pesa.`
            : "No KES collection posting matching the all-in amount.",
        };
      }),
    );

    // 3) OnRamped: treasury USDC increased by the expected amount.
    const expectedUsdc = convertMinor(payment.sendMinorKes, "KES", "USDC", 1 / payment.quote.rateKesPerUsd);
    verifiers.push(
      this.gate(reached("OnRamped"), "OnRamped", "onramped.usdcReceived", expectedUsdc, () => {
        const treasuryDebit = hasPosting(ACCOUNTS.treasuryUsdc, "USDC", "debit", payment.usdcMinor ?? -1);
        const amountOk = (payment.usdcMinor ?? 0) === expectedUsdc;
        return {
          ok: treasuryDebit && amountOk,
          actual: payment.usdcMinor,
          message:
            treasuryDebit && amountOk
              ? `Treasury received ${payment.usdcMinor} minor USDC (== expected).`
              : `Expected ${expectedUsdc} minor USDC in treasury, got ${payment.usdcMinor}.`,
        };
      }),
    );

    // 4) Bridged: on-chain transfer confirmed (attestation present, tx complete).
    verifiers.push(
      this.gate(reached("Bridged"), "Bridged", "bridged.attestationConfirmed", "attestation + complete tx", () => {
        const tx = payment.walletTxs.find((w) => w.txHash === payment.walletTxHash);
        const hkPosting = hasPosting(ACCOUNTS.hkUsdc, "USDC", "debit", payment.usdcMinor ?? -1);
        const ok = Boolean(payment.attestationId) && tx?.status === "complete" && hkPosting;
        return {
          ok,
          actual: { attestationId: payment.attestationId, txStatus: tx?.status, hkPosting },
          message: ok
            ? `Bridge confirmed (att=${payment.attestationId}), USDC moved to HK wallet.`
            : "Bridge not fully confirmed (missing attestation, tx not complete, or HK posting absent).",
        };
      }),
    );

    // 5) Settled: payout settled and CNY delivered to supplier.
    verifiers.push(
      this.gate(reached("Settled"), "Settled", "settled.supplierPaid", payment.receiveMinorCny, () => {
        const cnyPosting = hasPosting(ACCOUNTS.supplierPaidCny, "CNY", "credit", payment.receiveMinorCny);
        const ok = Boolean(payment.settlementId) && cnyPosting;
        return {
          ok,
          actual: { settlementId: payment.settlementId, cnyMinor: payment.receiveMinorCny },
          message: ok
            ? `Supplier paid ${payment.receiveMinorCny} minor CNY (settlement ${payment.settlementId}).`
            : "Missing settlement id or CNY delivery posting.",
        };
      }),
    );

    // 6) Refunded: every account nets back to zero.
    verifiers.push(
      this.gate(reached("Refunded"), "Refunded", "refunded.allAccountsZero", 0, () => {
        const accounts = [...new Set(entries.map((e) => `${e.account}|${e.currency}`))];
        const nonZero = accounts.filter((key) => {
          const [account, currency] = key.split("|");
          return accountNet(entries, account!, currency as Currency) !== 0;
        });
        return {
          ok: nonZero.length === 0,
          actual: nonZero,
          message:
            nonZero.length === 0
              ? "All accounts net to zero after refund reversal."
              : `Accounts not zeroed: ${nonZero.join(", ")}`,
        };
      }),
    );

    const finishedAt = new Date().toISOString();
    const decided = verifiers.filter((v) => v.outcome !== "skip");
    const passed = decided.every((v) => v.outcome === "pass");
    return {
      startedAt,
      finishedAt,
      mode: this.config.adapterMode,
      probes: [],
      verifiers,
      passed,
    };
  }

  private gate(
    reached: boolean,
    stage: string,
    name: string,
    expected: unknown,
    check: () => { ok: boolean; actual: unknown; message: string },
  ): VerifierResult {
    if (!reached) {
      return { stage, name, outcome: "skip", expected, actual: null, message: "stage not reached" };
    }
    const { ok, actual, message } = check();
    return { stage, name, outcome: ok ? "pass" : "fail", expected, actual, message };
  }
}

function accountNet(entries: LedgerEntry[], account: string, currency: Currency): number {
  return entries
    .filter((e) => e.account === account && e.currency === currency)
    .reduce((s, e) => s + (e.direction === "debit" ? e.amountMinor : -e.amountMinor), 0);
}
