import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { toDecimal, type ProbeResult, type Segment } from "@bandari/shared";
import { AppConfigService } from "../config/app-config.service";
import { AdapterError, buildProbe, jitter, type SegmentAdapter } from "./types";

export interface StkPushInput {
  amountMinorKes: number;
  msisdn: string;
  accountRef: string;
  description: string;
  callbackUrl: string;
}
export interface StkPushResult {
  checkoutRequestId: string;
  merchantRequestId?: string;
  mode: "mock" | "live";
  raw: unknown;
}
export interface ParsedCallback {
  checkoutRequestId: string;
  success: boolean;
  resultDesc: string;
  amountMinorKes?: number;
  mpesaReceipt?: string;
  raw: unknown;
}

/** M-Pesa collection via Safaricom Daraja (STK Push). Mock or live sandbox. */
@Injectable()
export class MpesaAdapter implements SegmentAdapter {
  readonly segment: Segment = "mpesa";
  private readonly logger = new Logger("MpesaAdapter");

  constructor(private readonly config: AppConfigService) {}

  private get mode() {
    return this.config.effectiveMode(this.config.mpesa.enabled);
  }

  async initiateStkPush(input: StkPushInput): Promise<StkPushResult> {
    if (this.mode === "live") return this.liveStkPush(input);
    await jitter();
    const checkoutRequestId = `ws_CO_mock_${randomUUID().slice(0, 12)}`;
    return {
      checkoutRequestId,
      merchantRequestId: `mock-${randomUUID().slice(0, 8)}`,
      mode: "mock",
      raw: { simulated: true, amountKes: toDecimal(input.amountMinorKes, "KES"), msisdn: input.msisdn },
    };
  }

  private async liveStkPush(input: StkPushInput): Promise<StkPushResult> {
    const token = await this.getAccessToken();
    const { shortcode, passkey, baseUrl } = this.config.mpesa;
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
    const amount = Math.max(1, Math.round(toDecimal(input.amountMinorKes, "KES")));
    const reqBody = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: input.msisdn,
      PartyB: shortcode,
      PhoneNumber: input.msisdn,
      CallBackURL: input.callbackUrl,
      AccountReference: input.accountRef.slice(0, 12),
      TransactionDesc: input.description.slice(0, 13),
    };
    const res = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(reqBody),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok || json.ResponseCode !== "0") {
      throw new AdapterError(`Daraja STK push failed: ${JSON.stringify(json)}`, json);
    }
    return {
      checkoutRequestId: String(json.CheckoutRequestID),
      merchantRequestId: json.MerchantRequestID ? String(json.MerchantRequestID) : undefined,
      mode: "live",
      raw: json,
    };
  }

  private async getAccessToken(): Promise<string> {
    const { consumerKey, consumerSecret, baseUrl } = this.config.mpesa;
    const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const res = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { authorization: `Basic ${basic}` },
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok || !json.access_token) {
      throw new AdapterError(`Daraja OAuth failed: ${JSON.stringify(json)}`, json);
    }
    return String(json.access_token);
  }

  /** Parse an STK callback payload (Daraja shape) into a normalized result. */
  parseCallback(payload: any): ParsedCallback {
    const cb = payload?.Body?.stkCallback ?? payload?.stkCallback ?? payload;
    const checkoutRequestId = String(cb?.CheckoutRequestID ?? "");
    const resultCode = Number(cb?.ResultCode ?? 1);
    const success = resultCode === 0;
    let amountMinorKes: number | undefined;
    let mpesaReceipt: string | undefined;
    const items = cb?.CallbackMetadata?.Item as Array<{ Name: string; Value: unknown }> | undefined;
    if (items) {
      for (const item of items) {
        if (item.Name === "Amount") amountMinorKes = Math.round(Number(item.Value) * 100);
        if (item.Name === "MpesaReceiptNumber") mpesaReceipt = String(item.Value);
      }
    }
    return {
      checkoutRequestId,
      success,
      resultDesc: String(cb?.ResultDesc ?? ""),
      amountMinorKes,
      mpesaReceipt,
      raw: payload,
    };
  }

  /** Build a mock STK callback payload for offline funding simulation. */
  buildMockCallback(checkoutRequestId: string, amountMinorKes: number): unknown {
    return {
      Body: {
        stkCallback: {
          MerchantRequestID: `mock-${randomUUID().slice(0, 8)}`,
          CheckoutRequestID: checkoutRequestId,
          ResultCode: 0,
          ResultDesc: "The service request is processed successfully.",
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: toDecimal(amountMinorKes, "KES") },
              { Name: "MpesaReceiptNumber", Value: `R${randomUUID().slice(0, 9).toUpperCase()}` },
              { Name: "PhoneNumber", Value: this.config.mpesa.testMsisdn },
            ],
          },
        },
      },
    };
  }

  async healthCheck(): Promise<ProbeResult> {
    return buildProbe(this.segment, "mpesa.healthCheck", this.mode, null, async () => {
      if (this.mode === "live") {
        const token = await this.getAccessToken();
        return { output: { reachable: true, tokenPrefix: token.slice(0, 6) }, message: "Daraja OAuth ok" };
      }
      await jitter();
      return { output: { reachable: true, shortcode: this.config.mpesa.shortcode }, message: "mock ready" };
    });
  }

  async runProbe(): Promise<ProbeResult> {
    const input: StkPushInput = {
      amountMinorKes: 1000_00,
      msisdn: this.config.mpesa.testMsisdn,
      accountRef: "PROBE",
      description: "probe",
      callbackUrl: `${this.config.publicBaseUrl}${this.config.mpesa.callbackPath}`,
    };
    return buildProbe(this.segment, "mpesa.stkPush", this.mode, input, async () => {
      const res = await this.initiateStkPush(input);
      return { output: { checkoutRequestId: res.checkoutRequestId }, request: input, response: res.raw };
    });
  }
}
