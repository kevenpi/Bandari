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
import { shortHash, timeAgo } from "@/lib/format";
import { formatSettle, getSettlementPref, optionFor, receiveMinorFor } from "@/lib/settlement";

export default function ExporterDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { importers } = usePersona();
  const [payment, setPayment] = useState<PaymentView | null>(null);
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

  if (!payment) {
    return (
      <div>
        <PageHeader title="Incoming payment" />
        <div className="rounded-xl border border-surface-border bg-surface px-6 py-12 text-center text-sm text-ink-muted">
          {error ?? "Loading…"}
        </div>
      </div>
    );
  }

  const buyer = importers.find((i) => i.id === payment.importerId);
  const buyerName = buyer?.name ?? "your buyer";
  const failed = isFailed(payment.status);
  const refunded = isRefundFlow(payment.status);
  const settleCcy = getSettlementPref(payment.supplierId);
  const receiveMinor = receiveMinorFor(payment.usdMinor, settleCcy);

  return (
    <div>
      <PageHeader
        title={`Incoming from ${buyerName}`}
        subtitle={
          <Link href="/exporter" className="text-brand-600 hover:underline">
            ← Back to incoming payments
          </Link>
        }
        actions={<CustomerStatusPill status={payment.status} perspective="exporter" />}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          {failed || refunded ? (
            <Card className="border-amber-200 bg-amber-50">
              <CardBody className="text-sm text-amber-800">
                This payment didn’t complete and was returned to the buyer. Nothing was paid out to you.
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardBody>
              <Tracker status={payment.status} perspective="exporter" />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              <Row label="You receive" value={formatSettle(receiveMinor, settleCcy)} strong />
              <Row label="Settles in" value={`${optionFor(settleCcy).name} (${settleCcy})`} muted />
              <Row label="From" value={buyerName} muted />
              <Row label="Started" value={timeAgo(payment.createdAt)} muted />
            </CardBody>
          </Card>

          {payment.status === "Settled" ? (
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardHeader>
                <CardTitle>Received</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2 text-sm">
                <Row label="Amount" value={formatSettle(receiveMinor, settleCcy)} strong />
                <Row label="Receipt #" value={shortHash(payment.settlementId)} mono muted />
                <p className="pt-1 text-[11px] text-emerald-700">Paid out to your account.</p>
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
