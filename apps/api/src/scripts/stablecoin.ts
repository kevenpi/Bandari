/**
 * Stablecoin testbed: proves the USDC leg actually works on a real EVM testnet
 * (Base Sepolia by default) without booting the whole API. Runs deterministic
 * checks — connectivity, treasury funding, a real on-chain transfer + confirm
 * with exact balance-delta assertions, and confirm idempotency.
 *
 *   pnpm --filter @bandari/api stablecoin:keygen   # one-time, generates wallets
 *   # fund the treasury address (Circle USDC faucet + Base Sepolia gas faucet)
 *   pnpm --filter @bandari/api stablecoin:test
 */
import "reflect-metadata";
import type { ProbeResult, VerifierResult } from "@bandari/shared";
import { loadLocalEnv } from "./env-loader";
import { printProbe, printSuiteHeader, printVerifier } from "./lib";
import { AppConfigService } from "../config/app-config.service";
import { buildCustodyBackend, EvmCustodyBackend } from "../adapters/custody";
import {
  connectivityProbe,
  fundingProbe,
  idempotentConfirmVerifier,
  transferConfirmChecks,
} from "../adapters/custody/stablecoin-verifiers";

async function main(): Promise<void> {
  loadLocalEnv();
  process.env.ADAPTER_MODE = "live";
  process.env.CUSTODY_PROVIDER = "evm";
  const config = new AppConfigService();

  if (!config.evm.treasuryPrivateKey || !config.evm.hkAddress) {
    console.error("EVM testnet wallet not configured.\nRun:  pnpm --filter @bandari/api stablecoin:keygen");
    process.exit(1);
  }

  const backend = buildCustodyBackend(config);
  const treasury = backend.walletRef("treasury");
  const hk = backend.walletRef("hk");
  const testUsdc = Number(process.env.STABLECOIN_TEST_USDC ?? "0.05");
  const amountMinor = Math.round(testUsdc * 1_000_000);
  const faucetHint = "Fund via https://faucet.circle.com (Base Sepolia USDC) + a Base Sepolia ETH faucet for gas.";

  console.log(`Bandari stablecoin testbed  (backend=${backend.kind}, chain=${backend.chain})`);
  console.log(`  treasury (sender):    ${treasury}`);
  console.log(`  hk       (recipient): ${hk}`);
  if (backend instanceof EvmCustodyBackend) {
    console.log(`  treasury explorer:    ${backend.addressUrl(treasury)}`);
  }
  console.log(`  test amount:          ${testUsdc} USDC (${amountMinor} minor)`);

  const probes: ProbeResult[] = [];
  const verifiers: VerifierResult[] = [];

  printSuiteHeader("1) Connectivity (RPC reachable + correct chain)");
  const conn = await connectivityProbe(backend, config.evm.chainId);
  probes.push(conn);
  printProbe(conn);

  printSuiteHeader("2) Treasury funding (USDC balance + gas)");
  const funding = await fundingProbe(backend, treasury, amountMinor, faucetHint);
  probes.push(funding);
  printProbe(funding);
  if (funding.outcome === "fail") console.log(`\n  -> ${funding.message}`);

  if (conn.outcome === "pass" && funding.outcome === "pass") {
    printSuiteHeader("3) Transfer + confirm (REAL USDC on-chain)");
    const t = await transferConfirmChecks(backend, {
      fromRef: treasury,
      toRef: hk,
      amountMinor,
      minConfirmations: config.evm.confirmations,
    });
    t.probes.forEach((p) => {
      probes.push(p);
      printProbe(p);
    });
    t.verifiers.forEach((v) => {
      verifiers.push(v);
      printVerifier(v);
    });
    if (t.explorerUrl) console.log(`  tx: ${t.explorerUrl}`);

    if (t.txHash) {
      printSuiteHeader("4) Idempotent confirm");
      const idem = await idempotentConfirmVerifier(backend, t.txHash);
      verifiers.push(idem);
      printVerifier(idem);
    }
  } else {
    console.log("\nSkipping on-chain transfer until connectivity + funding pass.");
  }

  const decided = verifiers.filter((v) => v.outcome !== "skip");
  const probePass = probes.filter((p) => p.outcome === "pass").length;
  const verPass = decided.filter((v) => v.outcome === "pass").length;
  const ok = probes.every((p) => p.outcome !== "fail") && decided.every((v) => v.outcome === "pass");
  console.log(
    `\n${ok ? "STABLECOIN TESTBED PASSED" : "STABLECOIN TESTBED FAILED"}` +
      `  (probes ${probePass}/${probes.length}, verifiers ${verPass}/${decided.length})`,
  );
  process.exit(ok ? 0 : 1);
}

void main();
