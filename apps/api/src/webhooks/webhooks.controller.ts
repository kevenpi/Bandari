import { Body, Controller, Post } from "@nestjs/common";
import { WebhooksService } from "./webhooks.service";

@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  // Matches MPESA_CALLBACK_PATH (/webhooks/mpesa/stk).
  @Post("mpesa/stk")
  mpesaStk(@Body() body: unknown) {
    return this.webhooks.handleMpesaStk(body);
  }

  @Post("circle")
  circle(@Body() body: unknown) {
    return this.webhooks.handleCircle(body);
  }
}
