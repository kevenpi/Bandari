import { Module } from "@nestjs/common";
import { LedgerModule } from "../ledger/ledger.module";
import { ReconciliationService } from "./reconciliation.service";
import { ReconciliationController } from "./reconciliation.controller";

@Module({
  imports: [LedgerModule],
  providers: [ReconciliationService],
  controllers: [ReconciliationController],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
