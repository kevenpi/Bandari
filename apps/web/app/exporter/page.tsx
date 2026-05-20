"use client";

import { useEffect, useState } from "react";
import { isTerminal, type PaymentView } from "@bandari/shared";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { FriendlyPaymentsTable } from "@/components/friendly-payments-table";
import { SettlementPicker } from "@/components/settlement-picker";
import { usePersona } from "@/lib/persona";
import { api } from "@/lib/api";
import {
  BASELINE_BPS,
  DEFAULT_SETTLEMENT,
  formatSettle,
  getSettlementPref,
  optionFor,
  pctFromBps,
  receiveMinorFor,
  setSettlementPref,
  type SettlementCurrency,
} from "@/lib/settlement";

export default function ExporterHome() {
  const { ready, supplierId, supplier, importers } = usePersona();
  const [payments, setPayments] = useState<PaymentView[] | null>(null);
  const [settle, setSettle] = useState<SettlementCurrency>(DEFAULT_SETTLEMENT);

  useEffect(() => {
    if (!ready) return;
    if (!supplierId) {
      setPayments([]);
      return;
    }
    api()
      .listPayments()
      .then((list) => setPayments(list.filter((p) => p.supplierId === supplierId)))
      .catch(() => setPayments([]));
  }, [ready, supplierId]);

  useEffect(() => {
    if (supplierId) setSettle(getSettlementPref(supplierId));
  }, [supplierId]);

  function chooseSettle(c: SettlementCurrency) {
    setSettle(c);
    if (supplierId) setSettlementPref(supplierId, c);
  }

  const list = payments ?? [];
  const incoming = list.filter((p) => !isTerminal(p.status)).length;
  const received = list.filter((p) => p.status === "Settled");
  const totalReceived = received.reduce((s, p) => s + receiveMinorFor(p.usdMinor, settle), 0);
  const importerName = (p: PaymentView) => importers.find((i) => i.id === p.importerId)?.name ?? "Buyer";

  // Sample used to preview fees/payout per option (latest payment, else a default).
  const sampleSource = list[0];
  const sample = {
    sendMinorKes: sampleSource?.sendMinorKes ?? 5_000_000,
    usdMinor: sampleSource?.usdMinor ?? 38_610,
    rateKesPerUsd: 129.5,
  };
  const chosen = optionFor(settle);

  return (
    <div>
      <PageHeader
        title={supplier ? supplier.name : "Incoming payments"}
        subtitle={`Payments your overseas buyers are sending you — settled to you in ${chosen.name.toLowerCase()} (${settle}).`}
      />

      <div className="mb-7 grid grid-cols-3 gap-4">
        <Stat label="On the way" value={String(incoming)} />
        <Stat label="Received" value={String(received.length)} />
        <Stat label="Total received" value={formatSettle(totalReceived, settle)} />
      </div>

      <Card className="mb-7">
        <CardHeader>
          <CardTitle>How you get paid</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-3 text-sm text-ink-muted">
            Choose what currency you accept. Settling closer to the dollar rail means lower fees for your
            buyers — and faster payouts to you.
          </p>
          <SettlementPicker value={settle} onChange={chooseSettle} sample={sample} />
          {settle !== "CNY" ? (
            <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              Accepting {chosen.name.toLowerCase()} cuts your buyers’ fee to {pctFromBps(chosen.marginBps)} — a
              saving of {pctFromBps(BASELINE_BPS - chosen.marginBps)} vs onshore yuan.
            </div>
          ) : (
            <div className="mt-3 rounded-lg bg-surface-subtle px-3 py-2 text-xs text-ink-muted">
              You currently accept onshore yuan (the priciest leg). Accept Hong Kong dollars, offshore yuan,
              USD, or USDC to lower your buyers’ fees.
            </div>
          )}
        </CardBody>
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">From your buyers</h2>
      </div>
      {payments === null ? (
        <div className="rounded-xl border border-surface-border bg-surface px-6 py-12 text-center text-sm text-ink-muted">
          Loading…
        </div>
      ) : (
        <FriendlyPaymentsTable
          payments={list}
          perspective="exporter"
          nameOf={importerName}
          linkBase="/exporter/payments"
          emptyText="No incoming payments yet."
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody>
        <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</div>
        <div className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</div>
      </CardBody>
    </Card>
  );
}
