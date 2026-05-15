import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import {
  BandariClient,
  summarize,
  type PaymentView,
  type ProbeResult,
  type SuiteResult,
  type VerifierResult,
} from "@bandari/shared";

export interface SpawnedApi {
  client: BandariClient;
  baseUrl: string;
  stop: () => Promise<void>;
}

const TERMINAL = ["Settled", "Failed", "Refunded"];

/**
 * Boot an isolated API instance for verification: inline orchestrator (no Redis
 * needed, deterministic) on a dedicated port, so it never collides with a dev
 * server. Returns a client + stop().
 */
export async function spawnApi(adapterMode: "mock" | "live" = "mock"): Promise<SpawnedApi> {
  const port = Number(process.env.VERIFY_PORT ?? 4010);
  const baseUrl = `http://localhost:${port}`;
  const mainPath = path.join(__dirname, "..", "main.js");

  const proc: ChildProcess = spawn(process.execPath, [mainPath], {
    env: {
      ...process.env,
      API_PORT: String(port),
      PUBLIC_BASE_URL: baseUrl,
      ADAPTER_MODE: adapterMode,
      ORCHESTRATOR: "inline",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  const client = new BandariClient({ baseUrl });
  const stop = async () => {
    if (!proc.killed) proc.kill("SIGTERM");
  };

  try {
    await waitForHealth(client);
  } catch (err) {
    await stop();
    throw err;
  }
  return { client, baseUrl, stop };
}

export async function waitForHealth(client: BandariClient, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      await client.health();
      return;
    } catch (err) {
      lastErr = err;
      await sleep(300);
    }
  }
  throw new Error(`API did not become healthy in ${timeoutMs}ms: ${String(lastErr)}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function pollUntilTerminal(
  client: BandariClient,
  paymentId: string,
  timeoutMs = 20_000,
): Promise<PaymentView> {
  const deadline = Date.now() + timeoutMs;
  let payment = await client.getPayment(paymentId);
  while (!TERMINAL.includes(payment.status) && Date.now() < deadline) {
    await sleep(250);
    payment = await client.getPayment(paymentId);
  }
  return payment;
}

export interface FlowResult {
  paymentId: string;
  finalStatus: string;
}

/** Happy-path corridor: KES in -> USDC -> bridged -> CNY out -> Settled. */
export async function runHappyPath(client: BandariClient): Promise<FlowResult> {
  const stamp = Date.now();
  const importer = await client.createImporter({
    name: "Asha Imports Ltd",
    email: `asha+${stamp}@example.com`,
    msisdn: "254708374149",
    businessName: "Asha Imports Ltd",
  });
  await client.submitKyc(importer.id);
  const supplier = await client.createSupplier({
    importerId: importer.id,
    name: "Shenzhen Widgets Co.",
    country: "CHN",
    payoutMethod: "bank",
    accountName: "Shenzhen Widgets Co.",
    accountNumber: "6222020200000000000",
    bankName: "ICBC",
  });
  const quote = await client.createQuote({ sendAmountKes: 50_000 });
  const payment = await client.createPayment({
    importerId: importer.id,
    supplierId: supplier.id,
    quoteId: quote.id,
    reference: `demo-${stamp}`,
  });
  await client.simulateFunding(payment.id);
  const final = await pollUntilTerminal(client, payment.id);
  return { paymentId: payment.id, finalStatus: final.status };
}

/** Refund path: force a bridge failure after funding and expect a clean refund. */
export async function runRefundPath(client: BandariClient): Promise<FlowResult> {
  const stamp = Date.now();
  const importer = await client.createImporter({
    name: "Bahari Traders",
    email: `bahari+${stamp}@example.com`,
    msisdn: "254708374149",
  });
  await client.submitKyc(importer.id);
  const supplier = await client.createSupplier({
    importerId: importer.id,
    name: "Guangzhou Parts Co.",
    country: "CHN",
    payoutMethod: "alipay",
    accountName: "Guangzhou Parts Co.",
    accountNumber: "880088008800",
  });
  const quote = await client.createQuote({ sendAmountKes: 30_000 });
  const payment = await client.createPayment({
    importerId: importer.id,
    supplierId: supplier.id,
    quoteId: quote.id,
    reference: `FAIL_BRIDGE-${stamp}`,
  });
  await client.simulateFunding(payment.id);
  const final = await pollUntilTerminal(client, payment.id);
  return { paymentId: payment.id, finalStatus: final.status };
}

// ---- pretty printing ----
const mark = (o: string) => (o === "pass" ? "PASS" : o === "fail" ? "FAIL" : "skip");

export function printProbe(p: ProbeResult): void {
  console.log(
    `  [${mark(p.outcome)}] ${p.name.padEnd(28)} ${String(p.mode).padEnd(5)} ${String(p.latencyMs).padStart(4)}ms` +
      (p.error ? `  error=${p.error}` : ""),
  );
}

export function printVerifier(v: VerifierResult): void {
  console.log(`  [${mark(v.outcome)}] ${v.name.padEnd(34)} ${v.message}`);
  if (v.outcome === "fail") {
    console.log(`        expected: ${JSON.stringify(v.expected)}`);
    console.log(`        actual:   ${JSON.stringify(v.actual)}`);
  }
}

export function printSuiteHeader(title: string): void {
  console.log(`\n=== ${title} ===`);
}

export function printSummary(label: string, suite: SuiteResult): void {
  console.log(`\n${label}: ${summarize(suite)}`);
}
