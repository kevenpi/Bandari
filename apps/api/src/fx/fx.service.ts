import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Quote } from "@prisma/client";
import { bpsOf, convertMinor, toDecimal, toMinor, type QuoteView } from "@bandari/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AppConfigService } from "../config/app-config.service";

type Tx = Prisma.TransactionClient;

@Injectable()
export class FxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Build an all-in quote for sending `sendAmountKes` to a China supplier.
   * The principal converts KES -> USD -> CNY at mid rates; our margin is added
   * as a KES fee on top, so the importer pays all-in and the supplier receives
   * the full converted principal.
   */
  async createQuote(sendAmountKes: number): Promise<QuoteView> {
    if (sendAmountKes <= 0) throw new BadRequestException("sendAmountKes must be positive");

    const { usdKes, usdCny, marginBps, quoteTtlSeconds } = this.config.fx;
    const sendMinorKes = toMinor(sendAmountKes, "KES");
    const usdMinor = convertMinor(sendMinorKes, "KES", "USD", 1 / usdKes);
    const receiveMinorCny = convertMinor(usdMinor, "USD", "CNY", usdCny);
    const feeMinorKes = bpsOf(sendMinorKes, marginBps);
    const allInMinorKes = sendMinorKes + feeMinorKes;
    const expiresAt = new Date(Date.now() + quoteTtlSeconds * 1000);

    const quote = await this.prisma.quote.create({
      data: {
        sendMinorKes,
        usdMinor,
        receiveMinorCny,
        rateKesPerUsd: usdKes,
        rateCnyPerUsd: usdCny,
        marginBps,
        feeMinorKes,
        allInMinorKes,
        expiresAt,
      },
    });
    return this.toView(quote);
  }

  async getQuoteOrThrow(id: string, client: Tx = this.prisma): Promise<Quote> {
    const quote = await client.quote.findUnique({ where: { id } });
    if (!quote) throw new NotFoundException(`Quote ${id} not found`);
    return quote;
  }

  assertUsable(quote: Quote): void {
    if (quote.consumed) throw new BadRequestException(`Quote ${quote.id} already consumed`);
    if (quote.expiresAt.getTime() < Date.now())
      throw new BadRequestException(`Quote ${quote.id} expired`);
  }

  async consume(id: string, client: Tx): Promise<void> {
    await client.quote.update({ where: { id }, data: { consumed: true } });
  }

  toView(quote: Quote): QuoteView {
    return {
      id: quote.id,
      sendAmountKes: toDecimal(quote.sendMinorKes, "KES"),
      sendMinorKes: quote.sendMinorKes,
      usdMinor: quote.usdMinor,
      receiveMinorCny: quote.receiveMinorCny,
      receiveAmountCny: toDecimal(quote.receiveMinorCny, "CNY"),
      rateKesPerUsd: quote.rateKesPerUsd,
      rateCnyPerUsd: quote.rateCnyPerUsd,
      marginBps: quote.marginBps,
      feeMinorKes: quote.feeMinorKes,
      allInMinorKes: quote.allInMinorKes,
      expiresAt: quote.expiresAt.toISOString(),
      createdAt: quote.createdAt.toISOString(),
    };
  }
}
