import { z } from "zod";
import { CURRENCIES } from "./money.js";
import { PAYMENT_STATUSES } from "./payment-states.js";

export const currencySchema = z.enum(CURRENCIES);
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);

export const kycStatusSchema = z.enum(["unverified", "pending", "verified", "rejected"]);
export type KycStatus = z.infer<typeof kycStatusSchema>;

export const moneySchema = z.object({
  currency: currencySchema,
  amountMinor: z.number().int(),
});

/** Kenyan MSISDN in 2547######## / 2541######## form. */
export const msisdnSchema = z
  .string()
  .regex(/^254(7|1)\d{8}$/, "Expected a Kenyan MSISDN like 2547XXXXXXXX");

// ---- Importer (the customer paying KES) ----
export const createImporterSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  msisdn: msisdnSchema,
  businessName: z.string().min(2).optional(),
});
export type CreateImporterInput = z.infer<typeof createImporterSchema>;

export const importerViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  msisdn: z.string(),
  businessName: z.string().nullable().optional(),
  kycStatus: kycStatusSchema,
  createdAt: z.string(),
});
export type ImporterView = z.infer<typeof importerViewSchema>;

// ---- Supplier (the China-side beneficiary) ----
export const payoutMethodSchema = z.enum(["bank", "alipay"]);
export const createSupplierSchema = z.object({
  importerId: z.string(),
  name: z.string().min(2),
  country: z.string().default("CHN"),
  payoutMethod: payoutMethodSchema,
  accountName: z.string().min(2),
  accountNumber: z.string().min(4),
  bankName: z.string().optional(),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const supplierViewSchema = z.object({
  id: z.string(),
  importerId: z.string(),
  name: z.string(),
  country: z.string(),
  payoutMethod: payoutMethodSchema,
  accountName: z.string(),
  accountNumber: z.string(),
  bankName: z.string().nullable().optional(),
  validationStatus: z.enum(["unvalidated", "validated", "rejected"]),
  createdAt: z.string(),
});
export type SupplierView = z.infer<typeof supplierViewSchema>;

// ---- Quote ----
export const createQuoteSchema = z.object({
  sendAmountKes: z.number().positive(),
});
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export const quoteViewSchema = z.object({
  id: z.string(),
  sendAmountKes: z.number(),
  sendMinorKes: z.number().int(),
  usdMinor: z.number().int(),
  receiveMinorCny: z.number().int(),
  receiveAmountCny: z.number(),
  rateKesPerUsd: z.number(),
  rateCnyPerUsd: z.number(),
  marginBps: z.number().int(),
  feeMinorKes: z.number().int(),
  allInMinorKes: z.number().int(),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type QuoteView = z.infer<typeof quoteViewSchema>;

// ---- Payment ----
export const createPaymentSchema = z.object({
  importerId: z.string(),
  supplierId: z.string(),
  quoteId: z.string(),
  msisdn: msisdnSchema.optional(),
  reference: z.string().max(120).optional(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const paymentEventSchema = z.object({
  id: z.string(),
  paymentId: z.string(),
  type: z.string(),
  fromStatus: paymentStatusSchema.nullable().optional(),
  toStatus: paymentStatusSchema.nullable().optional(),
  message: z.string(),
  data: z.unknown().optional(),
  createdAt: z.string(),
});
export type PaymentEventView = z.infer<typeof paymentEventSchema>;

export const ledgerEntryViewSchema = z.object({
  id: z.string(),
  paymentId: z.string().nullable(),
  account: z.string(),
  currency: currencySchema,
  direction: z.enum(["debit", "credit"]),
  amountMinor: z.number().int(),
  memo: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type LedgerEntryView = z.infer<typeof ledgerEntryViewSchema>;

export const paymentViewSchema = z.object({
  id: z.string(),
  status: paymentStatusSchema,
  importerId: z.string(),
  supplierId: z.string(),
  quoteId: z.string(),
  reference: z.string().nullable().optional(),
  sendMinorKes: z.number().int(),
  usdMinor: z.number().int(),
  usdcMinor: z.number().int().nullable().optional(),
  receiveMinorCny: z.number().int(),
  /** M-Pesa confirmation code captured at funding (demo/mock populates this). */
  mpesaReceipt: z.string().nullable().optional(),
  walletTxHash: z.string().nullable().optional(),
  attestationId: z.string().nullable().optional(),
  settlementId: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  events: z.array(paymentEventSchema).optional(),
});
export type PaymentView = z.infer<typeof paymentViewSchema>;

export const healthSchema = z.object({
  status: z.literal("ok"),
  adapterMode: z.enum(["mock", "live"]),
  time: z.string(),
});
export type HealthView = z.infer<typeof healthSchema>;
