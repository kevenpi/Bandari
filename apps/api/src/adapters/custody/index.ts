import type { AppConfigService } from "../../config/app-config.service";
import type { CustodyBackend } from "./custody-backend";
import { MockCustodyBackend } from "./mock.backend";
import { EvmCustodyBackend } from "./evm.backend";
import { CircleCustodyBackend } from "./circle.backend";

export * from "./custody-backend";
export { MockCustodyBackend } from "./mock.backend";
export { EvmCustodyBackend, EvmBackendError, type EvmBackendConfig } from "./evm.backend";
export { CircleCustodyBackend, type CircleBackendConfig } from "./circle.backend";

/**
 * Pick the custody backend from config. Stays on the deterministic mock unless
 * ADAPTER_MODE=live, then honors CUSTODY_PROVIDER (evm | circle). This is the
 * "structured so Path A can slot in later" seam.
 */
export function buildCustodyBackend(config: AppConfigService): CustodyBackend {
  const mockRefs = {
    treasury: config.circle.treasuryWalletId || "treasury",
    hk: config.circle.hkWalletId || "hk",
  } as const;

  if (config.adapterMode !== "live" || config.custodyProvider === "mock") {
    return new MockCustodyBackend(config.circle.blockchain, mockRefs);
  }

  if (config.custodyProvider === "evm") {
    return new EvmCustodyBackend({
      rpcUrl: config.evm.rpcUrl,
      chainId: config.evm.chainId,
      chainName: config.evm.chainName,
      usdcAddress: config.evm.usdcAddress,
      explorerBase: config.evm.explorerBase,
      treasuryPrivateKey: config.evm.treasuryPrivateKey,
      hkAddress: config.evm.hkAddress,
      confirmations: config.evm.confirmations,
      confirmTimeoutMs: config.evm.confirmTimeoutMs,
    });
  }

  return new CircleCustodyBackend({
    baseUrl: config.circle.baseUrl,
    apiKey: config.circle.apiKey,
    entitySecret: config.circle.entitySecret,
    blockchain: config.circle.blockchain,
    treasuryWalletId: config.circle.treasuryWalletId,
    hkWalletId: config.circle.hkWalletId,
  });
}
