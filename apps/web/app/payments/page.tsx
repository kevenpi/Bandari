"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PaymentView } from "@bandari/shared";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { PaymentsTable } from "@/components/payments-table";
import { api } from "@/lib/api";

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api()
      .listPayments()
      .then(setPayments)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Every payment and its current state in the machine."
        actions={
          <Link href="/payments/new">
            <Button>New payment</Button>
          </Link>
        }
      />
      {loading ? (
        <div className="rounded-xl border border-surface-border bg-surface px-6 py-12 text-center text-sm text-ink-muted">
          Loading…
        </div>
      ) : (
        <PaymentsTable payments={payments} />
      )}
    </div>
  );
}
