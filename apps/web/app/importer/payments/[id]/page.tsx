"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { isTerminal, type PaymentView } from "@bandari/shared";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { CustomerStatusPill } from "@/components/customer-status";
import { Tracker } from "@/components/tracker";
import { usePersona } from "@/lib/persona";
import { isFailed, isRefundFlow } from "@/lib/milestones";
import { api } from "@/lib/api";
import { fmtRate, impliedKesPerCny, money, shortHash, timeAgo } from "@/lib/format";
import { formatSettle, getSettlementPref, receiveMinorFor } from "@/lib/settlement";

export default function ImporterTrackerPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { suppliers } = usePersona();
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPayment(await api().getPayment(id));
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    if (!payment || isTerminal(payment.status)) return;
    const t = setInterval(() => load().catch(() => {}), 1500);
    return () => clearInterval(t);
  }, [payment, load]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api().simulateFunding(id);
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
          {error ?? "Loading…"}
        </div>
      </div>
    );
  }

  const supplier = suppliers.find((s) => s.id === payment.supplierId);
  const supplierName = supplier?.name ?? "your supplier";
  const failed = isFailed(payment.status);
  const refunded = isRefundFlow(payment.status);
  const settleCcy = getSettlementPref(payment.supplierId);
  const receiveMinor = receiveMinorFor(payment.usdMinor, settleCcy);

  return (
    <div>
      <PageHeader
        title={`Paying ${supplierName}`}
        subtitle={
          <Link href="/importer" className="text-brand-600 hover:underline">
            ← Back to your payments
          </Link>
        }
        actions={<CustomerStatusPill status={payment.status} perspective="importer" />}
      />

      {error ? (
        <Card className="mb-5 border-red-200 bg-red-50">
          <CardBody className="text-sm text-red-700">{error}</CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          {failed ? (
            <Card className="border-red-200 bg-red-50">
              <CardBody className="text-sm text-red-700">
                This payment couldn’t be completed{payment.failureReason ? `: ${payment.failureReason}` : "."} No
                money left your account.
              </CardBody>
            </Card>
          ) : null}
          {refunded ? (
            <Card className="border-amber-200 bg-amber-50">
              <CardBody className="text-sm text-amber-800">
                Something went wrong downstream, so we’ve refunded you in full. The shillings are on their way
                back to your M-Pesa.
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardBody>
              <Tracker status={payment.status} perspective="importer" busy={busy} onConfirm={confirm} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              <Row label="You send" value={money(payment.sendMinorKes, "KES")} />
              {payment.mpesaReceipt ? (
                <Row label="M-Pesa receipt" value={payment.mpesaReceipt} mono muted />
              ) : null}
              {(() => {
                const r = impliedKesPerCny(payment.sendMinorKes, receiveMinor);
                return r ? <Row label="Locked rate" value={`1 ${settleCcy} = ${fmtRate(r)} KES`} muted /> : null;
              })()}
              <Row label="Settles in" value={settleCcy} muted />
              <div className="my-2 border-t border-surface-border" />
              <Row label={`${supplierName} receives`} value={formatSettle(receiveMinor, settleCcy)} strong />
              {supplier ? (
                <Row
                  label="Paid to"
                  value={`${supplier.payoutMethod === "alipay" ? "Alipay" : supplier.bankName ?? "Bank"} ••${supplier.accountNumber.slice(-4)}`}
                  muted
                />
              ) : null}
              <Row label="Started" value={timeAgo(payment.createdAt)} muted />
            </CardBody>
          </Card>

          {payment.status === "Settled" ? (
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardHeader>
                <CardTitle>Receipt</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2 text-sm">
                <Row label="Supplier paid" value={formatSettle(receiveMinor, settleCcy)} strong />
                <Row label="Receipt #" value={shortHash(payment.settlementId)} mono muted />
                <p className="pt-1 text-[11px] text-emerald-700">Funds delivered to your supplier in China.</p>
              </CardBody>
            </Card>
          ) : null}
        </div>
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
