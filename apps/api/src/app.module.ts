import { Module } from "@nestjs/common";
import { AppConfigModule } from "./config/config.module";
import { PrismaModule } from "./prisma/prisma.module";
import { EventsModule } from "./events/events.module";
import { LedgerModule } from "./ledger/ledger.module";
import { FxModule } from "./fx/fx.module";
import { AdaptersModule } from "./adapters/adapters.module";
import { KycModule } from "./kyc/kyc.module";
import { CustomersModule } from "./customers/customers.module";
import { OrchestrationModule } from "./orchestration/orchestration.module";
import { PaymentsModule } from "./payments/payments.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { VerificationModule } from "./verification/verification.module";
import { ReconciliationModule } from "./recon/reconciliation.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    EventsModule,
    LedgerModule,
    FxModule,
    AdaptersModule,
    KycModule,
    CustomersModule,
    OrchestrationModule,
    PaymentsModule,
    WebhooksModule,
    VerificationModule,
    ReconciliationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
