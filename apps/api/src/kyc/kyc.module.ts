import { Module } from "@nestjs/common";
import { AdaptersModule } from "../adapters/adapters.module";
import { KycService } from "./kyc.service";

@Module({
  imports: [AdaptersModule],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
