# USDC → USD (the clean path)

**Use when:** the supplier accepts **USD** into a Hong Kong, Singapore, or other
global USD account — or when we need USD to fund a downstream PSP that settles
the final leg itself.

This is the **cheapest, fastest, lowest-risk** way to turn our USDC into spendable
fiat. There is **no FX** (USDC is a USD token) and **no capital-control surface**
(USD never enters mainland China's controlled system). Prefer this route whenever
the supplier can take USD.

---

## How it works

```
HK treasury USDC  ──redeem 1:1──▶  USD in our bank  ──wire/local──▶  supplier USD account
   (Circle Mint)                     (USD ledger)                      (HK/SG/global)
```

1. **Hold** value in USDC in the treasury wallet (state: `Bridged`).
2. **Redeem** USDC → USD **1:1** via **Circle Mint** (institutional redemption).
   USDC is burned; USD is credited to our linked bank account, typically same-day
   / T+0–T+1 for in-network, no spread.
3. **Pay** the supplier's USD account: SWIFT wire, or a local/instant USD rail via
   a payout partner (Circle Payments Network, Conduit, Tazapay, etc.).
4. **Confirm** settlement → state `Settled`.

> Why 1:1 and free: USDC is a fully-reserved USD stablecoin. Circle Mint is the
> issuer's own on/off-ramp, so redemption is at par with no FX leg. The only costs
> are bank wire fees and any payout-partner fee on the last hop.

---

## Step-by-step (operational)

| # | Step | Owner / system | Output |
|---|---|---|---|
| 1 | Confirm supplier USD beneficiary (name, bank, account, SWIFT/local) | Onboarding / KYB | Verified beneficiary |
| 2 | Lock the payout amount + quote at `Bridged` | Payment engine | `target = { USD, amountMinor }` |
| 3 | Redeem USDC→USD via Circle Mint | Treasury / `PayoutBackend("USD")` | USD in our account, burn tx ref |
| 4 | Disburse USD to supplier (wire / CPN / partner) | Payout partner | Payout id |
| 5 | Poll to terminal settlement | Payment engine | Settlement id → `Settled` |
| 6 | Write balanced ledger rows (USDC out, USD out) + audit event | Ledger | Reconciles to zero |

---

## Costs & timing (indicative)

| Item | Typical |
|---|---|
| USDC → USD (Circle Mint) | **1:1, no spread**; Circle Mint has no per-redemption fee on standard tiers |
| USD payout to supplier | Wire ~$10–30 flat, **or** local/instant USD rail ~0.1–0.5% via partner |
| FX | **None** (USD↔USDC is par) |
| Speed | Redemption T+0–T+1; payout minutes–hours on local rails, ~1 day on SWIFT |

This route is the benchmark all others are measured against: every step toward
CNH or onshore CNY adds cost and latency on top of this baseline.

---

## When to choose USD even if the supplier "wants RMB"

Many Chinese exporters **prefer USD offshore** for trade — it sidesteps onshore
conversion limits and the annual FX quota, and it's what their HK company already
banks in. Always offer USD first if they have a USD account; only step down to
CNH/CNY if they genuinely need RMB.

---

## Mapping to the prototype

- **State machine:** `Bridged → PayingOut → Settled` (unchanged).
- **Backend:** add a `PayoutBackend` with `currency: "USD"` that wraps Circle
  Mint redemption + a USD disbursement partner. Mirrors how
  [`custody/circle.backend.ts`](../../apps/api/src/adapters/custody/circle.backend.ts)
  wraps Circle Wallets.
- **Money:** `USD` already exists in
  [`packages/shared/src/money.ts`](../../packages/shared/src/money.ts) (2 decimals).
  No new currency needed.
- **Ledger:** `debit treasury_usdc / credit … ` then `debit payout_external_usd /
  credit supplier_paid_usd`, balancing per-currency like the CNY example in the
  root [`README.md`](../../README.md).

```ts
// proposed leaf backend (sketch)
class CircleMintUsdBackend implements PayoutBackend {
  currency = "USD" as const;
  async createPayout(i: PayoutInput) {
    const redeem = await circleMint.redeem({ usdcMinor: i.amountUsdcMinor }); // 1:1
    const payout = await usdRail.send({ usdMinor: i.target.amountMinor, beneficiary: i.beneficiary });
    return { payoutId: payout.id, mode: "live", raw: { redeem, payout } };
  }
  // confirmPayout → poll usdRail.status(payoutId)
}
```

---

## Failure modes

| Failure | Handling |
|---|---|
| Circle Mint redemption delayed | Value stays in USDC (no loss); retry; do **not** advance to `PayingOut` until USD is in-account |
| USD wire rejected (bad beneficiary / sanctions hit) | `PayingOut → Refunding`; surface reason; re-collect beneficiary |
| Partial settlement | Reconciliation flags imbalance; hold at `PayingOut`, do not mark `Settled` |
| Supplier has no USD account after all | Re-route to CNH/CNY (see routing tree) before disbursing |

---

## Providers for the last hop

Circle Mint (redemption) → **Circle Payments Network**, **Conduit**, **Tazapay**,
or a bank SWIFT wire for the USD disbursement. See
[`providers-and-integration.md`](./providers-and-integration.md).

---

_Verify Circle Mint eligibility/onboarding and partner USD-payout coverage for HK/
the supplier's jurisdiction before go-live. Accessed Jun 2026._
