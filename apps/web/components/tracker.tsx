"use client";

import type { PaymentStatus } from "@bandari/shared";
import { Check } from "lucide-react";
import { milestones, type Perspective } from "@/lib/milestones";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Customer-facing vertical progress tracker. Four friendly milestones; the
 * stablecoin / cross-border plumbing stays hidden. Importers get a "Confirm
 * payment" action on the first step while funding is pending.
 */
export function Tracker({
  status,
  perspective,
  busy,
  onConfirm,
}: {
  status: PaymentStatus;
  perspective: Perspective;
  busy?: boolean;
  onConfirm?: () => void;
}) {
  const steps = milestones(status, perspective);
  return (
    <ol>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <Dot state={s.state} />
              {!last ? (
                <span
                  className={cn("w-0.5 flex-1", s.state === "done" ? "bg-emerald-400" : "bg-surface-border")}
                  style={{ minHeight: 26 }}
                />
              ) : null}
            </div>
            <div className={cn(last ? "pb-0" : "pb-5")}>
              <div
                className={cn(
                  "text-sm font-medium",
                  s.state === "upcoming" ? "text-ink-faint" : "text-ink",
                )}
              >
                {s.label}
              </div>
              <div className="text-xs text-ink-muted">{s.sub}</div>
              {s.actionable && onConfirm ? (
                <Button size="sm" className="mt-2" disabled={busy} onClick={onConfirm}>
                  {busy ? "Confirming…" : "Confirm payment"}
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Dot({ state }: { state: "done" | "current" | "upcoming" }) {
  if (state === "done") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500">
        <Check className="h-3 w-3 text-white" strokeWidth={3} />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="absolute h-5 w-5 animate-ping rounded-full bg-brand-400/40" />
        <span className="h-5 w-5 rounded-full border-2 border-brand-500 bg-white" />
      </span>
    );
  }
  return <span className="h-5 w-5 shrink-0 rounded-full border-2 border-surface-border bg-white" />;
}
