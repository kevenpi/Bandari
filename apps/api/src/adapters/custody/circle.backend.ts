import { randomUUID } from "node:crypto";
import { toDecimal } from "@bandari/shared";
import type {
  BridgeConfirmResult,
  BridgeSendInput,
  BridgeSendResult,
  ChainStatus,
  CustodyBackend,
  WalletRole,
} from "./custody-backend";

export interface CircleBackendConfig {
  baseUrl: string;
  apiKey: string;
  entitySecret: string;
  blockchain: string;
  treasuryWalletId: string;
  hkWalletId: string;
}

export class CircleBackendError extends Error {
  constructor(
    message: string,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = "CircleBackendError";
  }
}

/**
 * Circle Developer-Controlled Wallets (sandbox) -- "Path A". Structured slot-in:
 * the developer-controlled transfer requires an entity-secret ciphertext per call
 * (fetch Circle's public key, RSA-OAEP encrypt the entity secret). That single
 * step is the remaining TODO; everything else is wired.
 */
export class CircleCustodyBackend implements CustodyBackend {
  readonly kind = "circle" as const;
  readonly chain: string;

  constructor(private readonly cfg: CircleBackendConfig) {
    this.chain = cfg.blockchain;
  }

  private headers() {
    return { authorization: `Bearer ${this.cfg.apiKey}`, "content-type": "application/json" };
  }

  walletRef(role: WalletRole): string {
    return role === "treasury" ? this.cfg.treasuryWalletId : this.cfg.hkWalletId;
  }

  async status(): Promise<ChainStatus> {
    try {
      const res = await fetch(`${this.cfg.baseUrl}/ping`);
      return { reachable: res.ok, chain: this.chain, detail: `circle ping ${res.status}` };
    } catch (err) {
      return { reachable: false, chain: this.chain, detail: (err as Error).message };
    }
  }

  async usdcBalanceMinor(ref: string): Promise<number> {
    const res = await fetch(`${this.cfg.baseUrl}/v1/w3s/wallets/${ref}/balances`, {
      headers: this.headers(),
    });
    const json = (await res.json()) as Record<string, any>;
    if (!res.ok) throw new CircleBackendError(`Circle balance fetch failed: ${JSON.stringify(json)}`, json);
    const usdc = (json?.data?.tokenBalances ?? []).find(
      (b: any) => String(b?.token?.symbol ?? "").toUpperCase() === "USDC",
    );
    const amount = Number(usdc?.amount ?? 0);
    return Math.round(amount * 1_000_000);
  }

  async gasBalanceWei(): Promise<bigint | null> {
    return null; // Circle abstracts gas.
  }

  async send(input: BridgeSendInput): Promise<BridgeSendResult> {
    const c = this.cfg;
    if (!c.apiKey || !c.entitySecret || !input.fromWallet) {
      throw new CircleBackendError(
        "Circle live mode requires CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET and wallet ids",
      );
    }
    // TODO(Path A): compute entitySecretCiphertext via Circle public key + RSA-OAEP.
    const res = await fetch(`${c.baseUrl}/v1/w3s/developer/transactions/transfer`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        walletId: input.fromWallet,
        destinationAddress: input.toWallet,
        amounts: [String(toDecimal(input.amountUsdcMinor, "USDC"))],
        blockchain: c.blockchain,
        // entitySecretCiphertext: <computed>,
      }),
    });
    const json = (await res.json()) as Record<string, any>;
    if (!res.ok) throw new CircleBackendError(`Circle transfer failed: ${JSON.stringify(json)}`, json);
    return { txHash: String(json?.data?.id ?? ""), chain: c.blockchain, mode: "live", raw: json };
  }

  async confirm(txHash: string): Promise<BridgeConfirmResult> {
    const res = await fetch(`${this.cfg.baseUrl}/v1/w3s/transactions/${txHash}`, {
      headers: this.headers(),
    });
    const json = (await res.json()) as Record<string, any>;
    if (!res.ok) throw new CircleBackendError(`Circle tx fetch failed: ${JSON.stringify(json)}`, json);
    const state = String(json?.data?.transaction?.state ?? "");
    const confirmed = state === "COMPLETE" || state === "CONFIRMED";
    return {
      confirmed,
      confirmations: confirmed ? 6 : 0,
      status: confirmed ? "success" : "pending",
      attestationId: json?.data?.transaction?.txHash,
      mode: "live",
      raw: json,
    };
  }
}
