/**
 * Local verification suite (no GitHub, no hosted CI). Boots an isolated inline
 * API, runs every segment probe, then exercises the full corridor happy-path
 * and the refund path, running deterministic stage verifiers on each. Prints
 * structured diagnostics and exits non-zero on any failure.
 */
import {
  printProbe,
  printSuiteHeader,
  printSummary,
  printVerifier,
  runHappyPath,
  runRefundPath,
  spawnApi,
} from "./lib";

async function main(): Promise<void> {
  const adapterMode = process.env.ADAPTER_MODE === "live" ? "live" : "mock";
  console.log(`Bandari local verification  (adapterMode=${adapterMode}, orchestrator=inline)`);
  const api = await spawnApi(adapterMode);
  let ok = true;

  try {
    // 1) Segment probes
    printSuiteHeader("Segment probes (each leg in isolation)");
    const probes = await api.client.runProbes();
    probes.forEach(printProbe);
    const probesOk = probes.every((p) => p.outcome !== "fail");
    ok = ok && probesOk;

    // 2) Happy path + stage verifiers
    printSuiteHeader("Corridor happy path: KES -> USDC -> HK -> CNY");
    const happy = await runHappyPath(api.client);
    console.log(`  payment ${happy.paymentId} finished as ${happy.finalStatus}`);
    const happySuite = await api.client.verifyPayment(happy.paymentId);
    happySuite.verifiers.forEach(printVerifier);
    const happyOk = happySuite.passed && happy.finalStatus === "Settled";
    printSummary("happy-path", happySuite);
    ok = ok && happyOk;

    // 3) Refund path + stage verifiers
    printSuiteHeader("Refund path: forced bridge failure -> reversal");
    const refund = await runRefundPath(api.client);
    console.log(`  payment ${refund.paymentId} finished as ${refund.finalStatus}`);
    const refundSuite = await api.client.verifyPayment(refund.paymentId);
    refundSuite.verifiers.forEach(printVerifier);
    const refundOk = refundSuite.passed && refund.finalStatus === "Refunded";
    printSummary("refund-path", refundSuite);
    ok = ok && refundOk;
  } catch (err) {
    console.error("\nVerification crashed:", (err as Error).message);
    ok = false;
  } finally {
    await api.stop();
  }

  console.log(`\n${ok ? "VERIFICATION PASSED" : "VERIFICATION FAILED"}`);
  process.exit(ok ? 0 : 1);
}

void main();
