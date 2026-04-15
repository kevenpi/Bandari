import { Injectable } from "@nestjs/common";

export type AdapterMode = "mock" | "live";
export type OrchestratorMode = "bullmq" | "inline";
export type CustodyProvider = "mock" | "evm" | "circle";

function bool(v: string | undefined, def = false): boolean {
  if (v === undefined) return def;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}
function num(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export interface MpesaConfig {
  enabled: boolean;
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackPath: string;
  testMsisdn: string;
}
export interface CircleConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  entitySecret: string;
  walletSetId: string;
  treasuryWalletId: string;
  hkWalletId: string;
  blockchain: string;
}
export interface EvmConfig {
  rpcUrl: string;
  chainId: number;
  chainName: string;
  usdcAddress: string;
  explorerBase: string;
  treasuryPrivateKey: string;
  hkAddress: string;
  confirmations: number;
  confirmTimeoutMs: number;
}
export interface OnRampConfig {
  enabled: boolean;
  provider: string;
  baseUrl: string;
  apiKey: string;
}
export interface ChinaPayoutConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
}
export interface KycConfig {
  enabled: boolean;
  provider: string;
  baseUrl: string;
  apiKey: string;
}
export interface FxConfig {
  usdKes: number;
  usdCny: number;
  marginBps: number;
  quoteTtlSeconds: number;
}

@Injectable()
export class AppConfigService {
  readonly nodeEnv = process.env.NODE_ENV ?? "development";
  readonly port = num(process.env.API_PORT, 4000);
  readonly publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${this.port}`;
  readonly databaseUrl = process.env.DATABASE_URL ?? "";
  readonly redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  readonly adapterMode: AdapterMode = process.env.ADAPTER_MODE === "live" ? "live" : "mock";
  readonly orchestrator: OrchestratorMode =
    process.env.ORCHESTRATOR === "inline" ? "inline" : "bullmq";
  readonly custodyProvider: CustodyProvider = ((): CustodyProvider => {
    const p = (process.env.CUSTODY_PROVIDER ?? "mock").toLowerCase();
    return p === "evm" || p === "circle" ? p : "mock";
  })();

  readonly mpesa: MpesaConfig = {
    enabled: bool(process.env.MPESA_ENABLED),
    baseUrl: process.env.MPESA_BASE_URL ?? "https://sandbox.safaricom.co.ke",
    consumerKey: process.env.MPESA_CONSUMER_KEY ?? "",
    consumerSecret: process.env.MPESA_CONSUMER_SECRET ?? "",
    shortcode: process.env.MPESA_SHORTCODE ?? "600584",
    passkey: process.env.MPESA_PASSKEY ?? "",
    callbackPath: process.env.MPESA_CALLBACK_PATH ?? "/webhooks/mpesa/stk",
    testMsisdn: process.env.MPESA_TEST_MSISDN ?? "254708374149",
  };

  readonly circle: CircleConfig = {
    enabled: bool(process.env.CIRCLE_ENABLED),
    baseUrl: process.env.CIRCLE_BASE_URL ?? "https://api.circle.com",
    apiKey: process.env.CIRCLE_API_KEY ?? "",
    entitySecret: process.env.CIRCLE_ENTITY_SECRET ?? "",
    walletSetId: process.env.CIRCLE_WALLET_SET_ID ?? "",
    treasuryWalletId: process.env.CIRCLE_TREASURY_WALLET_ID ?? "",
    hkWalletId: process.env.CIRCLE_HK_WALLET_ID ?? "",
    blockchain: process.env.CIRCLE_BLOCKCHAIN ?? "BASE-SEPOLIA",
  };

  readonly evm: EvmConfig = {
    rpcUrl: process.env.EVM_RPC_URL ?? "https://sepolia.base.org",
    chainId: num(process.env.EVM_CHAIN_ID, 84532),
    chainName: process.env.EVM_CHAIN_NAME ?? "base-sepolia",
    // Circle-issued testnet USDC on Base Sepolia.
    usdcAddress: process.env.EVM_USDC_ADDRESS ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    explorerBase: process.env.EVM_EXPLORER_BASE ?? "https://sepolia.basescan.org",
    treasuryPrivateKey: process.env.EVM_TREASURY_PRIVATE_KEY ?? "",
    hkAddress: process.env.EVM_HK_ADDRESS ?? "",
    confirmations: num(process.env.EVM_CONFIRMATIONS, 1),
    confirmTimeoutMs: num(process.env.EVM_CONFIRM_TIMEOUT_MS, 120_000),
  };

  readonly onramp: OnRampConfig = {
    enabled: bool(process.env.ONRAMP_ENABLED),
    provider: process.env.ONRAMP_PROVIDER ?? "simulated",
    baseUrl: process.env.ONRAMP_BASE_URL ?? "",
    apiKey: process.env.ONRAMP_API_KEY ?? "",
  };

  readonly chinaPayout: ChinaPayoutConfig = {
    enabled: bool(process.env.CHINA_PAYOUT_ENABLED),
    baseUrl: process.env.CHINA_PAYOUT_BASE_URL ?? "",
    apiKey: process.env.CHINA_PAYOUT_API_KEY ?? "",
  };

  readonly kyc: KycConfig = {
    enabled: bool(process.env.KYC_ENABLED),
    provider: process.env.KYC_PROVIDER ?? "stub",
    baseUrl: process.env.KYC_BASE_URL ?? "",
    apiKey: process.env.KYC_API_KEY ?? "",
  };

  readonly fx: FxConfig = {
    usdKes: num(process.env.FX_USD_KES, 129.5),
    usdCny: num(process.env.FX_USD_CNY, 7.18),
    marginBps: num(process.env.FX_MARGIN_BPS, 120),
    // 24h lock window by default so a quoted rate is honored for a full day.
    quoteTtlSeconds: num(process.env.FX_QUOTE_TTL_SECONDS, 86_400),
  };

  /** Whether a given segment should hit a real sandbox vs. its mock. */
  effectiveMode(segmentEnabled: boolean): AdapterMode {
    return this.adapterMode === "live" && segmentEnabled ? "live" : "mock";
  }
}
