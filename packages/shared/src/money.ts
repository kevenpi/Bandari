/**
 * Money is represented as an integer number of MINOR units plus a currency,
 * to avoid floating-point drift in the ledger. Helpers convert to/from the
 * human decimal representation.
 */

export const CURRENCIES = ["KES", "USD", "USDC", "CNY"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Decimal places each currency carries in its minor unit. */
export const CURRENCY_DECIMALS: Record<Currency, number> = {
  KES: 2,
  USD: 2,
  USDC: 6,
  CNY: 2,
};

export interface Money {
  currency: Currency;
  /** Integer amount in minor units (e.g. cents, or 1e-6 for USDC). */
  amountMinor: number;
}

export function decimalsFor(currency: Currency): number {
  return CURRENCY_DECIMALS[currency];
}

export function toMinor(decimalAmount: number, currency: Currency): number {
  const factor = 10 ** decimalsFor(currency);
  return Math.round(decimalAmount * factor);
}

export function toDecimal(amountMinor: number, currency: Currency): number {
  const factor = 10 ** decimalsFor(currency);
  return amountMinor / factor;
}

export function money(decimalAmount: number, currency: Currency): Money {
  return { currency, amountMinor: toMinor(decimalAmount, currency) };
}

export function formatMoney(amountMinor: number, currency: Currency): string {
  const value = toDecimal(amountMinor, currency);
  const decimals = currency === "USDC" ? 2 : decimalsFor(currency);
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${formatted} ${currency}`;
}

/**
 * Convert a minor-unit amount from one currency to another using a decimal
 * exchange rate expressed as (1 `from` decimal unit = `rate` `to` decimal units).
 */
export function convertMinor(
  amountMinor: number,
  from: Currency,
  to: Currency,
  rate: number,
): number {
  const fromDecimal = toDecimal(amountMinor, from);
  const toDecimalValue = fromDecimal * rate;
  return toMinor(toDecimalValue, to);
}

/** Basis points helper: apply a margin in bps to a minor amount (returns the fee in minor units). */
export function bpsOf(amountMinor: number, bps: number): number {
  return Math.round((amountMinor * bps) / 10_000);
}
