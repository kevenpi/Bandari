import { Module } from "@nestjs/common";
import { AdaptersModule } from "../adapters/adapters.module";
import { LedgerModule } from "../ledger/ledger.module";
import { VerificationService } from "./verification.service";
import { VerificationController } from "./verification.controller";

@Module({
  imports: [AdaptersModule, LedgerModule],
  providers: [VerificationService],
  controllers: [VerificationController],
  exports: [VerificationService],
})
export class VerificationModule {}
