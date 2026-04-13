/**
 * Structured results emitted by segment probes and stage verifiers.
 * Deterministic checks decide pass/fail; no AI is embedded in the product.
 */

export const SEGMENTS = ["mpesa", "onramp", "custody", "china-payout", "kyc"] as const;
export type Segment = (typeof SEGMENTS)[number];

export type AdapterMode = "mock" | "live";
export type Outcome = "pass" | "fail" | "skip";

export interface ProbeResult {
  segment: Segment;
  name: string;
  outcome: Outcome;
  mode: AdapterMode;
  startedAt: string;
  latencyMs: number;
  /** What we sent into the segment. */
  input?: unknown;
  /** What the segment returned. */
  output?: unknown;
  /** Raw adapter request/response payloads for transparency. */
  request?: unknown;
  response?: unknown;
  error?: string;
  message?: string;
}

export interface VerifierResult {
  /** The state-machine stage / transition this verifier guards. */
  stage: string;
  name: string;
  outcome: Outcome;
  expected: unknown;
  actual: unknown;
  /** Human-readable explanation of the pass/fail (deterministic, not AI). */
  message: string;
  details?: Record<string, unknown>;
}

export interface SuiteResult {
  startedAt: string;
  finishedAt: string;
  mode: AdapterMode;
  probes: ProbeResult[];
  verifiers: VerifierResult[];
  passed: boolean;
}

/** Output of the reconciliation job: proves every payment + account nets to zero. */
export interface ReconciliationReport {
  checkedAt: string;
  totalPayments: number;
  balancedPayments: number;
  imbalances: Array<{ paymentId: string; currency: string; netMinor: number }>;
  accountBalances: Array<{ account: string; currency: string; netMinor: number }>;
  ok: boolean;
}

export function summarize(suite: SuiteResult): string {
  const probePass = suite.probes.filter((p) => p.outcome === "pass").length;
  const verPass = suite.verifiers.filter((v) => v.outcome === "pass").length;
  return [
    `mode=${suite.mode}`,
    `probes ${probePass}/${suite.probes.length} pass`,
    `verifiers ${verPass}/${suite.verifiers.length} pass`,
    suite.passed ? "RESULT: PASS" : "RESULT: FAIL",
  ].join("  |  ");
}
