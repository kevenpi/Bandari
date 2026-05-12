import { Controller, Get } from "@nestjs/common";
import { ReconciliationService } from "./reconciliation.service";

@Controller("reconciliation")
export class ReconciliationController {
  constructor(private readonly recon: ReconciliationService) {}

  @Get()
  run() {
    return this.recon.run();
  }
}
