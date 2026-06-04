import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { convertMinor, toDecimal, type ProbeResult, type Segment } from "@bandari/shared";
import { AppConfigService } from "../config/app-config.service";
import { AdapterError, buildProbe, jitter, type SegmentAdapter } from "./types";

export interface OnRampInput {
  amountMinorKes: number;
  rateKesPerUsd: number;
}
export interface OnRampResult {
  usdcMinor: number;
  providerRef: string;
  mode: "mock" | "live";
  raw: unknown;
}

/**
 * KES -> USDC on-ramp (Swypt / Kotani style). In mock mode it converts at the
 * quoted rate; the live path is left as a structured stub since these providers
 * have no open public testnet.
 */
@Injectable()
export class OnRampAdapter implements SegmentAdapter {
  readonly segment: Segment = "onramp";

  constructor(private readonly config: AppConfigService) {}

  private get mode() {
    return this.config.effectiveMode(this.config.onramp.enabled);
  }

  async convertKesToUsdc(input: OnRampInput): Promise<OnRampResult> {
    if (this.mode === "live") return this.liveConvert(input);
    await jitter(20, 80);
    // USDC has 6 decimals; convert via USD at the quoted KES/USD rate.
    const usdcMinor = convertMinor(input.amountMinorKes, "KES", "USDC", 1 / input.rateKesPerUsd);
    return {
      usdcMinor,
      providerRef: `onramp_mock_${randomUUID().slice(0, 10)}`,
      mode: "mock",
      raw: { simulated: true, asset: "USDC", kes: toDecimal(input.amountMinorKes, "KES"), rate: input.rateKesPerUsd },
    };
  }

  private async liveConvert(input: OnRampInput): Promise<OnRampResult> {
    const { baseUrl, apiKey, provider } = this.config.onramp;
    if (!baseUrl || !apiKey) {
      throw new AdapterError(
        `On-ramp live mode requested but ONRAMP_BASE_URL/ONRAMP_API_KEY missing (provider=${provider})`,
      );
    }
    // Provider-specific call (e.g. Swypt /api/onramp-orders). Shape kept generic.
    const res = await fetch(`${baseUrl}/onramp-orders`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ amountKes: toDecimal(input.amountMinorKes, "KES"), asset: "USDC" }),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new AdapterError(`On-ramp failed: ${JSON.stringify(json)}`, json);
    const usdcMinor =
      typeof json.usdcMinor === "number"
        ? (json.usdcMinor as number)
        : convertMinor(input.amountMinorKes, "KES", "USDC", 1 / input.rateKesPerUsd);
    return { usdcMinor, providerRef: String(json.id ?? json.reference ?? "live"), mode: "live", raw: json };
  }

  async healthCheck(): Promise<ProbeResult> {
    return buildProbe(this.segment, "onramp.healthCheck", this.mode, null, async () => {
      await jitter();
      return { output: { provider: this.config.onramp.provider, reachable: true }, message: `${this.mode} ready` };
    });
  }

  async runProbe(): Promise<ProbeResult> {
    const input: OnRampInput = { amountMinorKes: 1000_00, rateKesPerUsd: this.config.fx.usdKes };
    return buildProbe(this.segment, "onramp.convert", this.mode, input, async () => {
      const res = await this.convertKesToUsdc(input);
      return { output: { usdcMinor: res.usdcMinor, providerRef: res.providerRef }, request: input, response: res.raw };
    });
  }
}
