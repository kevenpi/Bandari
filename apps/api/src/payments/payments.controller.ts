import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createPaymentSchema } from "@bandari/shared";
import { zodBody } from "../common/zod";
import { PaymentsService } from "./payments.service";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  create(@Body() body: unknown) {
    return this.payments.create(zodBody(createPaymentSchema, body));
  }

  @Get()
  list() {
    return this.payments.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.payments.get(id);
  }

  @Post(":id/simulate-funding")
  simulateFunding(@Param("id") id: string) {
    return this.payments.simulateFunding(id);
  }

  @Post(":id/retry")
  retry(@Param("id") id: string) {
    return this.payments.retry(id);
  }

  @Post(":id/refund")
  refund(@Param("id") id: string) {
    return this.payments.refund(id);
  }
}
