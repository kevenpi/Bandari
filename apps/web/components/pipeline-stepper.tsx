"use client";

import { useState } from "react";
import {
  HAPPY_PATH,
  STAGE_PLAYBOOK,
  isTerminal,
  type PaymentStatus,
  type PaymentView,
} from "@bandari/shared";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StageDetail } from "@/components/stage-detail";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";

type StepState = "done" | "current" | "upcoming";

export function PipelineStepper({
  payment,
  busy,
  onSimulateFunding,
}: {
  payment: PaymentView;
  busy: boolean;
  onSimulateFunding: () => void;
}) {
  const events = payment.events ?? [];
  const eventFor = (s: string) => events.find((e) => e.toStatus === s);
  const reached = new Set<string>(events.map((e) => e.toStatus).filter(Boolean) as string[]);
  reached.add(payment.status);
  const currentIndex = HAPPY_PATH.indexOf(payment.status as PaymentStatus);
  const offHappy = (["Refunding", "Refunded", "Failed"] as PaymentStatus[]).includes(
    payment.status as PaymentStatus,
  );

  const [open, setOpen] = useState<Record<string, boolean>>({ [payment.status]: true });
  const toggle = (s: string) => setOpen((o) => ({ ...o, [s]: !o[s] }));

  function stepState(stage: PaymentStatus, i: number): StepState {
    if (stage === payment.status) return isTerminal(payment.status) ? "done" : "current";
    if (currentIndex >= 0) return i < currentIndex ? "done" : "upcoming";
    return reached.has(stage) ? "done" : "upcoming"; // off-happy path
  }

  return (
    <div className="space-y-2">
      {HAPPY_PATH.map((stage, i) => {
        const pb = STAGE_PLAYBOOK[stage];
        const state = stepState(stage, i);
        const ev = eventFor(stage);
        const isOpen = !!open[stage];
        const actionable = state === "current" && stage === "AwaitingFunding";
        return (
          <div key={stage} className="overflow-hidden rounded-lg border border-surface-border">
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggle(stage)}
              onKeyDown={(e) => e.key === "Enter" && toggle(stage)}
              className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-subtle"
            >
              <Dot state={state} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">{pb.title}</span>
                  <span className="rounded bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
                    {stage}
                  </span>
                </div>
                <p className={cn("truncate text-xs", ev ? "text-ink-muted" : "text-ink-faint")}>
                  {ev ? ev.message : stateLabel(state)}
                </p>
              </div>
              {ev ? <time className="shrink-0 text-[11px] text-ink-faint">{timeAgo(ev.createdAt)}</time> : null}
              {actionable ? (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSimulateFunding();
                  }}
                >
                  Simulate M-Pesa funding
                </Button>
              ) : null}
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-ink-faint transition-transform", isOpen && "rotate-180")}
              />
            </div>
            {isOpen ? (
              <div className="border-t border-surface-border bg-surface-subtle/40 p-3">
                <StageDetail playbook={pb} />
              </div>
            ) : null}
          </div>
        );
      })}

      {offHappy ? <ReversalCard status={payment.status as PaymentStatus} /> : null}
    </div>
  );
}

function ReversalCard({ status }: { status: PaymentStatus }) {
  const pb = STAGE_PLAYBOOK[status];
  const tone = status === "Failed" ? "border-red-200 bg-red-50/50" : "border-amber-200 bg-amber-50/50";
  return (
    <div className={cn("rounded-lg border p-3", tone)}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-ink">{pb.title}</span>
        <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">{status}</span>
      </div>
      <StageDetail playbook={pb} />
    </div>
  );
}

function Dot({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500">
        <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <span className="absolute h-4 w-4 animate-ping rounded-full bg-brand-400/40" />
        <span className="h-4 w-4 rounded-full border-2 border-brand-500 bg-white" />
      </span>
    );
  }
  return <span className="h-4 w-4 shrink-0 rounded-full border-2 border-surface-border bg-white" />;
}

function stateLabel(state: StepState): string {
  return state === "done" ? "Complete" : state === "current" ? "In progress…" : "Pending";
}
