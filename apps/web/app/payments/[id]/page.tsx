"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { isTerminal, type LedgerEntryView, type PaymentView } from "@bandari/shared";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { PageHeader } from "@/components/page-header";
import { PipelineStepper } from "@/components/pipeline-stepper";
import { api } from "@/lib/api";
import { money, shortHash } from "@/lib/format";

export default function PaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [ledger, setLedger] = useState<LedgerEntryView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, l] = await Promise.all([api().getPayment(id), api().getLedger(id)]);
    setPayment(p);
    setLedger(l);
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  // Poll while the payment is in flight.
  useEffect(() => {
    if (!payment || isTerminal(payment.status)) return;
    const t = setInterval(() => load().catch(() => {}), 1500);
    return () => clearInterval(t);
  }, [payment, load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!payment) {
    return (
      <div>
        <PageHeader title="Payment" />
        <div className="rounded-xl border border-surface-border bg-surface px-6 py-12 text-center text-sm text-ink-muted">
          {error ? error : "Loading…"}
        </div>
      </div>
    );
  }

  const refs: Array<[string, string | null | undefined]> = [
    ["M-Pesa checkout", payment.reference],
    ["USDC tx hash", payment.walletTxHash],
    ["Attestation", payment.attestationId],
    ["Settlement id", payment.settlementId],
  ];

  return (
    <div>
      <PageHeader
        title="Payment"
        subtitle={payment.id}
        actions={<StatusPill status={payment.status} />}
      />

      {error ? (
        <Card className="mb-5 border-red-200 bg-red-50">
          <CardBody className="text-sm text-red-700">{error}</CardBody>
        </Card>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        {payment.status === "AwaitingFunding" ? (
          <Button disabled={busy} onClick={() => act(() => api().simulateFunding(id))}>
            Simulate M-Pesa funding
          </Button>
        ) : null}
        {!isTerminal(payment.status) ? (
          <>
            <Button variant="secondary" disabled={busy} onClick={() => act(() => api().retryPayment(id))}>
              Retry
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => act(() => api().refundPayment(id))}>
              Refund
            </Button>
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Pipeline stepper: each stage expands to spec (should / actual / regulation / partners) */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Pipeline</CardTitle>
            <span className="text-[11px] text-ink-faint">Tap a stage for the integration spec</span>
          </CardHeader>
          <CardBody>
            <PipelineStepper
              payment={payment}
              busy={busy}
              onSimulateFunding={() => act(() => api().simulateFunding(id))}
            />
          </CardBody>
        </Card>

        {/* Amounts + receipt */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Amounts</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              <Row label="Send (principal)" value={money(payment.sendMinorKes, "KES")} />
              <Row label="≈ USD" value={money(payment.usdMinor, "USD")} muted />
              <Row label="USDC bridged" value={money(payment.usdcMinor ?? null, "USDC")} muted />
              <div className="my-2 border-t border-surface-border" />
              <Row label="Supplier receives" value={money(payment.receiveMinorCny, "CNY")} strong />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>References</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              {refs.map(([label, value]) => (
                <Row key={label} label={label} value={shortHash(value)} mono muted />
              ))}
              {payment.failureReason ? (
                <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  {payment.failureReason}
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Ledger */}
      <div className="mt-5">
        <Card>
          <CardHeader>
            <CardTitle>Double-entry ledger ({ledger.length} entries)</CardTitle>
          </CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-surface-border bg-surface-subtle text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-5 py-2 font-medium">Direction</th>
                  <th className="px-5 py-2 font-medium">Account</th>
                  <th className="px-5 py-2 font-medium">Amount</th>
                  <th className="px-5 py-2 font-medium">Memo</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((l) => (
                  <tr key={l.id} className="border-b border-surface-border last:border-0">
                    <td className="px-5 py-2">
                      <span
                        className={
                          l.direction === "debit" ? "text-emerald-700" : "text-ink-muted"
                        }
                      >
                        {l.direction}
                      </span>
                    </td>
                    <td className="px-5 py-2 font-mono text-xs text-ink-soft">{l.account}</td>
                    <td className="px-5 py-2 tabular-nums text-ink-soft">
                      {money(l.amountMinor, l.currency)}
                    </td>
                    <td className="px-5 py-2 text-xs text-ink-muted">{l.memo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
  mono,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={muted ? "text-ink-faint" : "text-ink-muted"}>{label}</span>
      <span
        className={`${mono ? "font-mono text-xs" : "tabular-nums"} ${
          strong ? "font-semibold text-ink" : "text-ink-soft"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
