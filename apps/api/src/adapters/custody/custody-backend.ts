/**
 * Custody backend abstraction. The CustodyAdapter delegates the actual on-chain
 * mechanics to one of these so the same payment pipeline + verifiers work against:
 *   - mock   : deterministic fake tx hashes (no chain, default)
 *   - evm    : real USDC on an EVM testnet via viem (Base Sepolia) -- "Path B"
 *   - circle : Circle Developer-Controlled Wallets sandbox -- "Path A" (slot-in)
 *
 * Field names on BridgeSendResult/BridgeConfirmResult are kept stable because the
 * payment engine and verifiers read them directly; new fields are additive/optional.
 */

export type CustodyKind = "mock" | "evm" | "circle";
export type WalletRole = "treasury" | "hk";

export interface BridgeSendInput {
  amountUsdcMinor: number;
  fromWallet: string;
  toWallet: string;
  /** When true, model/perform a cross-chain CCTP transfer (vs same-chain). */
  crossChain?: boolean;
}

export interface BridgeSendResult {
  txHash: string;
  chain: string;
  mode: "mock" | "live";
  /** Block-explorer URL for the tx, when the backend can produce one. */
  explorerUrl?: string;
  raw: unknown;
}

export interface BridgeConfirmResult {
  confirmed: boolean;
  confirmations: number;
  /** On-chain execution status when known. */
  status?: "success" | "reverted" | "pending";
  attestationId?: string;
  explorerUrl?: string;
  mode: "mock" | "live";
  raw: unknown;
}

/** RPC/auth reachability + chain identity, used by the connectivity probe. */
export interface ChainStatus {
  reachable: boolean;
  chain: string;
  chainId?: number;
  blockNumber?: number;
  detail?: string;
}

export interface CustodyBackend {
  readonly kind: CustodyKind;
  readonly chain: string;
  /** Resolve the on-chain address (evm) or wallet id (circle/mock) for a role. */
  walletRef(role: WalletRole): string;
  /** Reachability + chain identity (connectivity probe). */
  status(): Promise<ChainStatus>;
  /** USDC balance in 6-decimal minor units for an address/wallet ref. */
  usdcBalanceMinor(ref: string): Promise<number>;
  /** Native gas balance in wei for an address (evm). Returns null when N/A. */
  gasBalanceWei(ref: string): Promise<bigint | null>;
  /** Submit a USDC transfer; returns a tx hash/id. */
  send(input: BridgeSendInput): Promise<BridgeSendResult>;
  /** Poll a previously submitted transfer to terminal confirmation. */
  confirm(txHash: string): Promise<BridgeConfirmResult>;
}

/** Minimal ERC-20 ABI for balance reads + transfers (USDC). */
export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
