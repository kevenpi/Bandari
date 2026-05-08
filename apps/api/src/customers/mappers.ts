import type { Importer, Supplier } from "@prisma/client";
import type { ImporterView, SupplierView } from "@bandari/shared";

export function toImporterView(i: Importer): ImporterView {
  return {
    id: i.id,
    name: i.name,
    email: i.email,
    msisdn: i.msisdn,
    businessName: i.businessName,
    kycStatus: i.kycStatus,
    createdAt: i.createdAt.toISOString(),
  };
}

export function toSupplierView(s: Supplier): SupplierView {
  return {
    id: s.id,
    importerId: s.importerId,
    name: s.name,
    country: s.country,
    payoutMethod: s.payoutMethod,
    accountName: s.accountName,
    accountNumber: s.accountNumber,
    bankName: s.bankName,
    validationStatus: s.validationStatus,
    createdAt: s.createdAt.toISOString(),
  };
}
