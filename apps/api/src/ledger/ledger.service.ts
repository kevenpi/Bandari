import { Injectable } from "@nestjs/common";
import { Currency, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type Tx = Prisma.TransactionClient;

/** Named ledger accounts. Internal asset accounts vs. external counterparties. */
export const ACCOUNTS = {
  importerExternal: "importer_external", // importer's funds (external)
  mpesaCollected: "mpesa_collected", // KES we hold after collection
  onrampExternalKes: "onramp_external_kes", // KES handed to the on-ramp
  onrampExternalUsdc: "onramp_external_usdc", // USDC source from on-ramp
  treasuryUsdc: "treasury_usdc",
  hkUsdc: "hk_usdc",
  payoutExternalUsdc: "payout_external_usdc", // USDC handed to payout partner
  payoutExternalCny: "payout_external_cny", // CNY source at partner
  supplierPaidCny: "supplier_paid_cny", // CNY delivered to supplier
} as const;

export interface CurrencyBalance {
  currency: Currency;
  debitMinor: number;
  creditMinor: number;
  netMinor: number; // debit - credit
  balanced: boolean;
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Post a same-currency double entry: `amountMinor` is debited to one account
   * and credited to another. Keeping every posting same-currency means each
   * currency sub-ledger always has total debits == total credits.
   */
  async postPair(
    args: {
      paymentId: string;
      currency: Currency;
      debitAccount: string;
      creditAccount: string;
      amountMinor: number;
      memo?: string;
    },
    client: Tx = this.prisma,
  ): Promise<void> {
    await client.ledgerEntry.createMany({
      data: [
        {
          paymentId: args.paymentId,
          currency: args.currency,
          account: args.debitAccount,
          direction: "debit",
          amountMinor: args.amountMinor,
          memo: args.memo,
        },
        {
          paymentId: args.paymentId,
          currency: args.currency,
          account: args.creditAccount,
          direction: "credit",
          amountMinor: args.amountMinor,
          memo: args.memo,
        },
      ],
    });
  }

  async balancesByCurrency(paymentId: string, client: Tx = this.prisma): Promise<CurrencyBalance[]> {
    const entries = await client.ledgerEntry.findMany({ where: { paymentId } });
    const byCur = new Map<Currency, { debit: number; credit: number }>();
    for (const e of entries) {
      const cur = e.currency;
      const agg = byCur.get(cur) ?? { debit: 0, credit: 0 };
      if (e.direction === "debit") agg.debit += e.amountMinor;
      else agg.credit += e.amountMinor;
      byCur.set(cur, agg);
    }
    return [...byCur.entries()].map(([currency, agg]) => ({
      currency,
      debitMinor: agg.debit,
      creditMinor: agg.credit,
      netMinor: agg.debit - agg.credit,
      balanced: agg.debit === agg.credit,
    }));
  }

  /** True when every currency sub-ledger for the payment has debits == credits. */
  async isBalanced(paymentId: string, client: Tx = this.prisma): Promise<boolean> {
    const balances = await this.balancesByCurrency(paymentId, client);
    return balances.every((b) => b.balanced);
  }

  /** Net balance of a single account in a currency (debit - credit). */
  async accountBalance(account: string, currency: Currency): Promise<number> {
    const entries = await this.prisma.ledgerEntry.findMany({ where: { account, currency } });
    return entries.reduce((sum, e) => sum + (e.direction === "debit" ? e.amountMinor : -e.amountMinor), 0);
  }

  list(paymentId?: string) {
    return this.prisma.ledgerEntry.findMany({
      where: paymentId ? { paymentId } : undefined,
      orderBy: { createdAt: "asc" },
    });
  }
}
