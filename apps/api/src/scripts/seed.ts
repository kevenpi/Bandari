/** Seed a demo importer + supplier (idempotent). Run with: pnpm db:seed */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const importer = await prisma.importer.upsert({
    where: { email: "demo@bandari.test" },
    update: {},
    create: {
      name: "Demo Importer Ltd",
      email: "demo@bandari.test",
      msisdn: "254708374149",
      businessName: "Demo Importer Ltd",
      kycStatus: "verified",
    },
  });

  const existing = await prisma.supplier.findFirst({ where: { importerId: importer.id } });
  if (!existing) {
    await prisma.supplier.create({
      data: {
        importerId: importer.id,
        name: "Shenzhen Widgets Co.",
        country: "CHN",
        payoutMethod: "bank",
        accountName: "Shenzhen Widgets Co.",
        accountNumber: "6222020200000000000",
        bankName: "ICBC",
        validationStatus: "validated",
      },
    });
  }
  console.log(`Seeded importer ${importer.id} (demo@bandari.test) with a supplier.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
