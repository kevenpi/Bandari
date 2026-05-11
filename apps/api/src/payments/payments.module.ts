import { Module } from "@nestjs/common";
import { AdaptersModule } from "../adapters/adapters.module";
import { EventsModule } from "../events/events.module";
import { FxModule } from "../fx/fx.module";
import { KycModule } from "../kyc/kyc.module";
import { OrchestrationModule } from "../orchestration/orchestration.module";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";

@Module({
  imports: [AdaptersModule, EventsModule, FxModule, KycModule, OrchestrationModule],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
