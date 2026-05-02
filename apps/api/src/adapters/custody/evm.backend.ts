import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { toDecimal } from "@bandari/shared";
import {
  ERC20_ABI,
  type BridgeConfirmResult,
  type BridgeSendInput,
  type BridgeSendResult,
  type ChainStatus,
  type CustodyBackend,
  type WalletRole,
} from "./custody-backend";

export interface EvmBackendConfig {
  rpcUrl: string;
  chainId: number;
  chainName: string;
  /** ERC-20 USDC contract on the target testnet. */
  usdcAddress: string;
  explorerBase: string;
  /** Treasury (sender) private key. Testnet only. */
  treasuryPrivateKey: string;
  /** Destination (HK) address. */
  hkAddress: string;
  /** Block confirmations to require before treating a tx as settled. */
  confirmations?: number;
  /** Receipt wait timeout (ms). */
  confirmTimeoutMs?: number;
}

/** Raised by the EVM backend; carries the raw payload for diagnostics. */
export class EvmBackendError extends Error {
  constructor(
    message: string,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = "EvmBackendError";
  }
}

/**
 * Real USDC movement on an EVM testnet (Base Sepolia by default) via viem.
 * Same-chain ERC-20 transfer treasury -> HK. This is the self-contained
 * "does the stablecoin tech actually work" backend -- every tx is visible on a
 * public block explorer.
 */
export class EvmCustodyBackend implements CustodyBackend {
  readonly kind = "evm" as const;
  readonly chain: string;

  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;
  private readonly chainObj: Chain;
  private readonly account: ReturnType<typeof privateKeyToAccount>;
  private readonly usdc: Address;
  private readonly hk: Address;
  private readonly confirmations: number;
  private readonly confirmTimeoutMs: number;

  constructor(private readonly cfg: EvmBackendConfig) {
    this.chain = cfg.chainName;
    this.confirmations = cfg.confirmations ?? 1;
    this.confirmTimeoutMs = cfg.confirmTimeoutMs ?? 120_000;

    this.chainObj = defineChain({
      id: cfg.chainId,
      name: cfg.chainName,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [cfg.rpcUrl] } },
      blockExplorers: { default: { name: "explorer", url: cfg.explorerBase } },
    }) as Chain;

    this.account = privateKeyToAccount(normalizeHex(cfg.treasuryPrivateKey));
    this.usdc = getAddress(cfg.usdcAddress);
    this.hk = getAddress(cfg.hkAddress);
    this.publicClient = createPublicClient({ chain: this.chainObj, transport: http(cfg.rpcUrl) });
    this.walletClient = createWalletClient({ account: this.account, chain: this.chainObj, transport: http(cfg.rpcUrl) });
  }

  walletRef(role: WalletRole): string {
    return role === "treasury" ? this.account.address : this.hk;
  }

  txUrl(hash: string): string {
    return `${this.cfg.explorerBase.replace(/\/$/, "")}/tx/${hash}`;
  }

  addressUrl(addr: string): string {
    return `${this.cfg.explorerBase.replace(/\/$/, "")}/address/${addr}`;
  }

  async status(): Promise<ChainStatus> {
    try {
      const [chainId, blockNumber] = await Promise.all([
        this.publicClient.getChainId(),
        this.publicClient.getBlockNumber(),
      ]);
      return {
        reachable: true,
        chain: this.chain,
        chainId,
        blockNumber: Number(blockNumber),
        detail: `RPC ok @ block ${blockNumber}`,
      };
    } catch (err) {
      return { reachable: false, chain: this.chain, detail: (err as Error).message };
    }
  }

  async usdcBalanceMinor(ref: string): Promise<number> {
    const raw = (await this.publicClient.readContract({
      address: this.usdc,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [getAddress(ref)],
    })) as bigint;
    return Number(raw);
  }

  async gasBalanceWei(ref: string): Promise<bigint | null> {
    return this.publicClient.getBalance({ address: getAddress(ref) });
  }

  async send(input: BridgeSendInput): Promise<BridgeSendResult> {
    if (input.crossChain) {
      throw new EvmBackendError("CCTP cross-chain transfer is not implemented in the evm backend yet");
    }
    const to = getAddress(input.toWallet === "hk" ? this.hk : input.toWallet);
    const amount = BigInt(input.amountUsdcMinor);
    let hash: Hash;
    try {
      hash = await this.walletClient.writeContract({
        account: this.account,
        chain: this.chainObj,
        address: this.usdc,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [to, amount],
      });
    } catch (err) {
      throw new EvmBackendError(`USDC transfer submit failed: ${(err as Error).message}`, err);
    }
    return {
      txHash: hash,
      chain: this.chain,
      mode: "live",
      explorerUrl: this.txUrl(hash),
      raw: {
        from: this.account.address,
        to,
        usdc: toDecimal(input.amountUsdcMinor, "USDC"),
        contract: this.usdc,
      },
    };
  }

  async confirm(txHash: string): Promise<BridgeConfirmResult> {
    try {
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash as Hash,
        timeout: this.confirmTimeoutMs,
        confirmations: this.confirmations,
      });
      const current = await this.publicClient.getBlockNumber();
      const confs = Number(current - receipt.blockNumber) + 1;
      const ok = receipt.status === "success";
      return {
        confirmed: ok && confs >= this.confirmations,
        confirmations: confs,
        status: ok ? "success" : "reverted",
        // No CCTP attestation on a same-chain transfer; expose the tx hash so the
        // downstream "bridged" verifier has a stable on-chain reference.
        attestationId: `onchain:${txHash}`,
        explorerUrl: this.txUrl(txHash),
        mode: "live",
        raw: {
          blockNumber: Number(receipt.blockNumber),
          gasUsed: Number(receipt.gasUsed),
          status: receipt.status,
        },
      };
    } catch (err) {
      // Timeout / not-yet-mined: report unconfirmed rather than throwing, so the
      // pipeline can re-poll (matches the engine's "stay in Bridging" behavior).
      return {
        confirmed: false,
        confirmations: 0,
        status: "pending",
        explorerUrl: this.txUrl(txHash),
        mode: "live",
        raw: { error: (err as Error).message },
      };
    }
  }
}

function normalizeHex(key: string): Hex {
  const k = key.trim();
  return (k.startsWith("0x") ? k : `0x${k}`) as Hex;
}
