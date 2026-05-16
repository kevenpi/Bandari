"use client";

import {
  BandariClient,
  type CreateImporterInput,
  type CreatePaymentInput,
  type CreateQuoteInput,
  type CreateSupplierInput,
  type HealthView,
  type ImporterView,
  type LedgerEntryView,
  type PaymentView,
  type ProbeResult,
  type QuoteView,
  type ReconciliationReport,
  type Segment,
  type SuiteResult,
  type SupplierView,
} from "@bandari/shared";
import { MockClient } from "./mock-client";

/**
 * The public API surface used across the web app. Both the real HTTP client
 * (`BandariClient`) and the in-browser demo (`MockClient`) satisfy this, so
 * call sites don't care which is wired in.
 */
export interface BandariApi {
  health(): Promise<HealthView>;
  listImporters(): Promise<ImporterView[]>;
  getImporter(id: string): Promise<ImporterView>;
  createImporter(input: CreateImporterInput): Promise<ImporterView>;
  submitKyc(importerId: string): Promise<ImporterView>;
  createSupplier(input: CreateSupplierInput): Promise<SupplierView>;
  listSuppliers(importerId?: string): Promise<SupplierView[]>;
  createQuote(input: CreateQuoteInput): Promise<QuoteView>;
  createPayment(input: CreatePaymentInput): Promise<PaymentView>;
  getPayment(id: string): Promise<PaymentView>;
  listPayments(): Promise<PaymentView[]>;
  retryPayment(id: string): Promise<PaymentView>;
  refundPayment(id: string): Promise<PaymentView>;
  simulateFunding(id: string): Promise<PaymentView>;
  getLedger(paymentId?: string): Promise<LedgerEntryView[]>;
  runHealthChecks(): Promise<ProbeResult[]>;
  runProbe(segment: Segment): Promise<ProbeResult>;
  runProbes(): Promise<ProbeResult[]>;
  verifyPayment(id: string): Promise<SuiteResult>;
  getReconciliation(): Promise<ReconciliationReport>;
}

const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Demo mode runs entirely in the browser against a mock (no backend). It's on
 * when explicitly requested, or whenever no API URL is configured — which is
 * the case for the static Vercel deploy.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !RAW_API_URL;

export const API_URL = RAW_API_URL ?? "http://localhost:4000";

let client: BandariApi | null = null;

export function api(): BandariApi {
  if (!client) {
    client = DEMO_MODE ? new MockClient() : new BandariClient({ baseUrl: API_URL });
  }
  return client;
}
