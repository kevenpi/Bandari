import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ImporterView } from "@bandari/shared";
import { PrismaService } from "../prisma/prisma.service";
import { KycAdapter } from "../adapters/kyc.adapter";
import { toImporterView } from "../customers/mappers";

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kycAdapter: KycAdapter,
  ) {}

  /** Run KYC for an importer, persist the record, and update their status. */
  async runKyc(importerId: string): Promise<ImporterView> {
    const importer = await this.prisma.importer.findUnique({ where: { id: importerId } });
    if (!importer) throw new NotFoundException(`Importer ${importerId} not found`);

    await this.prisma.importer.update({ where: { id: importerId }, data: { kycStatus: "pending" } });
    const result = await this.kycAdapter.verify({
      importerId,
      name: importer.name,
      msisdn: importer.msisdn,
    });

    await this.prisma.kycRecord.create({
      data: {
        importerId,
        provider: result.provider,
        status: result.status,
        raw: (result.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
    const updated = await this.prisma.importer.update({
      where: { id: importerId },
      data: { kycStatus: result.status },
    });
    return toImporterView(updated);
  }

  async ensureVerified(importerId: string): Promise<void> {
    const importer = await this.prisma.importer.findUnique({ where: { id: importerId } });
    if (!importer) throw new NotFoundException(`Importer ${importerId} not found`);
    if (importer.kycStatus !== "verified") {
      // Auto-run KYC on first payment attempt so the gate is explicit but smooth.
      const refreshed = await this.runKyc(importerId);
      if (refreshed.kycStatus !== "verified") {
        throw new NotFoundException(`Importer ${importerId} failed KYC (${refreshed.kycStatus})`);
      }
    }
  }
}
