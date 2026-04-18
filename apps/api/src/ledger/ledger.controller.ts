import { Controller, Get, Query } from "@nestjs/common";
import { LedgerService } from "./ledger.service";

@Controller("ledger")
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get()
  async list(@Query("paymentId") paymentId?: string) {
    const entries = await this.ledger.list(paymentId);
    return entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }));
  }

  @Get("balances")
  async balances(@Query("paymentId") paymentId: string) {
    return this.ledger.balancesByCurrency(paymentId);
  }
}
