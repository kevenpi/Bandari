import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { KycStatus, ProbeResult, Segment } from "@bandari/shared";
import { AppConfigService } from "../config/app-config.service";
import { AdapterError, buildProbe, jitter, type SegmentAdapter } from "./types";

export interface KycVerifyInput {
  importerId: string;
  name: string;
  msisdn: string;
}
export interface KycVerifyResult {
  status: KycStatus;
  provider: string;
  mode: "mock" | "live";
  raw: unknown;
}

/**
 * KYC/KYB gate. Stub provider auto-verifies (unless the name contains REJECT,
 * to exercise the rejection branch). Smile ID sandbox can drop in via live mode.
 */
@Injectable()
export class KycAdapter implements SegmentAdapter {
  readonly segment: Segment = "kyc";

  constructor(private readonly config: AppConfigService) {}

  private get mode() {
    return this.config.effectiveMode(this.config.kyc.enabled);
  }

  async verify(input: KycVerifyInput): Promise<KycVerifyResult> {
    if (this.mode === "live") return this.liveVerify(input);
    await jitter();
    const rejected = /reject/i.test(input.name);
    return {
      status: rejected ? "rejected" : "verified",
      provider: this.config.kyc.provider,
      mode: "mock",
      raw: { simulated: true, checks: ["identity", "sanctions_screen"], rejected },
    };
  }

  private async liveVerify(input: KycVerifyInput): Promise<KycVerifyResult> {
    const { baseUrl, apiKey, provider } = this.config.kyc;
    if (!baseUrl || !apiKey) {
      throw new AdapterError(`KYC live mode requires KYC_BASE_URL/KYC_API_KEY (provider=${provider})`);
    }
    const res = await fetch(`${baseUrl}/verify`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ name: input.name, phone: input.msisdn }),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new AdapterError(`KYC failed: ${JSON.stringify(json)}`, json);
    const ok = json.status === "approved" || json.verified === true;
    return { status: ok ? "verified" : "rejected", provider, mode: "live", raw: json };
  }

  async healthCheck(): Promise<ProbeResult> {
    return buildProbe(this.segment, "kyc.healthCheck", this.mode, null, async () => {
      await jitter();
      return { output: { provider: this.config.kyc.provider, reachable: true }, message: `${this.mode} ready` };
    });
  }

  async runProbe(): Promise<ProbeResult> {
    const input: KycVerifyInput = { importerId: `probe-${randomUUID().slice(0, 6)}`, name: "Probe Importer", msisdn: this.config.mpesa.testMsisdn };
    return buildProbe(this.segment, "kyc.verify", this.mode, input, async () => {
      const res = await this.verify(input);
      return { output: { status: res.status }, request: input, response: res.raw };
    });
  }
}
