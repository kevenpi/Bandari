"use client";

import { CheckCircle2, Clock, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ComplianceStatusPill, DocumentsOnFile, ScreeningLayers } from "@/components/compliance";
import { usePersona } from "@/lib/persona";
import { useProfile } from "@/lib/use-profile";
import { supplierSubject } from "@/lib/compliance";

const SUPPLIER_DOCS = [
  { label: "Business license (营业执照)", file: "business-license.pdf", meta: "Verified 09 May 2026" },
  { label: "Bank account verification", file: "bank-account-confirmation.pdf", meta: "Verified 09 May 2026" },
  { label: "Legal representative ID", file: "legal-rep-id.jpg", meta: "Verified 09 May 2026" },
];

export default function ExporterProfilePage() {
  const { ready, supplierId, supplier } = usePersona();
  const subject = supplier ? supplierSubject(supplier) : null;
  const profile = useProfile(subject);

  if (ready && !supplierId) {
    return (
      <div>
        <PageHeader title="Verification" />
        <Card className="border-amber-200 bg-amber-50">
          <CardBody className="text-sm text-amber-800">No supplier selected. Pick one from the sidebar.</CardBody>
        </Card>
      </div>
    );
  }

  if (!subject || !profile) {
    return (
      <div>
        <PageHeader title="Verification" />
        <div className="rounded-xl border border-surface-border bg-surface px-6 py-12 text-center text-sm text-ink-muted">
          Loading…
        </div>
      </div>
    );
  }

  const { status } = profile;

  return (
    <div>
      <PageHeader
        title="Verification"
        subtitle={`${supplier?.name} · screened before payouts can be released`}
        actions={<ComplianceStatusPill status={status} />}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Screening results</CardTitle>
              <ComplianceStatusPill status={status} />
            </CardHeader>
            <CardBody>
              <p className="mb-3 text-sm text-ink-muted">
                Bandari screens every beneficiary against sanctions and denied-party lists before money can be
                paid out to you. This runs automatically — there's nothing you need to do.
              </p>
              <ScreeningLayers result={profile} />
              {profile.note ? <p className="mt-3 text-[11px] text-ink-faint">Ops note: {profile.note}</p> : null}
            </CardBody>
          </Card>

          <DocumentsOnFile
            title="KYB documents on file"
            caption="Provided by the beneficiary and verified before payouts are released."
            docs={SUPPLIER_DOCS}
          />

          {supplier ? (
            <Card>
              <CardHeader>
                <CardTitle>Payout account</CardTitle>
              </CardHeader>
              <CardBody>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="Account name" value={supplier.accountName} />
                  <Field
                    label="Method"
                    value={supplier.payoutMethod === "alipay" ? "Alipay" : supplier.bankName || "Bank"}
                  />
                  <Field label="Account no." value={maskTail(supplier.accountNumber)} />
                  <Field label="Country" value={supplier.country} />
                </dl>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <StatusCard status={status} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function maskTail(v: string): string {
  if (!v) return "—";
  if (v.includes("*")) return v;
  return v.length > 4 ? `••••${v.slice(-4)}` : v;
}

function StatusCard({ status }: { status: string }) {
  const map: Record<
    string,
    { icon: typeof ShieldCheck; tone: string; title: string; body: string }
  > = {
    screening: {
      icon: Loader2,
      tone: "text-brand-600",
      title: "Screening in progress",
      body: "We're verifying your business and checking sanctions lists. Payouts unlock once this clears.",
    },
    in_review: {
      icon: Clock,
      tone: "text-amber-600",
      title: "Payouts paused",
      body: "A screening check flagged your account for manual review. Incoming payments are held until cleared.",
    },
    verified: {
      icon: CheckCircle2,
      tone: "text-emerald-600",
      title: "Cleared to receive",
      body: "Your business passed screening. Buyers can pay you and payouts release normally.",
    },
    rejected: {
      icon: XCircle,
      tone: "text-red-600",
      title: "Account blocked",
      body: "We couldn't clear your account for payouts. Please contact support.",
    },
    not_started: {
      icon: ShieldCheck,
      tone: "text-ink-soft",
      title: "Not screened yet",
      body: "Screening will begin automatically.",
    },
  };
  const m = map[status] ?? map.not_started!;
  const Icon = m.icon;
  return (
    <Card>
      <CardBody className="space-y-2">
        <Icon className={`h-6 w-6 ${m.tone} ${status === "screening" ? "animate-spin" : ""}`} />
        <div className="text-sm font-semibold text-ink">{m.title}</div>
        <p className="text-[13px] leading-relaxed text-ink-muted">{m.body}</p>
      </CardBody>
    </Card>
  );
}
