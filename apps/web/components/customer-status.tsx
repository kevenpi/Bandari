import type { PaymentStatus } from "@bandari/shared";
import { customerStatus, type Perspective } from "@/lib/milestones";
import { cn } from "@/lib/utils";

const toneStyles: Record<string, string> = {
  neutral: "bg-surface-subtle text-ink-soft border-surface-border",
  info: "bg-brand-50 text-brand-700 border-brand-100",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
};

export function CustomerStatusPill({
  status,
  perspective,
  className,
}: {
  status: PaymentStatus;
  perspective: Perspective;
  className?: string;
}) {
  const meta = customerStatus(status, perspective);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneStyles[meta.tone],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {meta.label}
    </span>
  );
}
