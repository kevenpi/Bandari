import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { toDecimal, type ProbeResult, type Segment } from "@bandari/shared";
import { AppConfigService } from "../config/app-config.service";
import { AdapterError, buildProbe, jitter, type SegmentAdapter } from "./types";

export interface Beneficiary {
  name: string;
  country: string;
  payoutMethod: "bank" | "alipay";
  accountName: string;
  accountNumber: string;
  bankName?: string;
}
export interface PayoutInput {
  amountUsdcMinor: number;
  cnyMinor: number;
  beneficiary: Beneficiary;
}
export interface HkFxQuote {
  hkdMinor: number;
  rate: number;
}
export interface PayoutCreateResult {
  payoutId: string;
  /** Stubbed Hong Kong USD->HKD off-ramp quote applied before the local payout. */
  hkFx?: HkFxQuote;
  mode: "mock" | "live";
  raw: unknown;
}

/** Fixed HKD peg (USD ~7.80). Stands in for a licensed HK FX/off-ramp API. */
const HK_FX_RATE = 7.8;
function hkFxQuote(amountUsdcMinor: number): HkFxQuote {
  // USDC has 6 decimals; HKD has 2.
  const hkdMinor = Math.round((amountUsdcMinor / 1e6) * HK_FX_RATE * 100);
  return { hkdMinor, rate: HK_FX_RATE };
}
export interface PayoutConfirmResult {
  settled: boolean;
  settlementId?: string;
  mode: "mock" | "live";
  raw: unknown;
}

/**
 * HK -> CNY payout (Yativo-shaped). Funded from a USDC wallet; a licensed HK/
 * China partner converts to CNY and pays the supplier via local bank/Alipay.
 * Simulated here (no public testnet) behind a production-shaped interface.
 */
@Injectable()
export class ChinaPayoutAdapter implements SegmentAdapter {
  readonly segment: Segment = "china-payout";

  constructor(private readonly config: AppConfigService) {}

  private get mode() {
    return this.config.effectiveMode(this.config.chinaPayout.enabled);
  }

  async createPayout(input: PayoutInput): Promise<PayoutCreateResult> {
    if (this.mode === "live") return this.livePayout(input, "create");
    await jitter(25, 80);
    // Stubbed HK off-ramp: USDT(USDC) -> HKD before the local payout leg.
    const hkFx = hkFxQuote(input.amountUsdcMinor);
    return {
      payoutId: `payout_mock_${randomUUID().slice(0, 12)}`,
      hkFx,
      mode: "mock",
      raw: {
        simulated: true,
        usdt: toDecimal(input.amountUsdcMinor, "USDC"),
        hkFx: { hkd: hkFx.hkdMinor / 100, rate: hkFx.rate },
        cny: toDecimal(input.cnyMinor, "CNY"),
        beneficiary: input.beneficiary.name,
        method: input.beneficiary.payoutMethod,
      },
    };
  }

  async confirmPayout(payoutId: string): Promise<PayoutConfirmResult> {
    if (this.mode === "live") {
      const r = await this.livePayout({ payoutId } as any, "confirm");
      return { settled: true, settlementId: r.payoutId, mode: "live", raw: r.raw };
    }
    await jitter(25, 80);
    return {
      settled: true,
      settlementId: `stl_${randomUUID().slice(0, 14)}`,
      mode: "mock",
      raw: { simulated: true, payoutId },
    };
  }

  private async livePayout(input: any, phase: "create" | "confirm"): Promise<PayoutCreateResult> {
    const { baseUrl, apiKey } = this.config.chinaPayout;
    if (!baseUrl || !apiKey) {
      throw new AdapterError("China payout live mode requires CHINA_PAYOUT_BASE_URL/CHINA_PAYOUT_API_KEY");
    }
    const path = phase === "create" ? "/wallet/payout" : `/payouts/${input.payoutId}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method: phase === "create" ? "POST" : "GET",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: phase === "create" ? JSON.stringify(input) : undefined,
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new AdapterError(`China payout failed: ${JSON.stringify(json)}`, json);
    return { payoutId: String(json.id ?? input.payoutId ?? "live"), mode: "live", raw: json };
  }

  async healthCheck(): Promise<ProbeResult> {
    return buildProbe(this.segment, "china-payout.healthCheck", this.mode, null, async () => {
      await jitter();
      return { output: { reachable: true }, message: `${this.mode} ready` };
    });
  }

  async runProbe(): Promise<ProbeResult> {
    const input: PayoutInput = {
      amountUsdcMinor: 10_000000,
      cnyMinor: 71_80,
      beneficiary: {
        name: "Probe Supplier Co.",
        country: "CHN",
        payoutMethod: "bank",
        accountName: "Probe Supplier Co.",
        accountNumber: "6222020000000000000",
        bankName: "ICBC",
      },
    };
    return buildProbe(this.segment, "china-payout.payout", this.mode, input, async () => {
      const created = await this.createPayout(input);
      const confirmed = await this.confirmPayout(created.payoutId);
      return {
        output: { payoutId: created.payoutId, settlementId: confirmed.settlementId },
        request: input,
        response: { create: created.raw, confirm: confirmed.raw },
      };
    });
  }
}
