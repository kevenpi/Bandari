import { Module } from "@nestjs/common";
import { AdaptersModule } from "../adapters/adapters.module";
import { OrchestrationModule } from "../orchestration/orchestration.module";
import { WebhooksService } from "./webhooks.service";
import { WebhooksController } from "./webhooks.controller";

@Module({
  imports: [AdaptersModule, OrchestrationModule],
  providers: [WebhooksService],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
