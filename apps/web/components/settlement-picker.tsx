"use client";

import { Check } from "lucide-react";
import {
  BASELINE_BPS,
  SETTLEMENT_OPTIONS,
  formatSettle,
  pctFromBps,
  settlementQuote,
  type SettlementCurrency,
} from "@/lib/settlement";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface SettlementSample {
  sendMinorKes: number;
  usdMinor: number;
  rateKesPerUsd: number;
}

/**
 * List of settlement currencies the exporter can accept. Read-only when no
 * `onChange` is given (used to display a buyer's chosen option). When a
 * `sample` is provided, each option shows the resulting buyer fee + payout.
 */
export function SettlementPicker({
  value,
  onChange,
  sample,
}: {
  value: SettlementCurrency;
  onChange?: (c: SettlementCurrency) => void;
  sample?: SettlementSample;
}) {
  const interactive = !!onChange;
  return (
    <div className="space-y-2">
      {SETTLEMENT_OPTIONS.map((o) => {
        const selected = o.currency === value;
        const sq = sample
          ? settlementQuote(sample.sendMinorKes, sample.usdMinor, sample.rateKesPerUsd, o.currency)
          : null;
        return (
          <button
            key={o.currency}
            type="button"
            disabled={!interactive}
            onClick={() => onChange?.(o.currency)}
            className={cn(
              "w-full rounded-xl border px-4 py-3 text-left transition",
              selected
                ? "border-brand-300 bg-brand-50/60 ring-1 ring-brand-200"
                : "border-surface-border bg-surface hover:bg-surface-subtle",
              !interactive && "cursor-default",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  selected ? "border-brand-500 bg-brand-500" : "border-surface-border",
                )}
              >
                {selected ? <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} /> : null}
              </span>
              <span className="text-sm font-semibold text-ink">{o.name}</span>
              <span className="rounded bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
                {o.currency}
              </span>
              <span className="ml-auto text-sm font-semibold tabular-nums text-ink">
                {pctFromBps(o.marginBps)}
              </span>
            </div>

            <div className="mt-1 flex items-center gap-2 pl-6">
              <span className="text-xs text-ink-muted">{o.hop}</span>
              {o.marginBps < BASELINE_BPS ? (
                <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                  save {pctFromBps(BASELINE_BPS - o.marginBps)}
                </span>
              ) : (
                <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
                  baseline
                </span>
              )}
            </div>

            <p className="mt-1 pl-6 text-xs text-ink-faint">{o.blurb}</p>

            {sq ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pl-6 text-xs">
                <span className="text-ink-muted">
                  Buyer fee{" "}
                  <span className="tabular-nums text-ink-soft">{money(sq.feeMinorKes, "KES")}</span>
                </span>
                <span className="text-ink-muted">
                  You receive{" "}
                  <span className="tabular-nums font-medium text-ink">
                    {formatSettle(sq.receiveMinor, o.currency)}
                  </span>
                </span>
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
