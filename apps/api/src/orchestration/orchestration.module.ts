import { Module } from "@nestjs/common";
import { AdaptersModule } from "../adapters/adapters.module";
import { EventsModule } from "../events/events.module";
import { LedgerModule } from "../ledger/ledger.module";
import { PaymentEngine } from "../payments/payment-engine.service";
import { OrchestratorService } from "./orchestrator.service";

@Module({
  imports: [AdaptersModule, EventsModule, LedgerModule],
  providers: [PaymentEngine, OrchestratorService],
  exports: [PaymentEngine, OrchestratorService],
})
export class OrchestrationModule {}
