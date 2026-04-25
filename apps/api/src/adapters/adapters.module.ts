import { Module } from "@nestjs/common";
import { MpesaAdapter } from "./mpesa.adapter";
import { OnRampAdapter } from "./onramp.adapter";
import { CustodyAdapter } from "./custody.adapter";
import { ChinaPayoutAdapter } from "./china-payout.adapter";
import { KycAdapter } from "./kyc.adapter";

const adapters = [MpesaAdapter, OnRampAdapter, CustodyAdapter, ChinaPayoutAdapter, KycAdapter];

@Module({
  providers: adapters,
  exports: adapters,
})
export class AdaptersModule {}
