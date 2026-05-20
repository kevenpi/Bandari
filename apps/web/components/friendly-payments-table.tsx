"use client";

import Link from "next/link";
import type { PaymentView } from "@bandari/shared";
import { CustomerStatusPill } from "@/components/customer-status";
import { money, timeAgo } from "@/lib/format";
import type { Perspective } from "@/lib/milestones";

export function FriendlyPaymentsTable({
  payments,
  perspective,
  nameOf,
  linkBase,
  emptyText,
}: {
  payments: PaymentView[];
  perspective: Perspective;
  nameOf: (p: PaymentView) => string;
  linkBase: string;
  emptyText: string;
}) {
  if (payments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border bg-surface px-6 py-12 text-center text-sm text-ink-muted">
        {emptyText}
      </div>
    );
  }
  const isImporter = perspective === "importer";
  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border bg-surface-subtle text-left text-xs uppercase tracking-wide text-ink-faint">
            <th className="px-4 py-2.5 font-medium">{isImporter ? "To" : "From"}</th>
            {isImporter ? <th className="px-4 py-2.5 font-medium">You paid</th> : null}
            <th className="px-4 py-2.5 font-medium">{isImporter ? "They receive" : "You receive"}</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">When</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-b border-surface-border last:border-0 hover:bg-surface-subtle">
              <td className="px-4 py-3">
                <Link href={`${linkBase}/${p.id}`} className="font-medium text-brand-700 hover:underline">
                  {nameOf(p)}
                </Link>
                {p.reference ? <div className="text-xs text-ink-faint">{p.reference}</div> : null}
              </td>
              {isImporter ? (
                <td className="px-4 py-3 tabular-nums text-ink-soft">{money(p.sendMinorKes, "KES")}</td>
              ) : null}
              <td className="px-4 py-3 tabular-nums font-medium text-ink">
                {money(p.receiveMinorCny, "CNY")}
              </td>
              <td className="px-4 py-3">
                <CustomerStatusPill status={p.status} perspective={perspective} />
              </td>
              <td className="px-4 py-3 text-xs text-ink-muted">{timeAgo(p.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
