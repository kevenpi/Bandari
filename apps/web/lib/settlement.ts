/**
 * Settlement-currency options for the China-side exporter. The closer the
 * exporter settles to the stablecoin rail, the less off-ramp / FX / compliance
 * cost there is — so the buyer's fee drops. This is a web/demo-only model
 * (no backend changes); fees are illustrative.
 */
import { bpsOf, toDecimal } from "@bandari/shared";

export type SettlementCurrency = "CNY" | "CNH" | "HKD" | "USD" | "USDC";

export interface SettlementOption {
  currency: SettlementCurrency;
  name: string;
  /** Margin charged to the buyer, in basis points. */
  marginBps: number;
  /** Short tag describing the rail. */
  hop: string;
  blurb: string;
}

/** Onshore CNY is the baseline everything is compared against. */
export const BASELINE_BPS = 120;

/** Ordered most-expensive → cheapest (so savings grow down the list). */
export const SETTLEMENT_OPTIONS: SettlementOption[] = [
  {
    currency: "CNY",
    name: "Onshore yuan",
    marginBps: 120,
    hop: "Mainland off-ramp",
    blurb:
      "Paid into a mainland China bank in ¥. Requires the full Hong Kong → mainland off-ramp plus SAFE / PBOC compliance — the priciest leg.",
  },
  {
    currency: "CNH",
    name: "Offshore yuan",
    marginBps: 85,
    hop: "Hong Kong",
    blurb:
      "Paid in offshore yuan (CNH) via Hong Kong. Freely convertible, so it skips the mainland capital-control off-ramp.",
  },
  {
    currency: "HKD",
    name: "Hong Kong dollars",
    marginBps: 70,
    hop: "Hong Kong",
    blurb:
      "Off-ramped in Hong Kong: the HK partner converts USDC→HKD (≈7.80) and pays a HK account. Freely convertible and the corridor Bandari wires first.",
  },
  {
    currency: "USD",
    name: "US dollars",
    marginBps: 55,
    hop: "USD account",
    blurb: "Paid to a USD account (HK / offshore). Just one FX hop off the stablecoin rail.",
  },
  {
    currency: "USDC",
    name: "USD stablecoin",
    marginBps: 30,
    hop: "On-chain",
    blurb: "Settled directly in USDC. No off-ramp and no FX conversion — the cheapest way to get paid.",
  },
];

/** 1 USD = N units of the settlement currency. */
const USD_RATE: Record<SettlementCurrency, number> = {
  CNY: 7.18,
  CNH: 7.19,
  HKD: 7.8,
  USD: 1,
  USDC: 1,
};

const DECIMALS: Record<SettlementCurrency, number> = { CNY: 2, CNH: 2, HKD: 2, USD: 2, USDC: 2 };

export const DEFAULT_SETTLEMENT: SettlementCurrency = "HKD";

export function optionFor(currency: SettlementCurrency): SettlementOption {
  return SETTLEMENT_OPTIONS.find((o) => o.currency === currency) ?? SETTLEMENT_OPTIONS[0]!;
}

export function receiveMinorFor(usdMinor: number, currency: SettlementCurrency): number {
  const usd = toDecimal(usdMinor, "USD");
  return Math.round(usd * USD_RATE[currency] * 10 ** DECIMALS[currency]);
}

export interface SettlementQuote {
  currency: SettlementCurrency;
  option: SettlementOption;
  marginBps: number;
  feeMinorKes: number;
  allInMinorKes: number;
  receiveMinor: number;
  baselineFeeMinorKes: number;
  savingsMinorKes: number;
  savingsBps: number;
  /** KES per 1 unit of the settlement currency. */
  kesPerUnit: number;
}

export function settlementQuote(
  sendMinorKes: number,
  usdMinor: number,
  rateKesPerUsd: number,
  currency: SettlementCurrency,
): SettlementQuote {
  const option = optionFor(currency);
  const feeMinorKes = bpsOf(sendMinorKes, option.marginBps);
  const baselineFeeMinorKes = bpsOf(sendMinorKes, BASELINE_BPS);
  return {
    currency,
    option,
    marginBps: option.marginBps,
    feeMinorKes,
    allInMinorKes: sendMinorKes + feeMinorKes,
    receiveMinor: receiveMinorFor(usdMinor, currency),
    baselineFeeMinorKes,
    savingsMinorKes: Math.max(0, baselineFeeMinorKes - feeMinorKes),
    savingsBps: Math.max(0, BASELINE_BPS - option.marginBps),
    kesPerUnit: rateKesPerUsd / USD_RATE[currency],
  };
}

export function formatSettle(amountMinor: number, currency: SettlementCurrency): string {
  const dp = DECIMALS[currency];
  const value = amountMinor / 10 ** dp;
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
  return `${formatted} ${currency}`;
}

export function pctFromBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

// ---- per-supplier preference (localStorage, demo-only) ----
const LS_KEY = "bandari.settlement.v1";

function readMap(): Record<string, SettlementCurrency> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LS_KEY) ?? "{}") as Record<string, SettlementCurrency>;
  } catch {
    return {};
  }
}

export function getSettlementPref(supplierId: string): SettlementCurrency {
  if (!supplierId) return DEFAULT_SETTLEMENT;
  return readMap()[supplierId] ?? DEFAULT_SETTLEMENT;
}

export function setSettlementPref(supplierId: string, currency: SettlementCurrency): void {
  if (typeof window === "undefined" || !supplierId) return;
  try {
    const map = readMap();
    map[supplierId] = currency;
    window.localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    // ignore quota/serialization issues in the demo
  }
}
