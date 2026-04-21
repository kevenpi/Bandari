import { Body, Controller, Post } from "@nestjs/common";
import { createQuoteSchema } from "@bandari/shared";
import { FxService } from "./fx.service";
import { zodBody } from "../common/zod";

@Controller("quotes")
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Post()
  async create(@Body() body: unknown) {
    const input = zodBody(createQuoteSchema, body);
    return this.fx.createQuote(input.sendAmountKes);
  }
}
