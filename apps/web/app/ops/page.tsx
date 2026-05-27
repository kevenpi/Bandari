"use client";

import { useEffect, useState } from "react";
import type { PaymentView, ProbeResult, SuiteResult } from "@bandari/shared";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { ProbePill } from "@/components/ui/status-pill";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";

export default function OpsPage() {
  const [probes, setProbes] = useState<ProbeResult[]>([]);
  const [running, setRunning] = useState(false);
  const [payments, setPayments] = useState<PaymentView[]>([]);
  const [selected, setSelected] = useState("");
  const [suite, setSuite] = useState<SuiteResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    api()
      .listPayments()
      .then((list) => {
        setPayments(list);
        if (list[0]) setSelected(list[0].id);
      });
  }, []);

  async function runProbes() {
    setRunning(true);
    try {
      const [health, probeRun] = await Promise.all([api().runHealthChecks(), api().runProbes()]);
      setProbes([...health, ...probeRun]);
    } finally {
      setRunning(false);
    }
  }

  async function verify() {
    if (!selected) return;
    setVerifying(true);
    try {
      setSuite(await api().verifyPayment(selected));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Ops & verification"
        subtitle="Run deterministic per-segment probes and per-stage verifiers. No AI — just checks."
        actions={
          <Button disabled={running} onClick={runProbes}>
            {running ? "Running…" : "Run all probes"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Segment probes</CardTitle>
          </CardHeader>
          <CardBody>
            {probes.length === 0 ? (
              <p className="text-sm text-ink-muted">Run probes to test each leg in isolation.</p>
            ) : (
              <ul className="space-y-2">
                {probes.map((p, i) => (
                  <li
                    key={`${p.name}-${i}`}
                    className="flex items-center justify-between rounded-lg border border-surface-border px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-ink">{p.name}</div>
                      <div className="text-[11px] text-ink-faint">
                        {p.segment} · {p.mode} · {p.latencyMs}ms
                        {p.error ? ` · ${p.error}` : ""}
                      </div>
                    </div>
                    <ProbePill outcome={p.outcome} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Stage verifiers</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="mb-3 flex gap-2">
              <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
                {payments.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id.slice(0, 12)}… · {p.status}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" disabled={verifying || !selected} onClick={verify}>
                Verify
              </Button>
            </div>
            {suite ? (
              <ul className="space-y-2">
                {suite.verifiers.map((v) => (
                  <li
                    key={v.name}
                    className="flex items-start justify-between gap-3 rounded-lg border border-surface-border px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-ink">{v.name}</div>
                      <div className="text-[11px] text-ink-muted">{v.message}</div>
                    </div>
                    <ProbePill outcome={v.outcome} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">Pick a payment and run its stage verifiers.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
