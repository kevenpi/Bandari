import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { createSupplierSchema } from "@bandari/shared";
import { zodBody } from "../common/zod";
import { CustomersService } from "./customers.service";

@Controller("suppliers")
export class SuppliersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  create(@Body() body: unknown) {
    return this.customers.createSupplier(zodBody(createSupplierSchema, body));
  }

  @Get()
  list(@Query("importerId") importerId?: string) {
    return this.customers.listSuppliers(importerId);
  }
}
