import { Injectable, Logger } from "@nestjs/common";
import type { Currency } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";

export interface ReconciliationReport {
  checkedAt: string;
  totalPayments: number;
  balancedPayments: number;
  imbalances: Array<{ paymentId: string; currency: Currency; netMinor: number }>;
  accountBalances: Array<{ account: string; currency: Currency; netMinor: number }>;
  ok: boolean;
}

/**
 * Reconciliation: proves every payment's ledger balances per currency, and
 * reports the global net position of every account. Can be run on demand
 * (GET /reconciliation) or scheduled.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger("Reconciliation");

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async run(): Promise<ReconciliationReport> {
    const payments = await this.prisma.payment.findMany({ select: { id: true } });
    const imbalances: ReconciliationReport["imbalances"] = [];
    let balancedPayments = 0;

    for (const { id } of payments) {
      const balances = await this.ledger.balancesByCurrency(id);
      const bad = balances.filter((b) => !b.balanced);
      if (bad.length === 0) balancedPayments += 1;
      for (const b of bad) imbalances.push({ paymentId: id, currency: b.currency, netMinor: b.netMinor });
    }

    // Global account position across all entries.
    const entries = await this.prisma.ledgerEntry.groupBy({
      by: ["account", "currency", "direction"],
      _sum: { amountMinor: true },
    });
    const accountMap = new Map<string, number>();
    for (const e of entries) {
      const key = `${e.account}|${e.currency}`;
      const signed = (e.direction === "debit" ? 1 : -1) * (e._sum.amountMinor ?? 0);
      accountMap.set(key, (accountMap.get(key) ?? 0) + signed);
    }
    const accountBalances = [...accountMap.entries()].map(([key, netMinor]) => {
      const [account, currency] = key.split("|");
      return { account: account!, currency: currency as Currency, netMinor };
    });

    const report: ReconciliationReport = {
      checkedAt: new Date().toISOString(),
      totalPayments: payments.length,
      balancedPayments,
      imbalances,
      accountBalances,
      ok: imbalances.length === 0,
    };
    this.logger.log(
      JSON.stringify({ totalPayments: report.totalPayments, balancedPayments, imbalanced: imbalances.length }),
    );
    return report;
  }
}
