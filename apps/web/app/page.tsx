"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isTerminal, type PaymentView } from "@bandari/shared";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { PaymentsTable } from "@/components/payments-table";
import { usePersona } from "@/lib/persona";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

export default function RootPage() {
  const { role, ready } = usePersona();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (role === "importer") router.replace("/importer");
    else if (role === "exporter") router.replace("/exporter");
  }, [role, ready, router]);

  if (!ready || role !== "ops") {
    return (
      <div className="rounded-xl border border-surface-border bg-surface px-6 py-12 text-center text-sm text-ink-muted">
        Loading…
      </div>
    );
  }
  return <OpsDashboard />;
}

function OpsDashboard() {
  const [payments, setPayments] = useState<PaymentView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api()
      .listPayments()
      .then(setPayments)
      .catch((e) => setError(e.message));
  }, []);

  const list = payments ?? [];
  const settled = list.filter((p) => p.status === "Settled");
  const inflight = list.filter((p) => !isTerminal(p.status));
  const cnyDelivered = settled.reduce((s, p) => s + p.receiveMinorCny, 0);

  const stats = [
    { label: "Total payments", value: String(list.length) },
    { label: "Settled", value: String(settled.length) },
    { label: "In flight", value: String(inflight.length) },
    { label: "CNY delivered", value: money(cnyDelivered, "CNY") },
  ];

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="Shillings in, supplier paid — watch each payment cross the corridor."
        actions={
          <Link href="/payments/new">
            <Button>New payment</Button>
          </Link>
        }
      />

      {error ? (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardBody className="text-sm text-red-700">
            Could not reach the API at <code>localhost:4000</code>. Start it with{" "}
            <code>pnpm --filter @bandari/api start</code>. ({error})
          </CardBody>
        </Card>
      ) : null}

      <div className="mb-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardBody>
              <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">{s.label}</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-ink">{s.value}</div>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Recent payments</h2>
        <Link href="/payments" className="text-xs text-brand-600 hover:underline">
          View all
        </Link>
      </div>
      {payments === null && !error ? (
        <div className="rounded-xl border border-surface-border bg-surface px-6 py-12 text-center text-sm text-ink-muted">
          Loading…
        </div>
      ) : (
        <PaymentsTable payments={list.slice(0, 8)} />
      )}
    </div>
  );
}
