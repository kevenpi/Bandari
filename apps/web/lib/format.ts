import { formatMoney, toDecimal, type Currency } from "@bandari/shared";

export function money(amountMinor: number | null | undefined, currency: Currency): string {
  if (amountMinor === null || amountMinor === undefined) return "—";
  return formatMoney(amountMinor, currency);
}

export function decimal(amountMinor: number, currency: Currency): number {
  return toDecimal(amountMinor, currency);
}

export function shortHash(value?: string | null, len = 10): string {
  if (!value) return "—";
  return value.length > len * 2 ? `${value.slice(0, len)}…${value.slice(-4)}` : value;
}

export function timeAgo(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Short date+time (no seconds), e.g. "Jun 2, 6:25 PM" — used for the lock expiry. */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** KES needed per 1 CNY (the customer-facing direction). */
export function kesPerCny(rateKesPerUsd: number, rateCnyPerUsd: number): number {
  return rateKesPerUsd / rateCnyPerUsd;
}

/** Effective KES→CNY rate implied by a settled amount (no rate fields on PaymentView). */
export function impliedKesPerCny(sendMinorKes: number, receiveMinorCny: number): number | null {
  if (!receiveMinorCny) return null;
  return sendMinorKes / receiveMinorCny;
}

export function fmtRate(n: number, dp = 2): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Whole-hours window between two ISO timestamps (min 1). */
export function lockHours(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(1, Math.round(ms / 3_600_000));
}
