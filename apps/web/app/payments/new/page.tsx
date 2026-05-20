"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ImporterView, QuoteView, SupplierView } from "@bandari/shared";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

export default function NewPaymentPage() {
  const router = useRouter();
  const [importers, setImporters] = useState<ImporterView[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierView[]>([]);
  const [importerId, setImporterId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState(50000);
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedImporter = useMemo(
    () => importers.find((i) => i.id === importerId),
    [importers, importerId],
  );

  async function refreshImporters() {
    const list = await api().listImporters();
    setImporters(list);
    if (!importerId && list[0]) setImporterId(list[0].id);
  }

  useEffect(() => {
    refreshImporters().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!importerId) return;
    api()
      .listSuppliers(importerId)
      .then((list) => {
        setSuppliers(list);
        setSupplierId(list[0]?.id ?? "");
      });
  }, [importerId]);

  // Live quote (debounced).
  useEffect(() => {
    if (!amount || amount <= 0) return;
    const t = setTimeout(() => {
      api()
        .createQuote({ sendAmountKes: amount })
        .then(setQuote)
        .catch((e) => setError(e.message));
    }, 350);
    return () => clearTimeout(t);
  }, [amount]);

  async function submit() {
    if (!importerId || !supplierId || !quote) return;
    setBusy(true);
    setError(null);
    try {
      const payment = await api().createPayment({ importerId, supplierId, quoteId: quote.id });
      router.push(`/payments/${payment.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="New payment" subtitle="Pick a counterparty, set the amount, and send." />

      {error ? (
        <Card className="mb-5 border-red-200 bg-red-50">
          <CardBody className="text-sm text-red-700">{error}</CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <ImporterSection
            importers={importers}
            importerId={importerId}
            onSelect={setImporterId}
            onCreated={async (id) => {
              await refreshImporters();
              setImporterId(id);
            }}
          />
          <SupplierSection
            disabled={!importerId}
            importerId={importerId}
            suppliers={suppliers}
            supplierId={supplierId}
            onSelect={setSupplierId}
            onCreated={async () => {
              const list = await api().listSuppliers(importerId);
              setSuppliers(list);
              if (list[0]) setSupplierId(list[list.length - 1]!.id);
            }}
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Amount</CardTitle>
            </CardHeader>
            <CardBody>
              <Label>You send (KES)</Label>
              <Input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Live quote</CardTitle>
            </CardHeader>
            <CardBody>
              {quote ? (
                <dl className="space-y-2 text-sm">
                  <Row label="Principal" value={money(quote.sendMinorKes, "KES")} />
                  <Row label="Fee" value={money(quote.feeMinorKes, "KES")} muted />
                  <Row label="All-in (you pay)" value={money(quote.allInMinorKes, "KES")} strong />
                  <div className="my-2 border-t border-surface-border" />
                  <Row label="≈ USD" value={money(quote.usdMinor, "USD")} muted />
                  <Row label="Supplier receives" value={money(quote.receiveMinorCny, "CNY")} strong />
                  <div className="pt-1 text-[11px] text-ink-faint">
                    1 USD = {quote.rateKesPerUsd} KES · 1 USD = {quote.rateCnyPerUsd} CNY · margin{" "}
                    {quote.marginBps} bps
                  </div>
                </dl>
              ) : (
                <div className="text-sm text-ink-muted">Enter an amount to see a quote.</div>
              )}
            </CardBody>
          </Card>

          <Button
            className="w-full"
            size="lg"
            disabled={!importerId || !supplierId || !quote || busy}
            onClick={submit}
          >
            {busy ? "Creating…" : "Create & send"}
          </Button>
          {selectedImporter && selectedImporter.kycStatus !== "verified" ? (
            <p className="text-center text-[11px] text-ink-faint">
              KYC ({selectedImporter.kycStatus}) runs automatically before funding.
            </p>
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
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? "text-ink-faint" : "text-ink-muted"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold text-ink" : "text-ink-soft"}`}>{value}</dd>
    </div>
  );
}

function ImporterSection({
  importers,
  importerId,
  onSelect,
  onCreated,
}: {
  importers: ImporterView[];
  importerId: string;
  onSelect: (id: string) => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", msisdn: "254708374149" });
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const created = await api().createImporter({
        name: form.name,
        email: form.email,
        msisdn: form.msisdn,
        businessName: form.name,
      });
      await onCreated(created.id);
      setAdding(false);
      setForm({ name: "", email: "", msisdn: "254708374149" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Importer (pays KES)</CardTitle>
        <button className="text-xs text-brand-600 hover:underline" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ New importer"}
        </button>
      </CardHeader>
      <CardBody className="space-y-3">
        {importers.length > 0 ? (
          <Select value={importerId} onChange={(e) => onSelect(e.target.value)}>
            {importers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} · {i.kycStatus}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-sm text-ink-muted">No importers yet — create one.</p>
        )}
        {adding ? (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-surface-subtle p-3">
            <div className="col-span-2">
              <Label>Business name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>M-Pesa (MSISDN)</Label>
              <Input value={form.msisdn} onChange={(e) => setForm({ ...form, msisdn: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Button size="sm" disabled={busy} onClick={create}>
                {busy ? "Saving…" : "Save importer"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function SupplierSection({
  disabled,
  importerId,
  suppliers,
  supplierId,
  onSelect,
  onCreated,
}: {
  disabled: boolean;
  importerId: string;
  suppliers: SupplierView[];
  supplierId: string;
  onSelect: (id: string) => void;
  onCreated: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    payoutMethod: "bank",
    accountName: "",
    accountNumber: "",
    bankName: "",
  });
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      await api().createSupplier({
        importerId,
        name: form.name,
        country: "CHN",
        payoutMethod: form.payoutMethod as "bank" | "alipay",
        accountName: form.accountName || form.name,
        accountNumber: form.accountNumber,
        bankName: form.bankName || undefined,
      });
      await onCreated();
      setAdding(false);
      setForm({ name: "", payoutMethod: "bank", accountName: "", accountNumber: "", bankName: "" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Supplier (receives CNY)</CardTitle>
        <button
          className="text-xs text-brand-600 hover:underline disabled:opacity-50"
          disabled={disabled}
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "Cancel" : "+ New supplier"}
        </button>
      </CardHeader>
      <CardBody className="space-y-3">
        {suppliers.length > 0 ? (
          <Select value={supplierId} onChange={(e) => onSelect(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.payoutMethod}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-sm text-ink-muted">No suppliers for this importer yet.</p>
        )}
        {adding ? (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-surface-subtle p-3">
            <div className="col-span-2">
              <Label>Supplier name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Payout method</Label>
              <Select
                value={form.payoutMethod}
                onChange={(e) => setForm({ ...form, payoutMethod: e.target.value })}
              >
                <option value="bank">Bank</option>
                <option value="alipay">Alipay</option>
              </Select>
            </div>
            <div>
              <Label>Bank name</Label>
              <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
            </div>
            <div>
              <Label>Account name</Label>
              <Input
                value={form.accountName}
                onChange={(e) => setForm({ ...form, accountName: e.target.value })}
              />
            </div>
            <div>
              <Label>Account number</Label>
              <Input
                value={form.accountNumber}
                onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Button size="sm" disabled={busy} onClick={create}>
                {busy ? "Saving…" : "Save supplier"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
