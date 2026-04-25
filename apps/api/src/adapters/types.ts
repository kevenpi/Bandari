import type { AdapterMode, ProbeResult, Segment } from "@bandari/shared";

/** Error raised by an adapter; carries the raw payload for diagnostics. */
export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

/** Every adapter is independently testable via healthCheck() + runProbe(). */
export interface SegmentAdapter {
  readonly segment: Segment;
  /** Auth + reachability of the underlying sandbox/mock. */
  healthCheck(): Promise<ProbeResult>;
  /** Push one canned transaction through just this segment. */
  runProbe(): Promise<ProbeResult>;
}

export interface ProbeBody {
  output?: unknown;
  request?: unknown;
  response?: unknown;
  message?: string;
}

/** Time a probe/health step and build a structured ProbeResult. */
export async function buildProbe(
  segment: Segment,
  name: string,
  mode: AdapterMode,
  input: unknown,
  fn: () => Promise<ProbeBody>,
): Promise<ProbeResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    const body = await fn();
    return {
      segment,
      name,
      outcome: "pass",
      mode,
      startedAt,
      latencyMs: Date.now() - t0,
      input,
      output: body.output,
      request: body.request,
      response: body.response,
      message: body.message,
    };
  } catch (err) {
    const e = err as Error;
    return {
      segment,
      name,
      outcome: "fail",
      mode,
      startedAt,
      latencyMs: Date.now() - t0,
      input,
      error: e.message,
      response: err instanceof AdapterError ? err.raw : undefined,
    };
  }
}

/** Simulate small network latency in mock mode so timings look realistic. */
export function jitter(min = 15, max = 60): Promise<void> {
  const ms = Math.floor(min + Math.random() * (max - min));
  return new Promise((r) => setTimeout(r, ms));
}
