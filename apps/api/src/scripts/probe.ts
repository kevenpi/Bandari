/** Run just the per-segment health checks + probes and print structured results. */
import { printProbe, printSuiteHeader, spawnApi } from "./lib";

async function main(): Promise<void> {
  const adapterMode = process.env.ADAPTER_MODE === "live" ? "live" : "mock";
  console.log(`Bandari segment probes  (adapterMode=${adapterMode})`);
  const api = await spawnApi(adapterMode);
  let ok = true;
  try {
    printSuiteHeader("Health checks (auth + reachability)");
    const health = await api.client.runHealthChecks().catch(() => []);
    health.forEach(printProbe);

    printSuiteHeader("Probes (one canned tx per segment)");
    const probes = await api.client.runProbes();
    probes.forEach(printProbe);
    ok = probes.every((p) => p.outcome !== "fail");
  } catch (err) {
    console.error("Probe run crashed:", (err as Error).message);
    ok = false;
  } finally {
    await api.stop();
  }
  console.log(`\n${ok ? "PROBES PASSED" : "PROBES FAILED"}`);
  process.exit(ok ? 0 : 1);
}

void main();
