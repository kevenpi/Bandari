import type { PaymentStatus } from "@bandari/shared";

export type Perspective = "importer" | "exporter";
export type MilestoneState = "done" | "current" | "upcoming";

export interface Milestone {
  label: string;
  sub: string;
  state: MilestoneState;
  /** True only for the importer's "confirm payment" step while awaiting funding. */
  actionable?: boolean;
}

/**
 * Collapse the 8 internal pipeline states into 4 customer-facing milestones.
 * The stablecoin / Hong Kong plumbing is deliberately invisible here — the
 * customer only sees: confirm → received → on its way → paid.
 */
const MILESTONE_INDEX: Record<PaymentStatus, number> = {
  Quoted: 0,
  AwaitingFunding: 0,
  Funded: 1,
  OnRamped: 2,
  Bridging: 2,
  Bridged: 2,
  PayingOut: 2,
  Settled: 3,
  Failed: -1,
  Refunding: -1,
  Refunded: -1,
};

const LABELS: Record<Perspective, { label: string; sub: string }[]> = {
  importer: [
    { label: "Confirm & pay", sub: "Approve the payment with M-Pesa" },
    { label: "Payment received", sub: "We’ve got your shillings" },
    { label: "On its way", sub: "Converting and sending to your supplier" },
    { label: "Supplier paid", sub: "Delivered to your supplier" },
  ],
  exporter: [
    { label: "Buyer confirming", sub: "Your buyer is approving the payment" },
    { label: "Buyer paid", sub: "Funds collected from your buyer" },
    { label: "In transit", sub: "On its way to your account" },
    { label: "Received", sub: "Paid out to your account" },
  ],
};

export function milestones(status: PaymentStatus, perspective: Perspective): Milestone[] {
  const current = MILESTONE_INDEX[status];
  const settled = status === "Settled";
  return LABELS[perspective].map((m, i) => {
    let state: MilestoneState;
    if (settled) state = "done";
    else if (current < 0) state = "upcoming"; // failed / refunded handled by a banner
    else if (i < current) state = "done";
    else if (i === current) state = "current";
    else state = "upcoming";

    let sub = m.sub;
    if (i === 0 && perspective === "importer") {
      if (status === "Quoted") sub = "Preparing your quote…";
      else if (status === "AwaitingFunding") sub = "Approve the M-Pesa prompt on your phone";
      else sub = "Paid via M-Pesa";
    }

    return {
      label: m.label,
      sub,
      state,
      actionable: perspective === "importer" && status === "AwaitingFunding" && i === 0,
    };
  });
}

export function isRefundFlow(status: PaymentStatus): boolean {
  return status === "Refunding" || status === "Refunded";
}

export function isFailed(status: PaymentStatus): boolean {
  return status === "Failed";
}

/** Customer-friendly status label + tone (hides internal state names). */
export function customerStatus(
  status: PaymentStatus,
  perspective: Perspective,
): { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" } {
  if (status === "Settled") return { label: perspective === "importer" ? "Paid" : "Received", tone: "success" };
  if (status === "Failed") return { label: perspective === "importer" ? "Failed" : "Cancelled", tone: "danger" };
  if (isRefundFlow(status))
    return { label: perspective === "importer" ? "Refunded" : "Returned to buyer", tone: "warning" };
  if (perspective === "importer") {
    if (status === "Quoted") return { label: "Preparing", tone: "info" };
    if (status === "AwaitingFunding") return { label: "Action needed", tone: "warning" };
    return { label: "In progress", tone: "info" };
  }
  // exporter
  if (status === "Quoted" || status === "AwaitingFunding") return { label: "Pending", tone: "neutral" };
  return { label: "On its way", tone: "info" };
}
