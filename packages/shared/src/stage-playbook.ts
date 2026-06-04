/**
 * Stage playbook: for every state in the payment pipeline, a plain-English spec of
 *   - shouldHappen      : the real production behavior we are standing in for
 *   - actuallyHappening : what the sandbox/mock does today
 *   - regulation        : licensing / regulatory prerequisites to do it for real
 *   - partners          : the on-ramp / off-ramp / payout relationships required
 *
 * This is the single source of truth the UI renders next to each stage + action
 * button, so the demo always shows the gap between "wired" and "production".
 */
import { HAPPY_PATH, type PaymentStatus } from "./payment-states.js";

export interface StagePlaybook {
  status: PaymentStatus;
  title: string;
  /** Who performs this leg (adapter / system). */
  handler: string;
  shouldHappen: string;
  actuallyHappening: string;
  regulation: string[];
  partners: string[];
}

export const STAGE_PLAYBOOK: Record<PaymentStatus, StagePlaybook> = {
  Quoted: {
    status: "Quoted",
    title: "Lock the rate",
    handler: "FX engine",
    shouldHappen:
      "Pull live mid-market FX (KES/USD and USD/CNY), add the Bandari margin, and lock one all-in rate with a short expiry. Reserve liquidity so the quoted rate is honored at settlement.",
    actuallyHappening:
      "Uses static fallback rates (FX_USD_KES, FX_USD_CNY) plus a fixed margin (bps). The quote is persisted with a TTL, but there is no live price feed and no liquidity reservation.",
    regulation: [
      "All-in price disclosure (no hidden FX markup) under consumer-protection rules",
      "CBK conduct expectations for transparent pricing",
    ],
    partners: [
      "A market-data / FX rate feed",
      "Treasury or liquidity desk that will honor the locked rate",
    ],
  },
  AwaitingFunding: {
    status: "AwaitingFunding",
    title: "Collect KES from the importer",
    handler: "M-Pesa (Daraja)",
    shouldHappen:
      "Fire an STK push (Lipa na M-Pesa) to the importer's phone for the all-in KES amount, then wait for Safaricom's asynchronous callback. Handle timeouts, retries and user cancellation.",
    actuallyHappening:
      "An STK push is sent to Safaricom's Daraja sandbox via the Daraja API. Set ADAPTER_MODE=live + MPESA_ENABLED=true with sandbox creds and a genuine STK push goes out, with the async callback (over your `pnpm tunnel` URL) resolving funding. By default the sandbox runs offline — the 'Simulate M-Pesa funding' button fires the same callback so the demo works without network.",
    regulation: [
      "Operate under a CBK-authorized PSP (own license or partner umbrella)",
      "Daraja API / paybill agreement with Safaricom",
      "Kenya Data Protection Act 2019 for customer data",
    ],
    partners: [
      "Safaricom Daraja directly, or a collection aggregator",
      "A provisioned paybill / till number",
    ],
  },
  Funded: {
    status: "Funded",
    title: "Confirm & safeguard the KES",
    handler: "M-Pesa (Daraja)",
    shouldHappen:
      "Verify the signed M-Pesa callback, validate amount + reference, dedupe replays, and record the KES into a segregated client-funds account before doing anything else.",
    actuallyHappening:
      "The Daraja sandbox callback flips the payment to Funded, captures the M-Pesa receipt, and the ledger debits a 'M-Pesa collected (KES)' account. A declined callback (ResultCode != 0) maps to Failed. Signature verification and dedupe are still stubbed (signatureValid is hard-coded).",
    regulation: [
      "Safeguarding / segregation of client funds (trust account)",
      "AML transaction monitoring on inflows",
      "Verified webhook signatures",
    ],
    partners: [
      "A settlement bank for the KES collection / trust account",
      "Reconciliation feed from Safaricom",
    ],
  },
  OnRamped: {
    status: "OnRamped",
    title: "Convert KES → USDC",
    handler: "On-ramp (Swypt / Kotani)",
    shouldHappen:
      "Hand the collected KES to a licensed on-ramp that converts to a USD stablecoin (USDC) at the locked rate and delivers it into the Bandari treasury wallet. Reconcile the amount received against the expected amount.",
    actuallyHappening:
      "PLACEHOLDER: the conversion happens in-process at the quoted rate and the ledger credits treasury stablecoin. No real on-ramp provider is called.",
    regulation: [
      "On-ramp holds the VASP / crypto-exchange license (not Bandari, initially)",
      "Travel-rule data sharing on the crypto transfer",
      "Kenya's emerging VASP framework",
    ],
    partners: [
      "KES→USDC on-ramp: Swypt, Kotani Pay, or Yellow Card",
      "USDC liquidity provider and a settlement account they pay into",
    ],
  },
  Bridging: {
    status: "Bridging",
    title: "Move USDC to Hong Kong",
    handler: "Custody (EVM / Circle)",
    shouldHappen:
      "From a controlled treasury wallet, transfer the stablecoin (USDC) to the HK wallet (same-chain) or via bridge/CCTP cross-chain. Capture the tx hash, manage gas, and protect the signing keys.",
    actuallyHappening:
      "The mock backend returns a deterministic fake tx hash. The testbed path (CUSTODY_PROVIDER=evm) does a REAL stablecoin transfer on Base Sepolia testnet via viem. No mainnet, no real value.",
    regulation: [
      "Custody & key-management controls; VASP coverage for holding/transmitting crypto",
      "Sanctions / wallet-address screening before sending",
      "Travel rule on the transfer",
    ],
    partners: [
      "Custody / wallet infra: Circle Developer-Controlled Wallets or Fireblocks",
      "Address-screening provider (Chainalysis / TRM)",
      "USDC issuer (Circle)",
    ],
  },
  Bridged: {
    status: "Bridged",
    title: "Confirm on-chain settlement",
    handler: "Custody (EVM / Circle)",
    shouldHappen:
      "Wait for N on-chain confirmations (or the bridge attestation), verify the USDC actually landed in the HK wallet, then move it treasury→HK in the ledger.",
    actuallyHappening:
      "Mock confirm returns 'confirmed' after a short delay with a fake attestation. The testbed path polls a real testnet receipt and asserts exact balance deltas.",
    regulation: [
      "Same custody / VASP controls as the send leg",
      "Audit-grade record-keeping of on-chain settlement",
    ],
    partners: [
      "Node / RPC provider",
      "CCTP attestation service (Circle) when cross-chain",
    ],
  },
  PayingOut: {
    status: "PayingOut",
    title: "Off-ramp in Hong Kong → pay the supplier",
    handler: "HK FX API + payout (Yativo / Thunes)",
    shouldHappen:
      "Hand the HK-side USDC to a licensed HK partner. A HK FX API converts USDC→HKD (≈7.80) and a licensed payout partner delivers the supplier's chosen currency (HKD / CNH / CNY) to their bank or Alipay — with the supplier's KYB on file and trade authenticity checked.",
    actuallyHappening:
      "PLACEHOLDER: a stubbed HK FX call converts USD→HKD at a fixed ≈7.80 and a simulated payout id is generated. No real off-ramp or settlement rail is touched; the supplier's payout details are stored but unused.",
    regulation: [
      "Hong Kong Money Service Operator (MSO) license",
      "China: a PBOC-authorized payment partner; SAFE cross-border rules (only for onshore CNY)",
      "Trade-authenticity / TBML checks; supplier KYB",
    ],
    partners: [
      "HK FX / off-ramp API (licensed HK MSO) for USDC→HKD",
      "HK/China payout aggregator (Yativo, Thunes, Airwallex) or direct onshore PSP",
    ],
  },
  Settled: {
    status: "Settled",
    title: "Close the books",
    handler: "Payout + Ledger",
    shouldHappen:
      "Confirm the supplier received their funds (HKD / CNH / CNY), finalize the settlement id, close the ledger so every account nets to zero, notify both parties, and issue a receipt.",
    actuallyHappening:
      "A mock settlement id is set, the payout currency is credited in the ledger, and reconciliation proves every account nets to zero. The receipt is shown in the UI.",
    regulation: [
      "Transaction reporting / SAR filing where thresholds are hit",
      "Record retention and consumer receipt/disclosure",
    ],
    partners: [
      "Settlement confirmation from the payout partner",
      "Accounting / reconciliation tooling",
    ],
  },
  Refunding: {
    status: "Refunding",
    title: "Reverse on failure",
    handler: "Engine + M-Pesa B2C",
    shouldHappen:
      "When a downstream leg fails, unwind every completed leg, reverse all ledger postings, and return the KES to the importer via an M-Pesa B2C disbursement.",
    actuallyHappening:
      "The engine reverses all ledger postings in-process and marks the payment Refunding→Refunded. No real KES is disbursed.",
    regulation: [
      "Refund / consumer-protection obligations",
      "Documented failed-payment handling",
    ],
    partners: [
      "M-Pesa B2C (Daraja) to return KES",
      "The KES collection bank",
    ],
  },
  Refunded: {
    status: "Refunded",
    title: "Importer made whole",
    handler: "Engine + Ledger",
    shouldHappen:
      "The importer has received their KES back, every account nets to zero, and the failure is recorded for audit and analysis.",
    actuallyHappening:
      "Ledger postings are fully reversed and the reconciliation verifier confirms all accounts net to zero. No real disbursement.",
    regulation: ["Record retention of the reversed transaction"],
    partners: ["KES disbursement rail (M-Pesa B2C)"],
  },
  Failed: {
    status: "Failed",
    title: "Terminal failure",
    handler: "Engine",
    shouldHappen:
      "A payment that failed before any funds were collected ends here with a clear reason; nothing to reverse.",
    actuallyHappening: "Marked Failed with a failure reason; no funds were ever collected in mock mode.",
    regulation: ["Failure logging for audit"],
    partners: [],
  },
};

/** Happy-path playbooks in order, for stepper UIs. */
export const HAPPY_PATH_PLAYBOOK: StagePlaybook[] = HAPPY_PATH.map((s) => STAGE_PLAYBOOK[s]);
