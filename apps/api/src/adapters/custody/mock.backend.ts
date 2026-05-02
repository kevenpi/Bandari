import { randomBytes, randomUUID } from "node:crypto";
import { toDecimal } from "@bandari/shared";
import type {
  BridgeConfirmResult,
  BridgeSendInput,
  BridgeSendResult,
  ChainStatus,
  CustodyBackend,
  WalletRole,
} from "./custody-backend";

/** Sleep a small random interval so mock timings look realistic. */
function jitter(min = 30, max = 120): Promise<void> {
  const ms = Math.floor(min + Math.random() * (max - min));
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Deterministic, chainless custody. Proves the orchestration (states, ledger,
 * idempotency) without touching a network. Default backend.
 */
export class MockCustodyBackend implements CustodyBackend {
  readonly kind = "mock" as const;

  constructor(
    readonly chain: string,
    private readonly refs: Record<WalletRole, string>,
  ) {}

  walletRef(role: WalletRole): string {
    return this.refs[role];
  }

  async status(): Promise<ChainStatus> {
    await jitter();
    return { reachable: true, chain: this.chain, detail: "mock backend (no chain)" };
  }

  async usdcBalanceMinor(): Promise<number> {
    // Treat the mock treasury as always sufficiently funded.
    return 1_000_000_000_000;
  }

  async gasBalanceWei(): Promise<bigint | null> {
    return null;
  }

  async send(input: BridgeSendInput): Promise<BridgeSendResult> {
    await jitter();
    return {
      txHash: `0x${randomBytes(32).toString("hex")}`,
      chain: this.chain,
      mode: "mock",
      raw: {
        simulated: true,
        usdc: toDecimal(input.amountUsdcMinor, "USDC"),
        from: input.fromWallet,
        to: input.toWallet,
        path: input.crossChain ? "cctp-v2" : "same-chain",
      },
    };
  }

  async confirm(txHash: string): Promise<BridgeConfirmResult> {
    await jitter();
    return {
      confirmed: true,
      confirmations: 6,
      status: "success",
      attestationId: `att_${randomUUID().slice(0, 16)}`,
      mode: "mock",
      raw: { simulated: true, txHash },
    };
  }
}
