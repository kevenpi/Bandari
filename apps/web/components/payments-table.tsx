"use client";

import Link from "next/link";
import type { PaymentView } from "@bandari/shared";
import { StatusPill } from "@/components/ui/status-pill";
import { money, timeAgo } from "@/lib/format";

export function PaymentsTable({ payments }: { payments: PaymentView[] }) {
  if (payments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border bg-surface px-6 py-12 text-center text-sm text-ink-muted">
        No payments yet. Create one to watch it travel the corridor.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border bg-surface-subtle text-left text-xs uppercase tracking-wide text-ink-faint">
            <th className="px-4 py-2.5 font-medium">Payment</th>
            <th className="px-4 py-2.5 font-medium">Send (KES)</th>
            <th className="px-4 py-2.5 font-medium">Receive (CNY)</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-b border-surface-border last:border-0 hover:bg-surface-subtle">
              <td className="px-4 py-3">
                <Link href={`/payments/${p.id}`} className="font-medium text-brand-700 hover:underline">
                  {p.id.slice(0, 14)}…
                </Link>
                {p.reference ? <div className="text-xs text-ink-faint">{p.reference}</div> : null}
              </td>
              <td className="px-4 py-3 tabular-nums text-ink-soft">{money(p.sendMinorKes, "KES")}</td>
              <td className="px-4 py-3 tabular-nums text-ink-soft">{money(p.receiveMinorCny, "CNY")}</td>
              <td className="px-4 py-3">
                <StatusPill status={p.status} />
              </td>
              <td className="px-4 py-3 text-xs text-ink-muted">{timeAgo(p.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
