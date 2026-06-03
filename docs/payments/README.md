# USDC → "the currency they want": payout processes

How Bandari turns the **USDC it holds** into the currency a supplier actually
accepts — **USD**, **offshore RMB (CNH)**, or **onshore CNY** — legally,
cheaply, and fast.

> Scope: this folder documents the full corridor as **process-design docs** —
> they describe the real-world process we *would* run and how it maps onto the
> prototype's adapters and state machine. The **front half** (collect KES via
> M-Pesa, on-ramp to USDC) is detailed in [`kenya-leg.md`](./kenya-leg.md); the
> **back half** (USDC → USD/CNH/CNY) is the rest of this folder. Nothing here
> moves real money today.

---

## The one principle that makes all of this legal

**USDC is the transit asset, never the destination.** We hold value in USDC
right up until the moment of payout, then **convert-on-payout** into the
currency the supplier wants, through a **licensed** off-ramp + payout partner.

Two facts follow from this and from China's closed capital account:

1. **No on-chain USDC ever lands in a mainland Chinese account.** The chain stops
   offshore (Hong Kong / a licensed partner). The last hop into China is always
   a *fiat*, *licensed*, *documented* trade payment — never a token transfer.
2. **"USDC → CNY" is never one on-chain step.** It is always at least two hops:
   `USDC → (USD/HKD/CNH offshore) → onshore CNY via a licensed PSP`. Good
   providers *bundle* those hops behind one API call so it *looks* like one step.

Everything in this folder is a variation on: **off-ramp USDC offshore → deliver
the currency the supplier wants.**

---

## Pick the currency first, then the route

The decision is driven by **what the supplier can receive**, not by what's
technically cleverest. Ask one question: *what account does the supplier want to
be paid into?*

| Supplier wants / has | Deliver | Route doc | Why |
|---|---|---|---|
| A **USD** account (HK, SG, global) | **USD** | [`usdc-to-usd.md`](./usdc-to-usd.md) | Cleanest. Circle Mint redeems USDC→USD 1:1; no FX, no capital-control surface. |
| A **HK / offshore-RMB** account | **CNH** | [`usdc-to-cnh.md`](./usdc-to-cnh.md) | Offshore RMB is freely convertible. Settles offshore — never touches mainland controls. |
| **Only** an onshore mainland account | **Onshore CNY** | [`usdc-to-onshore-cny.md`](./usdc-to-onshore-cny.md) | The hard case. Requires a licensed China PSP + a full trade-document pack. |

**Default behaviour:** prefer **USD → CNH → onshore-CNY**, in that order of
preference, because each step down adds cost, latency, and compliance surface.
Most Chinese exporters of any size already hold a Hong Kong company + HK account
precisely so they can be paid offshore — so the CNH/USD routes cover a large
share of suppliers and avoid the onshore machinery entirely.

A more granular per-segment decision tree lives at the bottom of this file.

---

## How this maps onto the prototype

The corridor's state machine
([`packages/shared/src/payment-states.ts`](../../packages/shared/src/payment-states.ts)):

```
Quoted → AwaitingFunding → Funded → OnRamped → Bridging → Bridged → PayingOut → Settled
                                       └── custody (USDC) ──┘   └── payout ──┘
                  │              │          │          │
                  └──────────── Refunding → Refunded ─┘   (any downstream failure)
```

The "USDC → currency they want" conversion is the **`Bridged → PayingOut →
Settled`** segment. Today that is a single CNY-only adapter:

- `ChinaPayoutAdapter.createPayout(input)` — `Bridged → PayingOut`
- `ChinaPayoutAdapter.confirmPayout(payoutId)` — `PayingOut → Settled`

with `PayoutInput = { amountUsdcMinor, cnyMinor, beneficiary }`
([`apps/api/src/adapters/china-payout.adapter.ts`](../../apps/api/src/adapters/china-payout.adapter.ts)).

### Proposed generalisation (multi-currency payout)

To support USD / CNH / CNY, mirror the **custody backend pattern**
(`mock | evm | circle` selected from config in
[`apps/api/src/adapters/custody/`](../../apps/api/src/adapters/custody/)) for
payouts. Select a **payout backend by target currency / route**:

```ts
// proposed — extends today's PayoutInput
type PayoutCurrency = "USD" | "CNH" | "CNY";

interface PayoutInput {
  amountUsdcMinor: number;
  target: { currency: PayoutCurrency; amountMinor: number };
  route: PayoutRoute;          // see routing-and-decision below
  beneficiary: Beneficiary;    // + tradeDoc pack for CNY (see compliance doc)
}

interface PayoutBackend {           // one per provider, like CustodyBackend
  readonly currency: PayoutCurrency;
  createPayout(input: PayoutInput): Promise<PayoutCreateResult>;
  confirmPayout(payoutId: string): Promise<PayoutConfirmResult>;
}
// buildPayoutBackend(config, route) → mock | circle-mint | hk-vatp | cn-psp ...
```

This keeps the engine, ledger, and stage verifiers unchanged — only the leaf
backend differs by currency, exactly like custody's `mock ⇄ evm ⇄ circle`.

> Note: add `CNH` to `CURRENCIES` in
> [`packages/shared/src/money.ts`](../../packages/shared/src/money.ts) (2 decimals,
> same as CNY) when CNH payout is implemented. Keep it distinct from `CNY` in the
> ledger so reconciliation never silently nets offshore against onshore RMB.

---

## What's real vs. mocked

| Hop | Prototype today | Real-world process |
|---|---|---|
| KES collection | `MpesaAdapter` (mock / Daraja sandbox STK) | M-Pesa STK/paybill + Pesalink/RTGS by ticket → see [`kenya-leg.md`](./kenya-leg.md) |
| KES → USDC on-ramp | `OnRampAdapter` (mock / Swypt-shaped stub) | Licensed on-ramp (Swypt/Kotani) → see [`kenya-leg.md`](./kenya-leg.md) |
| USDC custody + transfer | `mock` / `evm` (Base Sepolia) / `circle` sandbox | Circle Mint or self-custody treasury |
| USDC → USD | not modelled | Circle Mint redemption (1:1) → see [`usdc-to-usd.md`](./usdc-to-usd.md) |
| USDC → CNH | not modelled | HK VATP off-ramp / licensed HK payout → see [`usdc-to-cnh.md`](./usdc-to-cnh.md) |
| USDC → CNY | `ChinaPayoutAdapter` (mock; Yativo-shaped live stub) | Licensed China PSP + trade pack → see [`usdc-to-onshore-cny.md`](./usdc-to-onshore-cny.md) |

Flip `ADAPTER_MODE=live` + provide partner keys to exercise the live stubs (see
[`providers-and-integration.md`](./providers-and-integration.md)).

---

## Documents in this folder

| File | What it covers |
|---|---|
| [`kenya-leg.md`](./kenya-leg.md) | The front half: collect KES (M-Pesa/Pesalink/RTGS by ticket size), KYC gate, on-ramp KES→USDC (Swypt/Kotani), Kenya VASP licensing + tax, FX |
| [`usdc-to-usd.md`](./usdc-to-usd.md) | The clean path: Circle Mint redemption, when to use USD, costs, adapter notes |
| [`usdc-to-cnh.md`](./usdc-to-cnh.md) | Offshore-RMB routes: HK VATP (HashKey/OSL), licensed HK payout (Tazapay/KUN), AxCNH (watch) |
| [`usdc-to-onshore-cny.md`](./usdc-to-onshore-cny.md) | The hard path: licensed China PSP, trade pack, SAFE/purpose codes, card-freeze avoidance |
| [`compliance-and-trade-pack.md`](./compliance-and-trade-pack.md) | KYB, entity-match, the trade-document pack, sanctions/Travel Rule, what each leg must persist |
| [`providers-and-integration.md`](./providers-and-integration.md) | Provider matrix, embeddability, USDC acceptance, BD asks, integration notes |

---

## Per-segment routing decision tree

```
START: payment is Bridged (USDC sits in the HK treasury wallet)
│
├─ Does the supplier accept USD?  ───────────────── YES → USD route (Circle Mint)        [cheapest]
│        (HK/SG/global USD account)
│
├─ Does the supplier have a HK / offshore-RMB account? ─ YES → CNH route                  [offshore, fast]
│        (settle in CNH; or convert CNH→CNY only if they ask)
│
└─ Supplier can ONLY receive onshore CNY  ───────────────→ onshore-CNY route             [licensed + documented]
         │
         ├─ Have a complete trade-doc pack?  ── NO → block / request docs (don't force it)
         │       (invoice, contract, customs, purpose code)
         │
         └─ YES → licensed China PSP / bundled provider
                   (XTransfer · PingPong · Airwallex · Yativo/Triple-A · Circle CPN China BFI)
                   → CNY lands in the supplier's mainland bank / Alipay account

Fallback at any node: if the chosen rail rejects (limit/KYB/doc failure), fall
back UP the preference order (CNY→CNH→USD) only if the supplier has an account
for it; otherwise pause and refund per the state machine (→ Refunding).
```

---

_Sources for the underlying research live in the Bandari Research Hub canvas and
[`research/RESEARCH_HANDOFF.md`](../../research/RESEARCH_HANDOFF.md). Verify any
provider's current licence + USDC support before integration; this space moves
fast. Accessed Jun 2026._
