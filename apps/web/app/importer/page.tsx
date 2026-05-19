"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { isTerminal, type PaymentView } from "@bandari/shared";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { FriendlyPaymentsTable } from "@/components/friendly-payments-table";
import { ComplianceStatusPill } from "@/components/compliance";
import { usePersona } from "@/lib/persona";
import { useProfile } from "@/lib/use-profile";
import { importerSubject } from "@/lib/compliance";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

export default function ImporterHome() {
  const { ready, importerId, importer, suppliers } = usePersona();
  const [payments, setPayments] = useState<PaymentView[] | null>(null);
  const profile = useProfile(importer ? importerSubject(importer) : null);

  useEffect(() => {
    if (!ready) return;
    if (!importerId) {
      setPayments([]);
      return;
    }
    api()
      .listPayments()
      .then((list) => setPayments(list.filter((p) => p.importerId === importerId)))
      .catch(() => setPayments([]));
  }, [ready, importerId]);

  const list = payments ?? [];
  const inProgress = list.filter((p) => !isTerminal(p.status)).length;
  const paid = list.filter((p) => p.status === "Settled");
  const totalSentKes = paid.reduce((s, p) => s + p.sendMinorKes, 0);
  const supplierName = (p: PaymentView) => suppliers.find((s) => s.id === p.supplierId)?.name ?? "Supplier";

  return (
    <div>
      <PageHeader
        title={importer ? `Hi, ${importer.name}` : "Your payments"}
        subtitle="Pay your suppliers in China. You send shillings — they get paid in their currency."
        actions={
          <Link href="/importer/send">
            <Button>Send a payment</Button>
          </Link>
        }
      />

      {profile && profile.status !== "verified" ? (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardBody className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-sm text-amber-800">
                <span className="font-medium">Finish verifying your business</span> to start sending payments.
                It only takes a minute.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ComplianceStatusPill status={profile.status} />
              <Link href="/importer/profile">
                <Button variant="secondary" size="sm">
                  Verify
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="mb-7 grid grid-cols-3 gap-4">
        <Stat label="In progress" value={String(inProgress)} />
        <Stat label="Completed" value={String(paid.length)} />
        <Stat label="Total sent" value={money(totalSentKes, "KES")} />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Recent payments</h2>
      </div>
      {payments === null ? (
        <Loading />
      ) : (
        <FriendlyPaymentsTable
          payments={list}
          perspective="importer"
          nameOf={supplierName}
          linkBase="/importer/payments"
          emptyText="No payments yet. Send your first payment to a supplier."
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

function Loading() {
  return (
    <div className="rounded-xl border border-surface-border bg-surface px-6 py-12 text-center text-sm text-ink-muted">
      Loading…
    </div>
  );
}
