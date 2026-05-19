"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { PageHeader } from "@/components/page-header";
import { ComplianceStatusPill, DocumentsOnFile, ScreeningLayers } from "@/components/compliance";
import { usePersona } from "@/lib/persona";
import { useProfile } from "@/lib/use-profile";
import { importerSubject, startVerification } from "@/lib/compliance";

const IMPORTER_DOCS = [
  { label: "Certificate of incorporation", file: "incorporation-certificate.pdf", meta: "Verified 12 May 2026" },
  { label: "KRA PIN certificate", file: "kra-pin-certificate.pdf", meta: "Verified 12 May 2026" },
  { label: "Bank statement (last 6 months)", file: "equity-bank-statement.pdf", meta: "Verified 12 May 2026" },
  { label: "Director's national ID", file: "director-id.jpg", meta: "Verified 12 May 2026" },
  { label: "Proof of business address", file: "kplc-utility-bill.pdf", meta: "Verified 12 May 2026" },
];

export default function ImporterProfilePage() {
  const { ready, importerId, importer } = usePersona();
  const subject = importer ? importerSubject(importer) : null;
  const profile = useProfile(subject);
  const [form, setForm] = useState({
    regNo: "CPR/2019/204815",
    kraPin: "P051902842M",
    director: "James Mwangi",
    directorId: "24681012",
  });

  if (ready && !importerId) {
    return (
      <div>
        <PageHeader title="Verification" />
        <Card className="border-amber-200 bg-amber-50">
          <CardBody className="text-sm text-amber-800">
            No importer selected. Pick one from the sidebar.
          </CardBody>
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

  function submit() {
    if (subject) startVerification(subject);
  }

  return (
    <div>
      <PageHeader
        title="Verification"
        subtitle={`${importer?.businessName || importer?.name} · KYC & anti-money-laundering checks`}
        actions={<ComplianceStatusPill status={status} />}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {status === "not_started" ? (
            <Card>
              <CardHeader>
                <CardTitle>Verify your business</CardTitle>
              </CardHeader>
              <CardBody className="space-y-3">
                <p className="text-sm text-ink-muted">
                  We need to confirm your business before you can send money abroad. This is a one-time check
                  required by financial regulations.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Business name</Label>
                    <Input value={importer?.businessName || importer?.name || ""} disabled />
                  </div>
                  <div>
                    <Label>Business registration no.</Label>
                    <Input
                      placeholder="CPR/2024/123456"
                      value={form.regNo}
                      onChange={(e) => setForm({ ...form, regNo: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>KRA PIN</Label>
                    <Input
                      placeholder="P051234567X"
                      value={form.kraPin}
                      onChange={(e) => setForm({ ...form, kraPin: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Director full name</Label>
                    <Input
                      value={form.director}
                      onChange={(e) => setForm({ ...form, director: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Director national ID / passport no.</Label>
                    <Input
                      value={form.directorId}
                      onChange={(e) => setForm({ ...form, directorId: e.target.value })}
                    />
                  </div>
                </div>
                <Button onClick={submit}>Submit for verification</Button>
                <p className="text-[11px] text-ink-faint">
                  We screen your business and directors against global sanctions and watchlists. Most checks
                  finish in seconds.
                </p>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Screening results</CardTitle>
                <ComplianceStatusPill status={status} />
              </CardHeader>
              <CardBody>
                <ScreeningLayers result={profile} />
                {profile.note ? (
                  <p className="mt-3 text-[11px] text-ink-faint">Ops note: {profile.note}</p>
                ) : null}
              </CardBody>
            </Card>
          )}

          <DocumentsOnFile
            caption="Collected during onboarding and screened against the documents above."
            docs={IMPORTER_DOCS}
          />
        </div>

        <div className="space-y-5">
          <StatusCard status={status} />
        </div>
      </div>
    </div>
  );
}

function StatusCard({ status }: { status: string }) {
  const map: Record<
    string,
    { icon: typeof ShieldCheck; tone: string; title: string; body: React.ReactNode }
  > = {
    not_started: {
      icon: ShieldCheck,
      tone: "text-ink-soft",
      title: "Not verified yet",
      body: "Complete the form to start. You can't send payments until you're verified.",
    },
    screening: {
      icon: Loader2,
      tone: "text-brand-600",
      title: "Running checks",
      body: "We're verifying your business and screening against sanctions lists. This only takes a moment.",
    },
    in_review: {
      icon: Clock,
      tone: "text-amber-600",
      title: "Under manual review",
      body: "One of our checks needs a human look. Our compliance team will clear this shortly.",
    },
    verified: {
      icon: CheckCircle2,
      tone: "text-emerald-600",
      title: "You're verified",
      body: (
        <>
          You can now send payments to your suppliers.{" "}
          <Link href="/importer/send" className="font-medium text-brand-600 hover:underline">
            Send a payment →
          </Link>
        </>
      ),
    },
    rejected: {
      icon: XCircle,
      tone: "text-red-600",
      title: "Verification failed",
      body: "We couldn't verify your business. Please contact support to resolve this.",
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
