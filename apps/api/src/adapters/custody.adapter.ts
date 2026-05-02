import { Injectable } from "@nestjs/common";
import type { AdapterMode, ProbeResult, Segment } from "@bandari/shared";
import { AppConfigService } from "../config/app-config.service";
import { buildProbe, type SegmentAdapter } from "./types";
import {
  buildCustodyBackend,
  type BridgeConfirmResult,
  type BridgeSendInput,
  type BridgeSendResult,
  type CustodyBackend,
} from "./custody";

// Re-exported for back-compat with existing imports.
export type { BridgeSendInput, BridgeSendResult, BridgeConfirmResult };

/**
 * USDC custody + on-chain transfer. The mechanics are delegated to a pluggable
 * backend (mock | evm | circle) selected from config, so the same pipeline and
 * verifiers run against deterministic mocks, a real EVM testnet (Base Sepolia
 * via viem), or Circle Developer-Controlled Wallets.
 */
@Injectable()
export class CustodyAdapter implements SegmentAdapter {
  readonly segment: Segment = "custody";
  private backendInstance?: CustodyBackend;

  constructor(private readonly config: AppConfigService) {}

  private get backend(): CustodyBackend {
    if (!this.backendInstance) this.backendInstance = buildCustodyBackend(this.config);
    return this.backendInstance;
  }

  private get mode(): AdapterMode {
    return this.backend.kind === "mock" ? "mock" : "live";
  }

  send(input: BridgeSendInput): Promise<BridgeSendResult> {
    return this.backend.send(input);
  }

  confirm(txHash: string): Promise<BridgeConfirmResult> {
    return this.backend.confirm(txHash);
  }

  async healthCheck(): Promise<ProbeResult> {
    return buildProbe(this.segment, "custody.healthCheck", this.mode, null, async () => {
      const status = await this.backend.status();
      if (!status.reachable) throw new Error(`custody backend unreachable: ${status.detail ?? "?"}`);
      return {
        output: { backend: this.backend.kind, chain: status.chain, chainId: status.chainId, block: status.blockNumber },
        message: `${this.backend.kind} ready (${status.detail ?? status.chain})`,
      };
    });
  }

  async runProbe(): Promise<ProbeResult> {
    const input: BridgeSendInput = {
      amountUsdcMinor: 10_000000,
      fromWallet: this.backend.walletRef("treasury"),
      toWallet: this.backend.walletRef("hk"),
    };
    return buildProbe(this.segment, "custody.sendConfirm", this.mode, input, async () => {
      const sent = await this.send(input);
      const confirmed = await this.confirm(sent.txHash);
      return {
        output: {
          txHash: sent.txHash,
          confirmed: confirmed.confirmed,
          confirmations: confirmed.confirmations,
          attestationId: confirmed.attestationId,
          explorerUrl: sent.explorerUrl,
        },
        request: input,
        response: { send: sent.raw, confirm: confirmed.raw },
      };
    });
  }
}
