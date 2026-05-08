import { Module } from "@nestjs/common";
import { KycModule } from "../kyc/kyc.module";
import { CustomersService } from "./customers.service";
import { ImportersController } from "./importers.controller";
import { SuppliersController } from "./suppliers.controller";

@Module({
  imports: [KycModule],
  providers: [CustomersService],
  controllers: [ImportersController, SuppliersController],
  exports: [CustomersService],
})
export class CustomersModule {}
