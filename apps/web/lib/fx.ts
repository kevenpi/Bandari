/**
 * Live FX rates for the importer-facing rate card. We make a REAL request to a
 * public FX API (no key required) so the demo shows genuine market rates, then
 * frame Bandari's locked rate against a typical bank rate.
 *
 *  - Settlement currencies on the ECB list (CNY, HKD, …) get a real last-7-days
 *    time series from Frankfurter (api.frankfurter.dev).
 *  - KES is not on the ECB list, so we take the live latest rate from
 *    open.er-api.com and reconstruct a plausible 7-day trend around it (clearly
 *    labelled as indicative).
 *  - If the network is unavailable we fall back to deterministic anchors so the
 *    UI always renders.
 *
 * This is a client-only concern (works in both demo and live modes) and never
 * moves money — it only powers the "we lock rates / talk to banks" story.
 */

export interface FxPoint {
  /** ISO date (yyyy-mm-dd). */
  date: string;
  /** Units of `quote` per 1 `base` (e.g. KES per USD). */
  rate: number;
}

export interface FxHistory {
  base: string;
  quote: string;
  points: FxPoint[];
  market: { min: number; max: number; latest: number; avg: number };
  /** The mid-market rate Bandari locks for the importer (no FX markup). */
  locked: number;
  /** What a typical bank would quote (mid + retail spread). */
  bankRate: number;
  /** Bandari's saving vs the bank, in basis points. */
  savingsBps: number;
  /** Hours the locked rate is held. */
  lockHours: number;
  source: "frankfurter" | "open-er-api" | "fallback";
  /** True when only the latest point is live and the trend is reconstructed. */
  reconstructed: boolean;
  fetchedAt: string;
}

/** Typical retail bank spread for an SME cross-border FX conversion. */
export const BANK_SPREAD_BPS = 250;
const LOCK_HOURS = 24;

/** Mid-market fallbacks (1 USD = N), used only when the network is unavailable. */
const FALLBACK: Record<string, number> = { KES: 129.5, CNY: 7.18, CNH: 7.19, HKD: 7.8, USD: 1 };

/** Quotes Frankfurter (ECB reference rates) can serve a real time series for. */
const FRANKFURTER_QUOTES = new Set(["CNY", "HKD", "USD"]);

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Deterministic PRNG so a reconstructed trend is stable within a day.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Build a `days`-long daily series ending at `latest` with small seeded drift. */
function reconstructSeries(quote: string, latest: number, days: number, seedKey: string): FxPoint[] {
  const rnd = mulberry32(hashStr(`${quote}:${seedKey}`));
  const rel = new Array<number>(days).fill(1);
  for (let i = days - 2; i >= 0; i -= 1) {
    const drift = (rnd() - 0.5) * 0.008; // ±0.4% day over day
    rel[i] = rel[i + 1] * (1 + drift);
  }
  const today = new Date();
  return rel.map((r, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    return { date: ymd(d), rate: round(latest * r) };
  });
}

function buildHistory(
  base: string,
  quote: string,
  points: FxPoint[],
  source: FxHistory["source"],
  reconstructed: boolean,
): FxHistory {
  const rates = points.map((p) => p.rate);
  const latest = rates[rates.length - 1] ?? FALLBACK[quote] ?? 1;
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
  const locked = latest; // we pass through the mid-market rate
  const bankRate = round(latest * (1 + BANK_SPREAD_BPS / 10_000));
  return {
    base,
    quote,
    points,
    market: { min: round(min), max: round(max), latest: round(latest), avg: round(avg) },
    locked: round(locked),
    bankRate,
    savingsBps: BANK_SPREAD_BPS,
    lockHours: LOCK_HOURS,
    source,
    reconstructed,
    fetchedAt: new Date().toISOString(),
  };
}

async function fromFrankfurter(quote: string, days: number): Promise<FxHistory | null> {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days + 4)); // pad for weekends/holidays
  const url = `https://api.frankfurter.dev/v1/${ymd(start)}..${ymd(end)}?base=USD&symbols=${quote}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as { rates?: Record<string, Record<string, number>> };
  const rows = json.rates ?? {};
  const points = Object.keys(rows)
    .sort()
    .map((date) => ({ date, rate: round(rows[date]?.[quote] ?? NaN) }))
    .filter((p) => Number.isFinite(p.rate))
    .slice(-days);
  if (points.length < 2) return null;
  return buildHistory("USD", quote, points, "frankfurter", false);
}

async function fromOpenErApi(quote: string, days: number): Promise<FxHistory | null> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) return null;
  const json = (await res.json()) as { rates?: Record<string, number>; time_last_update_utc?: string };
  const latest = json.rates?.[quote];
  if (typeof latest !== "number") return null;
  const seedKey = json.time_last_update_utc ?? ymd(new Date());
  const points = reconstructSeries(quote, latest, days, seedKey);
  return buildHistory("USD", quote, points, "open-er-api", true);
}

function fallback(quote: string, days: number): FxHistory {
  const anchor = FALLBACK[quote] ?? 1;
  return buildHistory("USD", quote, reconstructSeries(quote, anchor, days, "fallback"), "fallback", true);
}

function cacheKey(quote: string): string {
  return `bandari.fx.${quote}.${ymd(new Date())}`;
}

/**
 * Fetch the last `days` of USD→`quote` rates plus Bandari's locked-rate framing.
 * Cached per day in localStorage so repeat views are instant and stable.
 */
export async function fetchFxHistory(quote = "KES", days = 7): Promise<FxHistory> {
  if (typeof window !== "undefined") {
    try {
      const cached = window.localStorage.getItem(cacheKey(quote));
      if (cached) return JSON.parse(cached) as FxHistory;
    } catch {
      // ignore cache read errors
    }
  }

  let history: FxHistory | null = null;
  try {
    if (FRANKFURTER_QUOTES.has(quote)) history = await fromFrankfurter(quote, days);
    if (!history) history = await fromOpenErApi(quote, days);
  } catch {
    history = null;
  }
  const result = history ?? fallback(quote, days);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(cacheKey(quote), JSON.stringify(result));
    } catch {
      // ignore cache write errors
    }
  }
  return result;
}
