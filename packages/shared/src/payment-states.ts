/**
 * The cross-border payment state machine. Mirrors the diagram in the plan:
 * Quoted -> AwaitingFunding -> Funded -> OnRamped -> Bridging -> Bridged
 *        -> PayingOut -> Settled, with Failed / Refunding / Refunded branches.
 */

export const PAYMENT_STATUSES = [
  "Quoted",
  "AwaitingFunding",
  "Funded",
  "OnRamped",
  "Bridging",
  "Bridged",
  "PayingOut",
  "Settled",
  "Failed",
  "Refunding",
  "Refunded",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Allowed transitions out of each state. */
export const TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  Quoted: ["AwaitingFunding", "Failed"],
  AwaitingFunding: ["Funded", "Failed"],
  Funded: ["OnRamped", "Refunding"],
  OnRamped: ["Bridging", "Refunding"],
  Bridging: ["Bridged", "Refunding"],
  Bridged: ["PayingOut", "Refunding"],
  PayingOut: ["Settled", "Refunding"],
  Settled: [],
  Failed: [],
  Refunding: ["Refunded"],
  Refunded: [],
};

/** The successful "happy path" sequence, in order. */
export const HAPPY_PATH: PaymentStatus[] = [
  "Quoted",
  "AwaitingFunding",
  "Funded",
  "OnRamped",
  "Bridging",
  "Bridged",
  "PayingOut",
  "Settled",
];

export const TERMINAL_STATUSES: PaymentStatus[] = ["Settled", "Failed", "Refunded"];

export function isTerminal(status: PaymentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal payment transition: ${from} -> ${to}`);
  }
}

/** Human-friendly label + tone for UI status pills (Stripe-style). */
export const STATUS_META: Record<
  PaymentStatus,
  { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }
> = {
  Quoted: { label: "Quoted", tone: "neutral" },
  AwaitingFunding: { label: "Awaiting funding", tone: "info" },
  Funded: { label: "Funded", tone: "info" },
  OnRamped: { label: "On-ramped to USDT", tone: "info" },
  Bridging: { label: "Bridging", tone: "info" },
  Bridged: { label: "Bridged", tone: "info" },
  PayingOut: { label: "Paying out", tone: "info" },
  Settled: { label: "Settled", tone: "success" },
  Failed: { label: "Failed", tone: "danger" },
  Refunding: { label: "Refunding", tone: "warning" },
  Refunded: { label: "Refunded", tone: "warning" },
};
