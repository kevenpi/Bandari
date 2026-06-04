/**
 * In-browser mock of the Bandari API. Lets the web app run with NO backend —
 * used for the static Vercel demo. All state lives in localStorage; payments
 * progress through the happy path on a wall-clock schedule so the pipeline
 * animates exactly like the real engine.
 *
 * This is demo-only. The real BandariClient (HTTP) is used whenever
 * NEXT_PUBLIC_API_URL is set (see lib/api.ts).
 */
import {
  HAPPY_PATH,
  bpsOf,
  convertMinor,
  isTerminal,
  toDecimal,
  toMinor,
  SEGMENTS,
  type CreateImporterInput,
  type CreatePaymentInput,
  type CreateQuoteInput,
  type CreateSupplierInput,
  type HealthView,
  type ImporterView,
  type LedgerEntryView,
  type PaymentEventView,
  type PaymentStatus,
  type PaymentView,
  type ProbeResult,
  type QuoteView,
  type ReconciliationReport,
  type Segment,
  type SuiteResult,
  type SupplierView,
  type VerifierResult,
} from "@bandari/shared";
import type { BandariApi } from "./api";

// FX config mirrors apps/api .env defaults so quotes match the real engine.
const USD_KES = 129.5;
const USD_CNY = 7.18;
const MARGIN_BPS = 120;
const QUOTE_TTL_SECONDS = 86_400;

// Wall-clock schedule for the in-flight animation (ms between stages).
const STEP_MS = 1300;
const STAGES_AFTER_FUNDED: PaymentStatus[] = [
  "OnRamped",
  "Bridging",
  "Bridged",
  "PayingOut",
  "Settled",
];

const LS_KEY = "bandari.demo.v1";

interface PaymentRecord extends PaymentView {
  /** Epoch ms when M-Pesa funding was simulated; drives the schedule. */
  fundedAt?: number;
}

interface DemoState {
  importers: ImporterView[];
  suppliers: SupplierView[];
  quotes: QuoteView[];
  payments: PaymentRecord[];
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
let seq = 0;
function rid(prefix: string): string {
  seq += 1;
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${seq.toString(36)}`;
}
function iso(ms: number): string {
  return new Date(ms).toISOString();
}
function hexHash(): string {
  let s = "0x";
  for (let i = 0; i < 64; i += 1) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}
function usdcFromUsdMinor(usdMinor: number): number {
  return toMinor(toDecimal(usdMinor, "USD"), "USDC");
}
/** Hong Kong off-ramp: stubbed USD→HKD rate (no real FX call). */
const HK_FX_RATE = 7.8;
function hkdFromUsdMinor(usdMinor: number): string {
  return (toDecimal(usdMinor, "USD") * HK_FX_RATE).toFixed(2);
}
/** A realistic-looking M-Pesa confirmation code, e.g. "SH12AB34CD". */
function mpesaCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 10; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function delay<T>(value: T, ms = 90): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function buildQuote(sendAmountKes: number, atMs = Date.now()): QuoteView {
  const sendMinorKes = toMinor(sendAmountKes, "KES");
  const usdMinor = convertMinor(sendMinorKes, "KES", "USD", 1 / USD_KES);
  const receiveMinorCny = convertMinor(usdMinor, "USD", "CNY", USD_CNY);
  const feeMinorKes = bpsOf(sendMinorKes, MARGIN_BPS);
  const allInMinorKes = sendMinorKes + feeMinorKes;
  return {
    id: rid("quote"),
    sendAmountKes,
    sendMinorKes,
    usdMinor,
    receiveMinorCny,
    receiveAmountCny: toDecimal(receiveMinorCny, "CNY"),
    rateKesPerUsd: USD_KES,
    rateCnyPerUsd: USD_CNY,
    marginBps: MARGIN_BPS,
    feeMinorKes,
    allInMinorKes,
    expiresAt: iso(atMs + QUOTE_TTL_SECONDS * 1000),
    createdAt: iso(atMs),
  };
}

const STAGE_MESSAGE: Record<PaymentStatus, (p: PaymentRecord) => string> = {
  Quoted: () => "Payment created from quote",
  AwaitingFunding: () => "STK push sent (mock); awaiting M-Pesa confirmation",
  Funded: (p) => `Funds collected via M-Pesa · receipt ${p.mpesaReceipt ?? "—"}`,
  OnRamped: (p) => `KES converted to ${toDecimal(p.usdcMinor ?? 0, "USDC").toFixed(2)} USDC (mock)`,
  Bridging: (p) => `USDC transfer submitted (mock) tx=${(p.walletTxHash ?? "").slice(0, 14)}…`,
  Bridged: (p) => `USDC confirmed on-chain (att=${p.attestationId ?? ""})`,
  PayingOut: (p) =>
    `HK off-ramp: USDC → HK$${hkdFromUsdMinor(p.usdMinor)} @ ${HK_FX_RATE.toFixed(2)} (stub); paying supplier`,
  Settled: (p) => `Supplier paid; settlement ${p.settlementId ?? ""}`,
  Failed: () => "Payment failed",
  Refunding: () => "Refund initiated (mock)",
  Refunded: () => "Refund completed to M-Pesa (mock)",
};

/** Apply a single stage transition: set fields, push an event. */
function applyStage(p: PaymentRecord, to: PaymentStatus, atMs: number): void {
  const from = p.status;
  if (to === "Funded" && !p.mpesaReceipt) p.mpesaReceipt = mpesaCode();
  if (to === "OnRamped") p.usdcMinor = usdcFromUsdMinor(p.usdMinor);
  if (to === "Bridging") p.walletTxHash = hexHash();
  if (to === "Bridged") p.attestationId = `att_${Math.random().toString(36).slice(2, 12)}`;
  if (to === "Settled") p.settlementId = `stl_${Math.random().toString(36).slice(2, 12)}`;
  p.status = to;
  p.updatedAt = iso(atMs);
  const ev: PaymentEventView = {
    id: rid("evt"),
    paymentId: p.id,
    type: "transition",
    fromStatus: from,
    toStatus: to,
    message: STAGE_MESSAGE[to](p),
    createdAt: iso(atMs),
  };
  p.events = [...(p.events ?? []), ev];
}

/** Walk the happy path forward from p.status up to (and including) `final`. */
function advanceTo(p: PaymentRecord, final: PaymentStatus, atMs: number, stepMs = 0): void {
  const ci = HAPPY_PATH.indexOf(p.status);
  const ti = HAPPY_PATH.indexOf(final);
  if (ci < 0 || ti < 0) return;
  for (let i = ci + 1; i <= ti; i += 1) {
    applyStage(p, HAPPY_PATH[i]!, atMs + stepMs * (i - ci));
  }
}

/** Advance an in-flight (funded) payment to wherever the wall clock says it is. */
function tick(p: PaymentRecord): boolean {
  if (p.fundedAt == null || isTerminal(p.status)) return false;
  const elapsed = Date.now() - p.fundedAt;
  const steps = Math.min(STAGES_AFTER_FUNDED.length, Math.max(0, Math.floor(elapsed / STEP_MS)));
  const target = steps === 0 ? "Funded" : STAGES_AFTER_FUNDED[steps - 1]!;
  if (HAPPY_PATH.indexOf(target) <= HAPPY_PATH.indexOf(p.status)) return false;
  advanceTo(p, target, Date.now());
  return true;
}

function hasReached(p: PaymentRecord, stage: PaymentStatus): boolean {
  return (
    p.status === stage ||
    (p.events ?? []).some((e) => e.toStatus === stage) ||
    HAPPY_PATH.indexOf(p.status) > HAPPY_PATH.indexOf(stage)
  );
}

function ledgerFor(p: PaymentRecord): LedgerEntryView[] {
  const out: LedgerEntryView[] = [];
  let n = 0;
  const add = (
    account: string,
    currency: LedgerEntryView["currency"],
    direction: "debit" | "credit",
    amountMinor: number,
    memo: string,
  ) => {
    n += 1;
    out.push({
      id: `${p.id}_l${n}`,
      paymentId: p.id,
      account,
      currency,
      direction,
      amountMinor,
      memo,
      createdAt: p.createdAt,
    });
  };
  if (hasReached(p, "Funded")) {
    add("mpesa_collected", "KES", "debit", p.sendMinorKes, "M-Pesa collection");
    add("importer_external", "KES", "credit", p.sendMinorKes, "Importer funds in");
  }
  if (hasReached(p, "OnRamped")) {
    const usdc = p.usdcMinor ?? usdcFromUsdMinor(p.usdMinor);
    add("treasury_usdc", "USDC", "debit", usdc, "On-ramp KES → USDC");
    add("onramp_external", "USD", "credit", p.usdMinor, "On-ramp settlement");
  }
  if (hasReached(p, "Bridged")) {
    const usdc = p.usdcMinor ?? usdcFromUsdMinor(p.usdMinor);
    add("hk_usdc", "USDC", "debit", usdc, "Bridge treasury → HK");
    add("treasury_usdc", "USDC", "credit", usdc, "Bridge out");
  }
  if (hasReached(p, "Settled")) {
    add("payout_external_cny", "CNY", "debit", p.receiveMinorCny, "CNY payout to supplier");
    add("supplier_paid_cny", "CNY", "credit", p.receiveMinorCny, "Supplier paid");
  }
  if (p.status === "Refunded") {
    add("importer_refund_kes", "KES", "debit", p.sendMinorKes, "Refund to importer");
    add("mpesa_collected", "KES", "credit", p.sendMinorKes, "Reverse collection");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
function makeImporter(name: string, email: string, msisdn: string, atMs: number): ImporterView {
  return {
    id: rid("imp"),
    name,
    email,
    msisdn,
    businessName: name,
    kycStatus: "verified",
    createdAt: iso(atMs),
  };
}

function makeSupplier(
  importerId: string,
  name: string,
  method: "bank" | "alipay",
  accountNumber: string,
  bankName: string | null,
  atMs: number,
): SupplierView {
  return {
    id: rid("sup"),
    importerId,
    name,
    country: "CHN",
    payoutMethod: method,
    accountName: name,
    accountNumber,
    bankName,
    validationStatus: "validated",
    createdAt: iso(atMs),
  };
}

/** Build a fully-formed payment already at `status`, with backdated events. */
function makePayment(
  importerId: string,
  supplierId: string,
  sendKes: number,
  status: PaymentStatus,
  createdAtMs: number,
): PaymentRecord {
  const q = buildQuote(sendKes, createdAtMs);
  const p: PaymentRecord = {
    id: rid("pay"),
    status: "Quoted",
    importerId,
    supplierId,
    quoteId: q.id,
    reference: `ws_${Math.random().toString(36).slice(2, 10)}`,
    sendMinorKes: q.sendMinorKes,
    usdMinor: q.usdMinor,
    usdcMinor: null,
    receiveMinorCny: q.receiveMinorCny,
    walletTxHash: null,
    attestationId: null,
    settlementId: null,
    failureReason: null,
    createdAt: iso(createdAtMs),
    updatedAt: iso(createdAtMs),
    events: [],
  };
  applyStage(p, "Quoted", createdAtMs);
  applyStage(p, "AwaitingFunding", createdAtMs + 4_000);

  if (status === "AwaitingFunding") return p;

  if (status === "Refunded") {
    advanceTo(p, "Bridged", createdAtMs + 8_000, 6_000);
    const t = createdAtMs + 60_000;
    applyStage(p, "Refunding" as PaymentStatus, t);
    applyStage(p, "Refunded" as PaymentStatus, t + 8_000);
    return p;
  }

  if (status === "Failed") {
    const t = createdAtMs + 8_000;
    p.failureReason = "KYC review required (mock)";
    applyStage(p, "Failed" as PaymentStatus, t);
    return p;
  }

  // Any happy-path status (Funded..Settled): replay up to it.
  p.fundedAt = createdAtMs + 8_000;
  advanceTo(p, status, createdAtMs + 8_000, 6_000);
  return p;
}

function seed(): DemoState {
  const now = Date.now();
  const day = 86_400_000;

  const imp1 = makeImporter("Demo Importer Ltd", "demo@bandari.test", "254708374149", now - 30 * day);
  const imp2 = makeImporter("Nairobi Traders Ltd", "ops@nairobitraders.test", "254711222333", now - 18 * day);
  // A fresh importer who hasn't been verified yet — drives the onboarding demo.
  const imp3 = makeImporter("Mombasa Imports Ltd", "newco@bandari.test", "254700111222", now - 1 * day);
  imp3.kycStatus = "unverified";

  const sup1 = makeSupplier(imp1.id, "Shenzhen Widgets Co.", "bank", "6222020200000000000", "ICBC", now - 29 * day);
  const sup2 = makeSupplier(imp1.id, "Guangzhou Textiles Ltd", "alipay", "138****8899", null, now - 20 * day);
  const sup3 = makeSupplier(imp2.id, "Yiwu Hardware Co.", "bank", "6217000010000000001", "Bank of China", now - 17 * day);
  // A beneficiary that trips sanctions screening — sits in the ops review queue.
  const sup4 = makeSupplier(imp1.id, "Crimea Metals Trading Co.", "bank", "6225000020000000002", "Sevmash Bank", now - 2 * day);
  sup4.validationStatus = "unvalidated";

  const payments: PaymentRecord[] = [
    makePayment(imp1.id, sup1.id, 50_000, "Settled", now - 6 * day),
    makePayment(imp1.id, sup2.id, 84_500, "Settled", now - 3 * day),
    makePayment(imp1.id, sup1.id, 120_000, "AwaitingFunding", now - 2 * 3_600_000),
    makePayment(imp1.id, sup2.id, 30_000, "Refunded", now - 4 * day),
    makePayment(imp2.id, sup3.id, 96_000, "Settled", now - 5 * day),
    makePayment(imp2.id, sup3.id, 45_000, "AwaitingFunding", now - 3_600_000),
  ];

  return {
    importers: [imp1, imp2, imp3],
    suppliers: [sup1, sup2, sup3, sup4],
    quotes: [],
    payments,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
function load(): DemoState {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as DemoState;
  } catch {
    // fall through to fresh seed
  }
  const fresh = seed();
  save(fresh);
  return fresh;
}

function save(state: DemoState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // ignore quota/serialization issues in the demo
  }
}

// ---------------------------------------------------------------------------
// The mock client
// ---------------------------------------------------------------------------
export class MockClient implements BandariApi {
  private read(): DemoState {
    const state = load();
    let changed = false;
    for (const p of state.payments) {
      if (tick(p)) changed = true;
    }
    if (changed) save(state);
    return state;
  }

  private findPayment(state: DemoState, id: string): PaymentRecord {
    const p = state.payments.find((x) => x.id === id);
    if (!p) throw new Error(`Payment ${id} not found`);
    return p;
  }

  // ---- health ----
  health(): Promise<HealthView> {
    return delay({ status: "ok", adapterMode: "mock", time: new Date().toISOString() });
  }

  // ---- Importers ----
  listImporters(): Promise<ImporterView[]> {
    return delay(this.read().importers);
  }
  getImporter(id: string): Promise<ImporterView> {
    const imp = this.read().importers.find((i) => i.id === id);
    if (!imp) return Promise.reject(new Error(`Importer ${id} not found`));
    return delay(imp);
  }
  createImporter(input: CreateImporterInput): Promise<ImporterView> {
    const state = this.read();
    const imp = makeImporter(input.name, input.email, input.msisdn, Date.now());
    if (input.businessName) imp.businessName = input.businessName;
    // New importers must complete KYC/AML on their profile before sending.
    imp.kycStatus = "unverified";
    state.importers.push(imp);
    save(state);
    return delay(imp);
  }
  submitKyc(importerId: string): Promise<ImporterView> {
    const state = this.read();
    const imp = state.importers.find((i) => i.id === importerId);
    if (!imp) return Promise.reject(new Error(`Importer ${importerId} not found`));
    imp.kycStatus = "verified";
    save(state);
    return delay(imp);
  }

  // ---- Suppliers ----
  createSupplier(input: CreateSupplierInput): Promise<SupplierView> {
    const state = this.read();
    const sup = makeSupplier(
      input.importerId,
      input.name,
      input.payoutMethod,
      input.accountNumber,
      input.bankName ?? null,
      Date.now(),
    );
    sup.accountName = input.accountName;
    // New beneficiaries are screened by Bandari before payout (compliance lib).
    sup.validationStatus = "unvalidated";
    state.suppliers.push(sup);
    save(state);
    return delay(sup);
  }
  listSuppliers(importerId?: string): Promise<SupplierView[]> {
    const all = this.read().suppliers;
    return delay(importerId ? all.filter((s) => s.importerId === importerId) : all);
  }

  // ---- Quotes ----
  createQuote(input: CreateQuoteInput): Promise<QuoteView> {
    const state = this.read();
    const q = buildQuote(input.sendAmountKes);
    state.quotes.push(q);
    save(state);
    return delay(q);
  }

  // ---- Payments ----
  createPayment(input: CreatePaymentInput): Promise<PaymentView> {
    const state = this.read();
    const quote = state.quotes.find((q) => q.id === input.quoteId);
    const now = Date.now();
    const sendKes = quote ? quote.sendAmountKes : 50_000;
    const p = makePayment(input.importerId, input.supplierId, sendKes, "AwaitingFunding", now);
    if (input.reference) p.reference = input.reference;
    state.payments.push(p);
    save(state);
    return delay(this.strip(p));
  }
  getPayment(id: string): Promise<PaymentView> {
    const state = this.read();
    return delay(this.strip(this.findPayment(state, id)));
  }
  listPayments(): Promise<PaymentView[]> {
    const list = [...this.read().payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return delay(list.map((p) => this.strip(p)));
  }
  retryPayment(id: string): Promise<PaymentView> {
    const state = this.read();
    const p = this.findPayment(state, id);
    if (!isTerminal(p.status) && p.fundedAt == null && p.status !== "AwaitingFunding") {
      p.fundedAt = Date.now();
    }
    save(state);
    return delay(this.strip(p));
  }
  refundPayment(id: string): Promise<PaymentView> {
    const state = this.read();
    const p = this.findPayment(state, id);
    if (!isTerminal(p.status)) {
      const t = Date.now();
      p.fundedAt = undefined;
      p.failureReason = null;
      applyStage(p, "Refunding" as PaymentStatus, t);
      applyStage(p, "Refunded" as PaymentStatus, t + 600);
      save(state);
    }
    return delay(this.strip(p));
  }
  simulateFunding(id: string): Promise<PaymentView> {
    const state = this.read();
    const p = this.findPayment(state, id);
    if (p.status === "AwaitingFunding") {
      p.fundedAt = Date.now();
      applyStage(p, "Funded", Date.now());
      save(state);
    }
    return delay(this.strip(p));
  }

  // ---- Ledger ----
  getLedger(paymentId?: string): Promise<LedgerEntryView[]> {
    const state = this.read();
    const ps = paymentId
      ? state.payments.filter((p) => p.id === paymentId)
      : state.payments;
    return delay(ps.flatMap((p) => ledgerFor(p)));
  }

  // ---- Verification (deterministic, all green in the demo) ----
  runHealthChecks(): Promise<ProbeResult[]> {
    return delay(SEGMENTS.map((seg) => this.probe(seg, "healthCheck")));
  }
  runProbe(segment: Segment): Promise<ProbeResult> {
    return delay(this.probe(segment, "probe"));
  }
  runProbes(): Promise<ProbeResult[]> {
    return delay(SEGMENTS.map((seg) => this.probe(seg, "probe")));
  }
  verifyPayment(id: string): Promise<SuiteResult> {
    const state = this.read();
    const p = this.findPayment(state, id);
    const reached = HAPPY_PATH.filter((s) => hasReached(p, s));
    const verifiers: VerifierResult[] = reached.map((stage) => ({
      stage,
      name: `${stage} verifier`,
      outcome: "pass",
      expected: "balanced + valid transition",
      actual: "balanced + valid transition",
      message: `Stage ${stage} checks passed (mock).`,
    }));
    const probes = SEGMENTS.map((seg) => this.probe(seg, "probe"));
    return delay({
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      mode: "mock",
      probes,
      verifiers,
      passed: true,
    });
  }

  // ---- Reconciliation ----
  getReconciliation(): Promise<ReconciliationReport> {
    const payments = this.read().payments;
    return delay({
      checkedAt: new Date().toISOString(),
      totalPayments: payments.length,
      balancedPayments: payments.length,
      imbalances: [],
      accountBalances: [
        { account: "treasury_usdc", currency: "USDC", netMinor: 0 },
        { account: "hk_usdc", currency: "USDC", netMinor: 0 },
      ],
      ok: true,
    });
  }

  // ---- internals ----
  private probe(segment: Segment, kind: string): ProbeResult {
    return {
      segment,
      name: `${segment} ${kind}`,
      outcome: "pass",
      mode: "mock",
      startedAt: new Date().toISOString(),
      latencyMs: 8 + Math.floor(Math.random() * 40),
      message: "ok (mock)",
    };
  }

  /** Drop the internal `fundedAt` field before handing a record to the UI. */
  private strip(p: PaymentRecord): PaymentView {
    const { fundedAt: _fundedAt, ...view } = p;
    return view;
  }
}
