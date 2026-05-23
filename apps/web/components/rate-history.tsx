"use client";

import { useEffect, useState } from "react";
import { Landmark, Lock, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchFxHistory, type FxHistory } from "@/lib/fx";
import { fmtRate } from "@/lib/format";
import { cn } from "@/lib/utils";

function pct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

const W = 320;
const H = 96;
const PAD_X = 6;
const PAD_TOP = 10;
const PAD_BOTTOM = 10;

/**
 * Importer-facing live FX card: the last 7 days of the USD→quote rate, with
 * Bandari's locked (mid-market) rate plotted against a typical bank rate to show
 * why locking + sourcing from banks gives a better, stable price.
 */
export function RateHistoryCard({
  quote = "KES",
  days = 7,
  className,
}: {
  quote?: string;
  days?: number;
  className?: string;
}) {
  const [fx, setFx] = useState<FxHistory | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchFxHistory(quote, days)
      .then((h) => alive && setFx(h))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [quote, days]);

  if (failed) return null;

  return (
    <Card className={className}>
      <CardHeader className="flex items-start justify-between">
        <div>
          <CardTitle>Live FX rate · {fx ? `${fx.base}/${fx.quote}` : `USD/${quote}`}</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            {fx ? (
              <>
                1 {fx.base} = <span className="font-semibold tabular-nums text-ink">{fmtRate(fx.locked)}</span> {fx.quote}{" "}
                · last {fx.points.length} days
              </>
            ) : (
              "Fetching live market rate…"
            )}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
          <Lock className="h-3 w-3" /> Locked {fx?.lockHours ?? 24}h
        </span>
      </CardHeader>
      <CardBody>
        {fx ? <Chart fx={fx} /> : <div className="h-24 animate-pulse rounded-lg bg-surface-subtle" />}
        {fx ? <Footer fx={fx} /> : null}
      </CardBody>
    </Card>
  );
}

function Chart({ fx }: { fx: FxHistory }) {
  const rates = fx.points.map((p) => p.rate);
  const lo = Math.min(...rates, fx.locked);
  const hi = Math.max(...rates, fx.bankRate);
  const span = hi - lo || 1;
  const yLo = lo - span * 0.08;
  const yHi = hi + span * 0.08;

  const x = (i: number) => PAD_X + (i / (fx.points.length - 1)) * (W - PAD_X * 2);
  const y = (v: number) => PAD_TOP + (1 - (v - yLo) / (yHi - yLo)) * (H - PAD_TOP - PAD_BOTTOM);

  const linePts = fx.points.map((p, i) => `${x(i)},${y(p.rate)}`).join(" ");
  const areaPath = `M ${x(0)},${y(yLo)} L ${linePts.replace(/ /g, " L ")} L ${x(fx.points.length - 1)},${y(yLo)} Z`;
  const lastX = x(fx.points.length - 1);
  const lockedY = y(fx.locked);
  const bankY = y(fx.bankRate);
  const trendUp = rates[rates.length - 1]! >= rates[0]!;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="fxFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="rgb(99 102 241)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Typical bank rate (worse — higher KES per USD) */}
        <line x1={PAD_X} y1={bankY} x2={W - PAD_X} y2={bankY} stroke="rgb(248 113 113)" strokeWidth="1" strokeDasharray="4 3" />
        {/* Bandari locked rate */}
        <line x1={PAD_X} y1={lockedY} x2={W - PAD_X} y2={lockedY} stroke="rgb(16 185 129)" strokeWidth="1" strokeDasharray="4 3" />

        {/* Market 7-day trend */}
        <path d={areaPath} fill="url(#fxFill)" />
        <polyline points={linePts} fill="none" stroke="rgb(79 70 229)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lastX} cy={lockedY} r="3" fill="rgb(16 185 129)" stroke="white" strokeWidth="1.5" />
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <Legend swatch="bg-brand-600" label="Market (7d)" />
        <Legend swatch="bg-emerald-500" label="Your locked rate" dashed />
        <Legend swatch="bg-red-400" label="Typical bank" dashed />
        <span className="ml-auto inline-flex items-center gap-1 text-ink-faint">
          {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {fx.source === "frankfurter" ? "Live interbank" : "Live rate · indicative trend"}
        </span>
      </div>
    </div>
  );
}

function Footer({ fx }: { fx: FxHistory }) {
  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        <Stat label="7-day low" value={fmtRate(fx.market.min)} />
        <Stat label="7-day high" value={fmtRate(fx.market.max)} />
        <Stat label="You lock" value={fmtRate(fx.locked)} tone="brand" />
        <Stat label="Typical bank" value={fmtRate(fx.bankRate)} tone="muted" />
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <p className="text-xs leading-relaxed text-emerald-800">
          <span className="font-semibold">~{pct(fx.savingsBps)} better than a typical bank.</span> We source a
          mid-market rate from interbank desks and lock it for {fx.lockHours} hours — no hidden FX markup, so the
          rate you’re quoted is the rate you get.
        </p>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
        <Landmark className="h-3 w-3" /> Rates from a live market feed (USD/{fx.quote}). Bank comparison assumes a{" "}
        {pct(fx.savingsBps)} retail spread.
      </p>
    </div>
  );
}

function Legend({ swatch, label, dashed }: { swatch: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-muted">
      <span className={cn("inline-block h-0.5 w-3.5 rounded", swatch, dashed && "opacity-80")} />
      {label}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "brand" | "muted" }) {
  return (
    <div className="rounded-lg bg-surface-subtle px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          tone === "brand" ? "text-brand-700" : tone === "muted" ? "text-ink-soft" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}
