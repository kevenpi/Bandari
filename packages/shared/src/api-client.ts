import type { ProbeResult, ReconciliationReport, Segment, SuiteResult } from "./diagnostics.js";
import type {
  CreateImporterInput,
  CreatePaymentInput,
  CreateQuoteInput,
  CreateSupplierInput,
  HealthView,
  ImporterView,
  LedgerEntryView,
  PaymentView,
  QuoteView,
  SupplierView,
} from "./schemas.js";

export interface ClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export class BandariApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "BandariApiError";
  }
}

/**
 * Typed client over the Bandari API. Shared by the web app today and the
 * mobile app later — one source of truth for the contract.
 */
export class BandariClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    const impl = opts.fetch ?? globalThis.fetch;
    if (!impl) {
      throw new Error("No fetch implementation available; pass one via ClientOptions.fetch");
    }
    // Bind to globalThis so the browser doesn't throw "Illegal invocation".
    this.fetchImpl = impl.bind(globalThis);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    let payload: string | undefined;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, { method, headers, body: payload });
    const text = await res.text();
    const parsed = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const message =
        (parsed && (parsed.message || parsed.error)) || `${method} ${path} failed (${res.status})`;
      throw new BandariApiError(res.status, String(message), parsed);
    }
    return parsed as T;
  }

  health() {
    return this.request<HealthView>("GET", "/health");
  }

  // ---- Importers ----
  createImporter(input: CreateImporterInput) {
    return this.request<ImporterView>("POST", "/importers", input);
  }
  listImporters() {
    return this.request<ImporterView[]>("GET", "/importers");
  }
  getImporter(id: string) {
    return this.request<ImporterView>("GET", `/importers/${id}`);
  }
  submitKyc(importerId: string) {
    return this.request<ImporterView>("POST", `/importers/${importerId}/kyc`);
  }

  // ---- Suppliers ----
  createSupplier(input: CreateSupplierInput) {
    return this.request<SupplierView>("POST", "/suppliers", input);
  }
  listSuppliers(importerId?: string) {
    const q = importerId ? `?importerId=${encodeURIComponent(importerId)}` : "";
    return this.request<SupplierView[]>("GET", `/suppliers${q}`);
  }

  // ---- Quotes ----
  createQuote(input: CreateQuoteInput) {
    return this.request<QuoteView>("POST", "/quotes", input);
  }

  // ---- Payments ----
  createPayment(input: CreatePaymentInput) {
    return this.request<PaymentView>("POST", "/payments", input);
  }
  getPayment(id: string) {
    return this.request<PaymentView>("GET", `/payments/${id}`);
  }
  listPayments() {
    return this.request<PaymentView[]>("GET", "/payments");
  }
  retryPayment(id: string) {
    return this.request<PaymentView>("POST", `/payments/${id}/retry`);
  }
  refundPayment(id: string) {
    return this.request<PaymentView>("POST", `/payments/${id}/refund`);
  }
  /** Mock-mode helper to simulate the M-Pesa STK success callback. */
  simulateFunding(id: string) {
    return this.request<PaymentView>("POST", `/payments/${id}/simulate-funding`);
  }

  // ---- Ledger ----
  getLedger(paymentId?: string) {
    const q = paymentId ? `?paymentId=${encodeURIComponent(paymentId)}` : "";
    return this.request<LedgerEntryView[]>("GET", `/ledger${q}`);
  }

  // ---- Verification ----
  runHealthChecks() {
    return this.request<ProbeResult[]>("POST", "/verification/health");
  }
  runProbe(segment: Segment) {
    return this.request<ProbeResult>("POST", `/verification/probe/${segment}`);
  }
  runProbes() {
    return this.request<ProbeResult[]>("POST", "/verification/probes");
  }
  verifyPayment(id: string) {
    return this.request<SuiteResult>("POST", `/verification/payment/${id}`);
  }

  // ---- Reconciliation ----
  getReconciliation() {
    return this.request<ReconciliationReport>("GET", "/reconciliation");
  }
}
