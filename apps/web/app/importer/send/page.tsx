"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, ShieldAlert } from "lucide-react";
import type { QuoteView } from "@bandari/shared";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/page-header";
import { ComplianceStatusPill } from "@/components/compliance";
import { RateHistoryCard } from "@/components/rate-history";
import { usePersona } from "@/lib/persona";
import { useProfile } from "@/lib/use-profile";
import { importerSubject, supplierSubject } from "@/lib/compliance";
import { api } from "@/lib/api";
import { dateTime, fmtRate, lockHours, money } from "@/lib/format";
import {
  DEFAULT_SETTLEMENT,
  formatSettle,
  getSettlementPref,
  pctFromBps,
  settlementQuote,
  type SettlementCurrency,
} from "@/lib/settlement";

export default function ImporterSendPage() {
  const router = useRouter();
  const { ready, importerId, importer, suppliers, reload } = usePersona();

  const mySuppliers = useMemo(
    () => suppliers.filter((s) => s.importerId === importerId),
    [suppliers, importerId],
  );

  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState(50000);
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [settleCcy, setSettleCcy] = useState<SettlementCurrency>(DEFAULT_SETTLEMENT);

  useEffect(() => {
    if (!supplierId && mySuppliers[0]) setSupplierId(mySuppliers[0].id);
  }, [mySuppliers, supplierId]);

  useEffect(() => {
    if (supplierId) setSettleCcy(getSettlementPref(supplierId));
  }, [supplierId]);

  const settle = quote
    ? settlementQuote(quote.sendMinorKes, quote.usdMinor, quote.rateKesPerUsd, settleCcy)
    : null;

  // Compliance gates: the importer must be verified and the chosen beneficiary cleared.
  const importerProfile = useProfile(importer ? importerSubject(importer) : null);
  const selectedSupplier = mySuppliers.find((s) => s.id === supplierId);
  const supplierProfile = useProfile(selectedSupplier ? supplierSubject(selectedSupplier) : null);
  const importerVerified = importerProfile?.status === "verified";
  const supplierCleared = !selectedSupplier || supplierProfile?.status === "verified";

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

  async function send() {
    if (!importerId || !supplierId || !quote || !importerVerified || !supplierCleared) return;
    setBusy(true);
    setError(null);
    try {
      const payment = await api().createPayment({ importerId, supplierId, quoteId: quote.id });
      router.push(`/importer/payments/${payment.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (ready && !importerId) {
    return (
      <div>
        <PageHeader title="Send a payment" />
        <Card className="border-amber-200 bg-amber-50">
          <CardBody className="text-sm text-amber-800">
            No importer selected. Pick one from the sidebar (or create one in Ops → New payment).
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Send a payment"
        subtitle={importer ? `From ${importer.name} to a supplier in China` : "Pay a supplier in China"}
      />

      {error ? (
        <Card className="mb-5 border-red-200 bg-red-50">
          <CardBody className="text-sm text-red-700">{error}</CardBody>
        </Card>
      ) : null}

      {importerProfile && !importerVerified ? (
        <Card className="mb-5 border-amber-200 bg-amber-50">
          <CardBody className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-sm text-amber-800">
                <span className="font-medium">Verification required.</span> Complete your business verification
                before you can send a payment.
              </div>
            </div>
            <Link href="/importer/profile">
              <Button variant="secondary" size="sm">
                Verify now
              </Button>
            </Link>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Who are you paying?</CardTitle>
              <button
                className="text-xs text-brand-600 hover:underline"
                onClick={() => setAddingSupplier((v) => !v)}
              >
                {addingSupplier ? "Cancel" : "+ New supplier"}
              </button>
            </CardHeader>
            <CardBody className="space-y-3">
              {mySuppliers.length > 0 ? (
                <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  {mySuppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.payoutMethod === "alipay" ? "Alipay" : s.bankName || "Bank"}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-sm text-ink-muted">No saved suppliers yet — add one to continue.</p>
              )}
              {selectedSupplier && supplierProfile && !supplierCleared ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <span className="text-xs text-amber-800">
                    {supplierProfile.status === "screening"
                      ? "We're screening this supplier — you can pay them once they're cleared."
                      : supplierProfile.status === "rejected"
                        ? "This supplier failed screening and can't be paid."
                        : "This supplier is under review — payouts are paused until cleared."}
                  </span>
                  <ComplianceStatusPill status={supplierProfile.status} />
                </div>
              ) : null}
              {addingSupplier ? (
                <AddSupplier
                  importerId={importerId}
                  onCreated={async (newId) => {
                    await reload();
                    setSupplierId(newId);
                    setAddingSupplier(false);
                  }}
                />
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How much?</CardTitle>
            </CardHeader>
            <CardBody>
              <Label>You send (KES)</Label>
              <Input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
              <p className="mt-2 text-xs text-ink-faint">
                We convert your shillings and deliver your supplier’s chosen currency — one all-in rate, no
                surprises.
              </p>
            </CardBody>
          </Card>

          <RateHistoryCard quote="KES" />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardBody>
              {quote && settle ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-3">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-brand-700">
                      Today’s rate
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-ink">
                      1 {settle.currency} = {fmtRate(settle.kesPerUnit)} KES
                    </div>
                    <div className="text-[11px] text-ink-faint">1 USD = {fmtRate(quote.rateKesPerUsd)} KES</div>
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                      <Lock className="h-3 w-3" />
                      Rate locked for {lockHours(quote.createdAt, quote.expiresAt)} hours
                    </div>
                    <div className="text-[11px] text-ink-faint">until {dateTime(quote.expiresAt)}</div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg bg-surface-subtle px-3 py-2">
                    <span className="text-xs text-ink-muted">
                      Supplier accepts{" "}
                      <span className="font-medium text-ink">{settle.option.name}</span> ({settle.currency})
                    </span>
                    {settle.savingsBps > 0 ? (
                      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        save {pctFromBps(settle.savingsBps)}
                      </span>
                    ) : null}
                  </div>

                  <dl className="space-y-2 text-sm">
                    <Row label="You pay (all-in)" value={money(settle.allInMinorKes, "KES")} strong />
                    <Row
                      label={`Includes fee (${pctFromBps(settle.marginBps)})`}
                      value={money(settle.feeMinorKes, "KES")}
                      muted
                    />
                    <div className="my-2 border-t border-surface-border" />
                    <Row
                      label="Supplier receives"
                      value={formatSettle(settle.receiveMinor, settle.currency)}
                      strong
                    />
                  </dl>

                  {settle.savingsBps > 0 ? (
                    <p className="text-[11px] text-emerald-700">
                      You save {money(settle.savingsMinorKes, "KES")} versus paying into onshore yuan, because
                      your supplier accepts {settle.option.name.toLowerCase()}.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-ink-muted">Enter an amount to see the total.</div>
              )}
            </CardBody>
          </Card>

          <Button
            className="w-full"
            size="lg"
            disabled={!importerId || !supplierId || !quote || busy || !importerVerified || !supplierCleared}
            onClick={send}
          >
            {busy ? "Sending…" : !importerVerified ? "Verify to send" : "Review & send"}
          </Button>
          <p className="text-center text-[11px] text-ink-faint">
            You’ll confirm the payment with M-Pesa on the next screen.
          </p>
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

function AddSupplier({
  importerId,
  onCreated,
}: {
  importerId: string;
  onCreated: (id: string) => Promise<void>;
}) {
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
      const created = await api().createSupplier({
        importerId,
        name: form.name,
        country: "CHN",
        payoutMethod: form.payoutMethod as "bank" | "alipay",
        accountName: form.accountName || form.name,
        accountNumber: form.accountNumber,
        bankName: form.bankName || undefined,
      });
      await onCreated(created.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg bg-surface-subtle p-3">
      <div className="col-span-2">
        <Label>Supplier name</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div>
        <Label>Payout method</Label>
        <Select value={form.payoutMethod} onChange={(e) => setForm({ ...form, payoutMethod: e.target.value })}>
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
        <Input value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} />
      </div>
      <div>
        <Label>Account number</Label>
        <Input
          value={form.accountNumber}
          onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
        />
      </div>
      <div className="col-span-2">
        <Button size="sm" disabled={busy || !form.name || !form.accountNumber} onClick={create}>
          {busy ? "Saving…" : "Save supplier"}
        </Button>
      </div>
    </div>
  );
}
