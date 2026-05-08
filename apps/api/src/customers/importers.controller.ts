import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createImporterSchema } from "@bandari/shared";
import { zodBody } from "../common/zod";
import { CustomersService } from "./customers.service";
import { KycService } from "../kyc/kyc.service";

@Controller("importers")
export class ImportersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly kyc: KycService,
  ) {}

  @Post()
  create(@Body() body: unknown) {
    return this.customers.createImporter(zodBody(createImporterSchema, body));
  }

  @Get()
  list() {
    return this.customers.listImporters();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.customers.getImporter(id);
  }

  @Post(":id/kyc")
  runKyc(@Param("id") id: string) {
    return this.kyc.runKyc(id);
  }
}
