import { Controller, Get } from "@nestjs/common";
import type { HealthView } from "@bandari/shared";
import { AppConfigService } from "./config/app-config.service";

@Controller()
export class HealthController {
  constructor(private readonly config: AppConfigService) {}

  @Get("health")
  health(): HealthView {
    return {
      status: "ok",
      adapterMode: this.config.adapterMode,
      time: new Date().toISOString(),
    };
  }
}
