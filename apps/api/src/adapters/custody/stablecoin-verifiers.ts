/**
 * Deterministic checks that prove the stablecoin leg actually works on-chain.
 * No AI: every check is a plain pass/fail with expected/actual evidence, emitted
 * as the same ProbeResult/VerifierResult shapes the rest of the diagnostics use.
 */
import type { AdapterMode, ProbeResult, VerifierResult } from "@bandari/shared";
import type { CustodyBackend } from "./custody-backend";

const usdc = (minor: number) => (minor / 1_000_000).toFixed(6);
const mode = (b: CustodyBackend): AdapterMode => (b.kind === "mock" ? "mock" : "live");

function mkProbe(
  name: string,
  b: CustodyBackend,
  startedAt: string,
  t0: number,
  outcome: "pass" | "fail",
  output: unknown,
  message: string,
  error?: string,
): ProbeResult {
  return { segment: "custody", name, outcome, mode: mode(b), startedAt, latencyMs: Date.now() - t0, output, message, error };
}

function mkVerifier(
  name: string,
  stage: string,
  ok: boolean,
  expected: unknown,
  actual: unknown,
  message: string,
  details?: Record<string, unknown>,
): VerifierResult {
  return { stage, name, outcome: ok ? "pass" : "fail", expected, actual, message, details };
}

/** Probe 1: RPC reachable and on the expected chain. */
export async function connectivityProbe(b: CustodyBackend, expectedChainId?: number): Promise<ProbeResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    const s = await b.status();
    const chainOk = expectedChainId == null || s.chainId == null || s.chainId === expectedChainId;
    const ok = s.reachable && chainOk;
    return mkProbe(
      "custody.connectivity",
      b,
      startedAt,
      t0,
      ok ? "pass" : "fail",
      { reachable: s.reachable, chainId: s.chainId, expectedChainId, blockNumber: s.blockNumber, chain: s.chain },
      ok
        ? `Connected to ${s.chain} (chainId ${s.chainId ?? "n/a"}) at block ${s.blockNumber ?? "n/a"}`
        : `Connectivity/chain mismatch (${s.detail ?? "unreachable"}); expected chainId ${expectedChainId}`,
    );
  } catch (err) {
    return mkProbe("custody.connectivity", b, startedAt, t0, "fail", null, "RPC error", (err as Error).message);
  }
}

/** Probe 2: treasury holds enough USDC and some native gas for the transfer. */
export async function fundingProbe(
  b: CustodyBackend,
  treasuryRef: string,
  requiredUsdcMinor: number,
  faucetHint?: string,
): Promise<ProbeResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    const usdcMinor = await b.usdcBalanceMinor(treasuryRef);
    const gasWei = await b.gasBalanceWei(treasuryRef);
    const usdcOk = usdcMinor >= requiredUsdcMinor;
    const gasOk = gasWei == null || gasWei > 0n;
    const ok = usdcOk && gasOk;
    const msg = ok
      ? `Treasury funded: ${usdc(usdcMinor)} USDC, gas ${gasWei == null ? "n/a" : `${gasWei} wei`}`
      : `Underfunded treasury ${treasuryRef}: have ${usdc(usdcMinor)} USDC (need ${usdc(requiredUsdcMinor)})` +
        `${gasOk ? "" : ", no gas (ETH)"}. ${faucetHint ?? ""}`;
    return mkProbe(
      "custody.funding",
      b,
      startedAt,
      t0,
      ok ? "pass" : "fail",
      { usdcMinor, requiredUsdcMinor, gasWei: gasWei == null ? null : String(gasWei), treasuryRef },
      msg,
    );
  } catch (err) {
    return mkProbe("custody.funding", b, startedAt, t0, "fail", null, "balance read error", (err as Error).message);
  }
}

export interface TransferCheckResult {
  probes: ProbeResult[];
  verifiers: VerifierResult[];
  txHash?: string;
  explorerUrl?: string;
}

/**
 * The core proof: move N USDC treasury -> HK, confirm it on-chain, and assert the
 * sender was debited and the recipient credited by exactly N.
 */
export async function transferConfirmChecks(
  b: CustodyBackend,
  opts: { fromRef: string; toRef: string; amountMinor: number; minConfirmations: number },
): Promise<TransferCheckResult> {
  const { fromRef, toRef, amountMinor, minConfirmations } = opts;
  const probes: ProbeResult[] = [];
  const verifiers: VerifierResult[] = [];

  const beforeFrom = await b.usdcBalanceMinor(fromRef);
  const beforeTo = await b.usdcBalanceMinor(toRef);

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  let sent;
  try {
    sent = await b.send({ amountUsdcMinor: amountMinor, fromWallet: fromRef, toWallet: toRef });
  } catch (err) {
    probes.push(mkProbe("custody.transfer.submit", b, startedAt, t0, "fail", null, "submit failed", (err as Error).message));
    return { probes, verifiers };
  }
  probes.push(
    mkProbe(
      "custody.transfer.submit",
      b,
      startedAt,
      t0,
      "pass",
      { txHash: sent.txHash, explorerUrl: sent.explorerUrl },
      `Submitted ${usdc(amountMinor)} USDC -> ${toRef}  tx=${sent.txHash.slice(0, 14)}...`,
    ),
  );

  const confirm = await b.confirm(sent.txHash);
  verifiers.push(
    mkVerifier(
      "custody.txConfirmed",
      "bridge",
      confirm.confirmed && confirm.status === "success" && confirm.confirmations >= minConfirmations,
      `status=success and confirmations>=${minConfirmations}`,
      { status: confirm.status, confirmations: confirm.confirmations },
      confirm.confirmed
        ? `Transfer confirmed on-chain (${confirm.confirmations} conf).`
        : `Transfer not confirmed (status=${confirm.status}).`,
      { explorerUrl: confirm.explorerUrl, attestationId: confirm.attestationId },
    ),
  );

  const afterFrom = await b.usdcBalanceMinor(fromRef);
  const afterTo = await b.usdcBalanceMinor(toRef);
  const senderDelta = beforeFrom - afterFrom;
  const recipientDelta = afterTo - beforeTo;

  verifiers.push(
    mkVerifier(
      "custody.senderDebited",
      "bridge",
      senderDelta === amountMinor,
      amountMinor,
      senderDelta,
      senderDelta === amountMinor
        ? `Sender debited exactly ${usdc(amountMinor)} USDC.`
        : `Sender balance changed by ${usdc(senderDelta)} USDC, expected ${usdc(amountMinor)}.`,
      { beforeFrom, afterFrom },
    ),
  );
  verifiers.push(
    mkVerifier(
      "custody.recipientCredited",
      "bridge",
      recipientDelta === amountMinor,
      amountMinor,
      recipientDelta,
      recipientDelta === amountMinor
        ? `Recipient credited exactly ${usdc(amountMinor)} USDC.`
        : `Recipient balance changed by ${usdc(recipientDelta)} USDC, expected ${usdc(amountMinor)}.`,
      { beforeTo, afterTo },
    ),
  );

  return { probes, verifiers, txHash: sent.txHash, explorerUrl: sent.explorerUrl };
}

/** Re-confirming the same tx must yield the same terminal result (no double-count). */
export async function idempotentConfirmVerifier(b: CustodyBackend, txHash: string): Promise<VerifierResult> {
  const a = await b.confirm(txHash);
  const c = await b.confirm(txHash);
  const same = a.confirmed === c.confirmed && a.status === c.status;
  return mkVerifier(
    "custody.confirmIdempotent",
    "bridge",
    same,
    { confirmed: a.confirmed, status: a.status },
    { confirmed: c.confirmed, status: c.status },
    same ? "Re-confirming the same tx is idempotent." : "Re-confirm produced a different result.",
  );
}
