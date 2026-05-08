import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateImporterInput,
  CreateSupplierInput,
  ImporterView,
  SupplierView,
} from "@bandari/shared";
import { PrismaService } from "../prisma/prisma.service";
import { toImporterView, toSupplierView } from "./mappers";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async createImporter(input: CreateImporterInput): Promise<ImporterView> {
    const existing = await this.prisma.importer.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException(`Importer with email ${input.email} already exists`);
    const importer = await this.prisma.importer.create({
      data: {
        name: input.name,
        email: input.email,
        msisdn: input.msisdn,
        businessName: input.businessName,
      },
    });
    return toImporterView(importer);
  }

  async listImporters(): Promise<ImporterView[]> {
    const rows = await this.prisma.importer.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(toImporterView);
  }

  async getImporter(id: string): Promise<ImporterView> {
    const importer = await this.prisma.importer.findUnique({ where: { id } });
    if (!importer) throw new NotFoundException(`Importer ${id} not found`);
    return toImporterView(importer);
  }

  async createSupplier(input: CreateSupplierInput): Promise<SupplierView> {
    const importer = await this.prisma.importer.findUnique({ where: { id: input.importerId } });
    if (!importer) throw new NotFoundException(`Importer ${input.importerId} not found`);
    const supplier = await this.prisma.supplier.create({
      data: {
        importerId: input.importerId,
        name: input.name,
        country: input.country ?? "CHN",
        payoutMethod: input.payoutMethod,
        accountName: input.accountName,
        accountNumber: input.accountNumber,
        bankName: input.bankName,
        // basic format validation: validate immediately in the prototype
        validationStatus: input.accountNumber.length >= 4 ? "validated" : "unvalidated",
      },
    });
    return toSupplierView(supplier);
  }

  async listSuppliers(importerId?: string): Promise<SupplierView[]> {
    const rows = await this.prisma.supplier.findMany({
      where: importerId ? { importerId } : undefined,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toSupplierView);
  }
}
