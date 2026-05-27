/**
 * KYC / AML screening model for the profile (demo-only, client-side).
 *
 * Mirrors the shapes the real KycAdapter would return, but runs entirely in the
 * browser against localStorage so the Vercel demo works with no backend. A
 * profile is screened across four layers — identity/KYB, sanctions/AML, risk,
 * and wallet — and is only `verified` when all clear (or a hit is cleared in
 * manual ops review).
 *
 * Screening is deterministic: a subject's name drives the outcome so the demo
 * can show a clean pass, a sanctions hit (→ review), and a rejection on demand.
 */

export type ComplianceStatus = "not_started" | "screening" | "in_review" | "verified" | "rejected";
export type LayerOutcome = "pending" | "pass" | "clear" | "flag" | "hit" | "fail";
export type RiskTier = "low" | "medium" | "high";
export type SubjectKind = "importer" | "supplier";

export interface LayerResult {
  outcome: LayerOutcome;
  detail: string;
}

export interface ScreeningResult {
  status: ComplianceStatus;
  identity: LayerResult;
  sanctions: LayerResult;
  risk: { tier: RiskTier; detail: string };
  wallet: LayerResult;
  submittedAt?: string;
  decidedAt?: string;
  note?: string;
}

export interface Subject {
  id: string;
  name: string;
  kind: SubjectKind;
  /** Seeded subjects that are already verified in the demo data. */
  verifiedSeed?: boolean;
}

/** How long the "screening…" animation runs before resolving. */
export const SCREEN_MS = 2600;

/** Lowercased substrings that simulate a sanctions / denied-party match. */
const SANCTIONS_DENYLIST = ["crimea", "donbas", "sevmash", "sanction", "ofac", "blocked entity"];

function lc(s: string): string {
  return (s ?? "").toLowerCase();
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Deterministic screening
// ---------------------------------------------------------------------------
function resolve(name: string): ScreeningResult {
  const n = lc(name);
  const identityFail = n.includes("fake") || n.includes("unverifiable");
  const sanctionsHit = SANCTIONS_DENYLIST.some((t) => n.includes(t));
  const pep = n.includes("pep") || n.includes("minister") || n.includes("official");
  const flaggedReview = n.includes("review");
  const highRisk = n.includes("high risk") || n.includes("highrisk") || sanctionsHit;

  const identity: LayerResult = identityFail
    ? { outcome: "fail", detail: "Could not verify business registration or directors." }
    : { outcome: "pass", detail: "Business registration, directors, and UBO verified." };

  const sanctions: LayerResult = sanctionsHit
    ? { outcome: "hit", detail: "Potential match on a sanctions / denied-party list." }
    : pep
      ? { outcome: "flag", detail: "Politically-exposed person — enhanced due diligence." }
      : { outcome: "clear", detail: "No matches on OFAC / UN / EU / UK or PEP lists." };

  const tier: RiskTier = highRisk ? "high" : pep || flaggedReview ? "medium" : "low";
  const risk = {
    tier,
    detail:
      tier === "high"
        ? "High risk — enhanced due diligence required."
        : tier === "medium"
          ? "Medium risk — extra review."
          : "Low risk — standard due diligence.",
  };

  // We control the settlement wallets, so on-chain exposure is always clean here.
  const wallet: LayerResult = { outcome: "clear", detail: "Settlement wallets clean — no illicit exposure." };

  let status: ComplianceStatus = "verified";
  if (identity.outcome === "fail") status = "rejected";
  else if (sanctions.outcome === "hit" || sanctions.outcome === "flag" || flaggedReview) status = "in_review";

  return { status, identity, sanctions, risk, wallet };
}

function pending(): ScreeningResult {
  const p: LayerResult = { outcome: "pending", detail: "Awaiting checks." };
  return {
    status: "not_started",
    identity: p,
    sanctions: p,
    risk: { tier: "low", detail: "Not yet assessed." },
    wallet: p,
  };
}

function initialFor(s: Subject): ScreeningResult {
  const resolved = resolve(s.name);

  // Flagged or failing names are treated as already-screened (sitting in the
  // queue / rejected) so the demo has content out of the box.
  if (resolved.status !== "verified") {
    return { ...resolved, submittedAt: new Date(Date.now() - SCREEN_MS - 2000).toISOString() };
  }

  // Seeded-verified subjects are cleared immediately.
  if (s.verifiedSeed) {
    return { ...resolved, submittedAt: new Date(Date.now() - SCREEN_MS - 2000).toISOString(), decidedAt: nowIso() };
  }

  // Beneficiaries are auto-screened by Bandari on add; importers must opt in.
  if (s.kind === "supplier") {
    return { ...pending(), status: "screening", submittedAt: nowIso() };
  }
  return pending();
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
const LS_KEY = "bandari.compliance.v1";

function readMap(): Record<string, ScreeningResult> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LS_KEY) ?? "{}") as Record<string, ScreeningResult>;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, ScreeningResult>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    // ignore quota/serialization issues in the demo
  }
}

/** Read a profile, advancing screening → resolved by wall-clock. */
export function getProfile(s: Subject): ScreeningResult {
  const map = readMap();
  let rec = map[s.id];
  if (!rec) {
    rec = initialFor(s);
    map[s.id] = rec;
    writeMap(map);
  }
  if (rec.status === "screening" && rec.submittedAt && !rec.decidedAt) {
    const elapsed = Date.now() - new Date(rec.submittedAt).getTime();
    if (elapsed >= SCREEN_MS) {
      const resolved = resolve(s.name);
      rec = { ...resolved, submittedAt: rec.submittedAt };
      map[s.id] = rec;
      writeMap(map);
    }
  }
  return rec;
}

/** Importer kicks off verification from their profile. */
export function startVerification(s: Subject): ScreeningResult {
  const map = readMap();
  const rec: ScreeningResult = { ...pending(), status: "screening", submittedAt: nowIso() };
  map[s.id] = rec;
  writeMap(map);
  return rec;
}

/** Ops clears or rejects a profile sitting in review. */
export function decide(id: string, decision: "approve" | "reject", note?: string): void {
  const map = readMap();
  const rec = map[id];
  if (!rec) return;
  map[id] = {
    ...rec,
    status: decision === "approve" ? "verified" : "rejected",
    decidedAt: nowIso(),
    note: note ?? (decision === "approve" ? "Cleared in manual review." : "Rejected in manual review."),
  };
  writeMap(map);
}

export function isCleared(s: Subject): boolean {
  return getProfile(s).status === "verified";
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------
export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export function statusMeta(status: ComplianceStatus): { label: string; tone: Tone } {
  switch (status) {
    case "verified":
      return { label: "Verified", tone: "success" };
    case "screening":
      return { label: "Screening…", tone: "info" };
    case "in_review":
      return { label: "In review", tone: "warning" };
    case "rejected":
      return { label: "Rejected", tone: "danger" };
    default:
      return { label: "Not started", tone: "neutral" };
  }
}

export function outcomeMeta(outcome: LayerOutcome): { label: string; tone: Tone } {
  switch (outcome) {
    case "pass":
      return { label: "Pass", tone: "success" };
    case "clear":
      return { label: "Clear", tone: "success" };
    case "flag":
      return { label: "Flag", tone: "warning" };
    case "hit":
      return { label: "Match", tone: "danger" };
    case "fail":
      return { label: "Fail", tone: "danger" };
    default:
      return { label: "Pending", tone: "neutral" };
  }
}

export function riskMeta(tier: RiskTier): { label: string; tone: Tone } {
  switch (tier) {
    case "high":
      return { label: "High risk", tone: "danger" };
    case "medium":
      return { label: "Medium risk", tone: "warning" };
    default:
      return { label: "Low risk", tone: "success" };
  }
}

/** Map an ImporterView/SupplierView into a screening Subject. */
export function importerSubject(i: { id: string; name: string; businessName?: string | null; kycStatus: string }): Subject {
  return { id: i.id, name: i.businessName || i.name, kind: "importer", verifiedSeed: i.kycStatus === "verified" };
}

export function supplierSubject(s: { id: string; name: string; validationStatus: string }): Subject {
  return { id: s.id, name: s.name, kind: "supplier", verifiedSeed: s.validationStatus === "validated" };
}
