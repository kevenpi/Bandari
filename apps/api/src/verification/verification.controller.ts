import { Controller, Param, Post } from "@nestjs/common";
import type { Segment } from "@bandari/shared";
import { VerificationService } from "./verification.service";

@Controller("verification")
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Post("health")
  health() {
    return this.verification.healthChecks();
  }

  @Post("probes")
  probes() {
    return this.verification.probes();
  }

  @Post("probe/:segment")
  probe(@Param("segment") segment: Segment) {
    return this.verification.probe(segment);
  }

  @Post("payment/:id")
  verifyPayment(@Param("id") id: string) {
    return this.verification.verifyPayment(id);
  }
}
