/** Run a single happy-path corridor end to end and print the payment timeline. */
import { pollUntilTerminal, printSuiteHeader, runHappyPath, spawnApi } from "./lib";

async function main(): Promise<void> {
  const adapterMode = process.env.ADAPTER_MODE === "live" ? "live" : "mock";
  console.log(`Bandari e2e corridor run  (adapterMode=${adapterMode})`);
  const api = await spawnApi(adapterMode);
  let ok = false;
  try {
    const flow = await runHappyPath(api.client);
    const payment = await pollUntilTerminal(api.client, flow.paymentId);
    printSuiteHeader(`Payment ${payment.id} timeline (${payment.status})`);
    for (const e of payment.events ?? []) {
      console.log(`  ${e.createdAt}  ${(e.fromStatus ?? "-").padEnd(16)} -> ${(e.toStatus ?? "-").padEnd(16)} ${e.message}`);
    }
    const ledger = await api.client.getLedger(payment.id);
    printSuiteHeader("Ledger entries");
    for (const l of ledger) {
      console.log(`  ${l.direction.padEnd(6)} ${l.account.padEnd(22)} ${String(l.amountMinor).padStart(12)} ${l.currency}`);
    }

    const recon = await api.client.getReconciliation();
    printSuiteHeader("Reconciliation");
    console.log(
      `  payments balanced: ${recon.balancedPayments}/${recon.totalPayments}  imbalances: ${recon.imbalances.length}  ledger-nets-to-zero: ${recon.ok}`,
    );
    for (const a of recon.accountBalances) {
      console.log(`  ${a.account.padEnd(22)} ${String(a.netMinor).padStart(12)} ${a.currency}`);
    }

    ok = payment.status === "Settled" && recon.ok;
  } catch (err) {
    console.error("e2e crashed:", (err as Error).message);
  } finally {
    await api.stop();
  }
  console.log(`\n${ok ? "E2E PASSED (Settled)" : "E2E FAILED"}`);
  process.exit(ok ? 0 : 1);
}

void main();
