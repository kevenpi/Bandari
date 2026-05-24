import type { StagePlaybook } from "@bandari/shared";
import { FlaskConical, Handshake, Scale, Target } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "brand" | "amber" | "violet" | "emerald";

const tones: Record<Tone, { text: string; dot: string; panel: string }> = {
  brand: { text: "text-brand-700", dot: "bg-brand-500", panel: "border-brand-100 bg-brand-50/40" },
  amber: { text: "text-amber-700", dot: "bg-amber-500", panel: "border-amber-200 bg-amber-50/40" },
  violet: { text: "text-violet-700", dot: "bg-violet-500", panel: "border-violet-200 bg-violet-50/40" },
  emerald: { text: "text-emerald-700", dot: "bg-emerald-500", panel: "border-emerald-200 bg-emerald-50/40" },
};

/** The four-part spec shown for a pipeline stage. */
export function StageDetail({ playbook }: { playbook: StagePlaybook }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Prose tone="brand" icon={<Target className="h-3.5 w-3.5" />} label="Should happen (production)">
          {playbook.shouldHappen}
        </Prose>
        <Prose tone="amber" icon={<FlaskConical className="h-3.5 w-3.5" />} label="Actually happening (mock)">
          {playbook.actuallyHappening}
        </Prose>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <List
          tone="violet"
          icon={<Scale className="h-3.5 w-3.5" />}
          label="Regulation needed"
          items={playbook.regulation}
        />
        <List
          tone="emerald"
          icon={<Handshake className="h-3.5 w-3.5" />}
          label="On/off-ramp partnerships"
          items={playbook.partners}
        />
      </div>
    </div>
  );
}

function SectionLabel({ tone, icon, label }: { tone: Tone; icon: React.ReactNode; label: string }) {
  return (
    <div
      className={cn(
        "mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide",
        tones[tone].text,
      )}
    >
      {icon}
      {label}
    </div>
  );
}

function Prose({
  tone,
  icon,
  label,
  children,
}: {
  tone: Tone;
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border p-3", tones[tone].panel)}>
      <SectionLabel tone={tone} icon={icon} label={label} />
      <p className="text-xs leading-relaxed text-ink-soft">{children}</p>
    </div>
  );
}

function List({
  tone,
  icon,
  label,
  items,
}: {
  tone: Tone;
  icon: React.ReactNode;
  label: string;
  items: string[];
}) {
  return (
    <div className={cn("rounded-lg border p-3", tones[tone].panel)}>
      <SectionLabel tone={tone} icon={icon} label={label} />
      {items.length ? (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-ink-soft">
              <span className={cn("mt-1.5 h-1 w-1 shrink-0 rounded-full", tones[tone].dot)} />
              {it}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-faint">None.</p>
      )}
    </div>
  );
}
