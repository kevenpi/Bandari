"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  GitBranch,
  Home,
  LayoutDashboard,
  Plus,
  Send,
  ShieldCheck,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { ROLE_HOME, usePersona, type Role } from "@/lib/persona";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV: Record<Role, NavItem[]> = {
  importer: [
    { href: "/importer", label: "Home", icon: Home },
    { href: "/importer/send", label: "Send a payment", icon: Send },
    { href: "/importer/profile", label: "Verification", icon: ShieldCheck },
  ],
  exporter: [
    { href: "/exporter", label: "Incoming payments", icon: ArrowDownLeft },
    { href: "/exporter/profile", label: "Verification", icon: ShieldCheck },
  ],
  ops: [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/payments", label: "Payments", icon: ArrowLeftRight },
    { href: "/payments/new", label: "New payment", icon: Plus },
    { href: "/pipeline", label: "Pipeline spec", icon: GitBranch },
    { href: "/ops", label: "Verification", icon: ShieldCheck },
    { href: "/ops/review", label: "Compliance review", icon: UserCheck },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  importer: "Importer",
  exporter: "Exporter",
  ops: "Bandari ops",
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, setRole, importers, suppliers, importer, supplier, importerId, supplierId, setImporterId, setSupplierId } =
    usePersona();

  const nav = NAV[role];
  // Longest matching prefix wins so /payments/new beats /payments.
  const activeHref = nav
    .filter((n) => (n.href === "/" ? pathname === "/" : pathname === n.href || pathname.startsWith(n.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  function switchRole(next: Role) {
    setRole(next);
    router.push(ROLE_HOME[next]);
  }

  const subtitle =
    role === "importer"
      ? (importer?.name ?? "Select an importer")
      : role === "exporter"
        ? (supplier?.name ?? "Select a supplier")
        : "Internal console";

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-surface-border bg-surface px-3 py-5 md:flex">
        <div className="mb-5 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">
            B
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink">Bandari</div>
            <div className="truncate text-[11px] text-ink-faint">{subtitle}</div>
          </div>
        </div>

        {/* Persona switcher */}
        <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-surface-subtle p-1">
          {(["importer", "exporter", "ops"] as Role[]).map((r) => (
            <button
              key={r}
              onClick={() => switchRole(r)}
              className={cn(
                "rounded-md py-1.5 text-[11px] font-medium transition-colors",
                role === r ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink",
              )}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>

        {/* Identity picker */}
        {role === "importer" && importers.length > 0 ? (
          <div className="mb-4 px-1">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-ink-faint">Acting as</div>
            <Select value={importerId} onChange={(e) => setImporterId(e.target.value)} className="h-8 text-xs">
              {importers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        {role === "exporter" && suppliers.length > 0 ? (
          <div className="mb-4 px-1">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-ink-faint">Acting as</div>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-8 text-xs">
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <nav className="flex flex-col gap-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  item.href === activeHref
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-soft hover:bg-surface-subtle",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-lg bg-surface-subtle p-3 text-[11px] leading-relaxed text-ink-muted">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-ink-soft">
            <Activity className="h-3.5 w-3.5" /> Sandbox / mock mode
          </div>
          No real money moves. Testnet USDC and simulated rails only.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-surface-border bg-surface/80 px-6 backdrop-blur">
          <div className="text-sm font-medium text-ink-soft">
            {role === "ops" ? "Cross-border payments" : "Pay your suppliers in China"}
          </div>
          <a
            href="http://localhost:4000/health"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-ink-faint hover:text-brand-600"
          >
            API: localhost:4000
          </a>
        </header>
        <main className="flex-1 px-6 py-7">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
