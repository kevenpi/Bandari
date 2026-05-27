"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { ComplianceStatusPill, ScreeningLayers } from "@/components/compliance";
import { usePersona } from "@/lib/persona";
import {
  decide,
  getProfile,
  importerSubject,
  supplierSubject,
  type ScreeningResult,
  type Subject,
} from "@/lib/compliance";

interface Entry {
  subject: Subject;
  label: string;
  kind: "Importer" | "Beneficiary";
  profile: ScreeningResult;
}

export default function OpsReviewPage() {
  const { importers, suppliers } = usePersona();
  const [tick, setTick] = useState(0);

  // Re-read the store periodically so screening animations + decisions reflect.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 700);
    return () => clearInterval(t);
  }, []);

  // tick is intentionally read to recompute entries each poll.
  void tick;

  const entries: Entry[] = [
    ...importers.map((i) => {
      const subject = importerSubject(i);
      return {
        subject,
        label: i.businessName || i.name,
        kind: "Importer" as const,
        profile: getProfile(subject),
      };
    }),
    ...suppliers.map((s) => {
      const subject = supplierSubject(s);
      return {
        subject,
        label: s.name,
        kind: "Beneficiary" as const,
        profile: getProfile(subject),
      };
    }),
  ];

  const queue = entries.filter((e) => e.profile.status === "in_review");

  function act(id: string, decision: "approve" | "reject") {
    decide(id, decision);
    setTick((n) => n + 1);
  }

  const counts = {
    verified: entries.filter((e) => e.profile.status === "verified").length,
    review: queue.length,
    rejected: entries.filter((e) => e.profile.status === "rejected").length,
  };

  return (
    <div>
      <PageHeader
        title="Compliance review"
        subtitle="Profiles flagged by screening that need a human decision before they can transact."
      />

      <div className="mb-7 grid grid-cols-3 gap-4">
        <Stat label="Verified" value={String(counts.verified)} />
        <Stat label="Needs review" value={String(counts.review)} />
        <Stat label="Rejected" value={String(counts.rejected)} />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Needs review</h2>
      </div>

      {queue.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-sm text-ink-muted">
            Nothing in the review queue. All flagged profiles have been cleared.
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-5">
          {queue.map((e) => (
            <Card key={e.subject.id}>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>
                  {e.label}{" "}
                  <span className="ml-1 text-[11px] font-normal uppercase tracking-wide text-ink-faint">
                    {e.kind}
                  </span>
                </CardTitle>
                <ComplianceStatusPill status={e.profile.status} />
              </CardHeader>
              <CardBody className="space-y-3">
                <ScreeningLayers result={e.profile} />
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => act(e.subject.id, "approve")}>
                    Approve
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => act(e.subject.id, "reject")}>
                    Reject
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">All profiles</h2>
      </div>
      <Card>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border text-left text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-2.5 font-medium">Name</th>
                <th className="px-5 py-2.5 font-medium">Type</th>
                <th className="px-5 py-2.5 font-medium">Risk</th>
                <th className="px-5 py-2.5 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.subject.id} className="border-b border-surface-border last:border-0">
                  <td className="px-5 py-2.5 font-medium text-ink">{e.label}</td>
                  <td className="px-5 py-2.5 text-ink-muted">{e.kind}</td>
                  <td className="px-5 py-2.5 capitalize text-ink-muted">{e.profile.risk.tier}</td>
                  <td className="px-5 py-2.5 text-right">
                    <ComplianceStatusPill status={e.profile.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
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
