import { BadgeCheck, FileCheck2, Gauge, ShieldAlert, Wallet, type LucideIcon } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import {
  outcomeMeta,
  riskMeta,
  statusMeta,
  type ComplianceStatus,
  type ScreeningResult,
  type Tone,
} from "@/lib/compliance";
import { cn } from "@/lib/utils";

const toneStyles: Record<Tone, string> = {
  neutral: "bg-surface-subtle text-ink-soft border-surface-border",
  info: "bg-brand-50 text-brand-700 border-brand-100",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
};

export function ComplianceStatusPill({
  status,
  className,
}: {
  status: ComplianceStatus;
  className?: string;
}) {
  const meta = statusMeta(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneStyles[meta.tone],
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current",
          status === "screening" ? "animate-pulse" : "opacity-70",
        )}
      />
      {meta.label}
    </span>
  );
}

function Badge({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        toneStyles[tone],
      )}
    >
      {label}
    </span>
  );
}

function LayerRow({
  icon: Icon,
  title,
  detail,
  tone,
  badge,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  tone: Tone;
  badge: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-surface-border px-3 py-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink">{title}</div>
          <div className="text-[11px] leading-relaxed text-ink-muted">{detail}</div>
        </div>
      </div>
      <Badge tone={tone} label={badge} />
    </div>
  );
}

export interface OnFileDoc {
  label: string;
  file: string;
  meta: string;
}

/**
 * Hardcoded "documents on file" card. For the demo every required document is
 * shown as already collected and verified — no real upload flow is wired.
 */
export function DocumentsOnFile({
  title = "Documents on file",
  caption,
  docs,
}: {
  title?: string;
  caption?: string;
  docs: OnFileDoc[];
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
          <BadgeCheck className="h-3.5 w-3.5" /> All verified
        </span>
      </CardHeader>
      <CardBody className="space-y-2">
        {caption ? <p className="-mt-1 mb-1 text-[13px] text-ink-muted">{caption}</p> : null}
        {docs.map((d) => (
          <div
            key={d.label}
            className="flex items-center justify-between gap-3 rounded-lg border border-surface-border px-3 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{d.label}</div>
                <div className="truncate text-[11px] text-ink-faint">
                  <span className="font-mono">{d.file}</span> · {d.meta}
                </div>
              </div>
            </div>
            <Badge tone="success" label="Verified" />
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

/** The four-layer screening breakdown for a profile. */
export function ScreeningLayers({ result }: { result: ScreeningResult }) {
  const id = outcomeMeta(result.identity.outcome);
  const sx = outcomeMeta(result.sanctions.outcome);
  const rk = riskMeta(result.risk.tier);
  const wl = outcomeMeta(result.wallet.outcome);
  const screening = result.status === "screening";

  return (
    <div className="space-y-2">
      <LayerRow
        icon={BadgeCheck}
        title="Identity & business (KYC / KYB)"
        detail={result.identity.detail}
        tone={screening ? "neutral" : id.tone}
        badge={screening ? "Running" : id.label}
      />
      <LayerRow
        icon={ShieldAlert}
        title="Sanctions & watchlist (AML)"
        detail={result.sanctions.detail}
        tone={screening ? "neutral" : sx.tone}
        badge={screening ? "Running" : sx.label}
      />
      <LayerRow
        icon={Gauge}
        title="Risk rating"
        detail={result.risk.detail}
        tone={screening ? "neutral" : rk.tone}
        badge={screening ? "Running" : rk.label}
      />
      <LayerRow
        icon={Wallet}
        title="Wallet screening"
        detail={result.wallet.detail}
        tone={screening ? "neutral" : wl.tone}
        badge={screening ? "Running" : wl.label}
      />
    </div>
  );
}
