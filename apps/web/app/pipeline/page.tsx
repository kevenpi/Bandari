import { HAPPY_PATH_PLAYBOOK, STAGE_PLAYBOOK, type StagePlaybook } from "@bandari/shared";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StageDetail } from "@/components/stage-detail";

const STAGES: StagePlaybook[] = [
  ...HAPPY_PATH_PLAYBOOK,
  STAGE_PLAYBOOK.Refunding,
  STAGE_PLAYBOOK.Refunded,
];

export default function PipelinePage() {
  return (
    <div>
      <PageHeader
        title="Pipeline spec"
        subtitle="Every stage: what should happen in production, what the sandbox does today, and the regulation + on/off-ramp partnerships still required."
      />

      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
        Mock / testnet only. No real money moves — these cards spell out the gap between what is wired and
        what production needs.
      </div>

      <div className="space-y-4">
        {STAGES.map((pb, i) => (
          <Card key={pb.status}>
            <CardHeader className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700">
                  {i + 1}
                </span>
                <CardTitle>{pb.title}</CardTitle>
                <span className="rounded bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
                  {pb.status}
                </span>
              </div>
              <span className="text-[11px] text-ink-faint">{pb.handler}</span>
            </CardHeader>
            <CardBody>
              <StageDetail playbook={pb} />
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
