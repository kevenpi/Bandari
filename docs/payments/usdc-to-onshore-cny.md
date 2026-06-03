# USDC → onshore CNY (the hard path)

**Use when:** the supplier can **only** receive **onshore CNY** into a mainland
Chinese bank account (or Alipay/WeChat Pay). This is the case the whole corridor
is ultimately about, and the one that demands the most care.

This route is **the prototype's current `ChinaPayoutAdapter`** (Yativo-shaped)
generalised for production. It is legal, common, and well-trodden — **but only
through a licensed PSP and with a complete trade-document pack.** There is no
shortcut and no on-chain step into China.

---

## The hard truth (why there's no "USDC → CNY button")

China runs a **closed capital account**:

- **Crypto is banned** for payments/settlement onshore — no on-chain USDC may
  land in a mainland account. RMB-pegged stablecoins are illegal onshore
  (*PBOC Yinfa [2026] No. 42*).
- **CNY is not freely convertible.** Inbound foreign currency → CNY conversion is
  controlled by **SAFE** and routed through **licensed** banks/PSPs.
- Conversion is permitted under the **current account** (trade in goods/services)
  with a **purpose-of-payment code** and supporting documents — **not** under the
  capital account.

So the only compliant shape is:

```
HK treasury USDC ─▶ USD (Circle Mint) ─▶ licensed China PSP ─▶ FX→CNY (SAFE) ─▶ supplier mainland account
        offshore, on-chain stops here ─────────────┘  the inbound leg is fiat, licensed, documented
```

A good provider **bundles** the USDC off-ramp + the FX + the onshore payout behind
one API, so it *looks* like one step — but underneath it is always
USDC→USD→(licensed inbound)→CNY.

---

## What makes it legal: the trade-document pack

The conversion is justified as a **payment for goods/services** (current account).
Every payout must carry, and we must persist:

- **Commercial invoice** (amount, goods, parties)
- **Trade contract / PO**
- **Customs declaration / shipping docs** (where applicable)
- **Purpose-of-payment code** (correct trade category)
- **Entity match:** the importer we collected from and the supplier we pay must be
  the **real trade counterparties** — names on the invoice = names on the payment.
- **SAFE declaration** fields as required by the PSP.

Full field list + persistence requirements: see
[`compliance-and-trade-pack.md`](./compliance-and-trade-pack.md). **If the pack is
incomplete, do not force the payment** — pause and request documents.

---

## Step-by-step (operational)

| # | Step | Owner / system | Output |
|---|---|---|---|
| 1 | KYB importer + supplier; collect trade-doc pack | Onboarding / KYC adapter | Verified parties + docs |
| 2 | Confirm supplier onshore beneficiary (bank/Alipay, name match) | Onboarding | Verified CNY beneficiary |
| 3 | Lock CNY amount + FX quote at `Bridged` | Payment engine | `target = { CNY, cnyMinor }` |
| 4 | Off-ramp USDC→USD (Circle Mint) — value stays ours until payout | Treasury | USD funded |
| 5 | Submit payout + trade pack to licensed China PSP | `PayoutBackend("CNY")` | Payout id |
| 6 | PSP does inbound FX→CNY under SAFE + pays supplier | PSP | CNY delivered |
| 7 | Poll to settlement → `Settled` | Payment engine | Settlement id |
| 8 | Ledger: USDC out → CNY out (per-currency balanced) + audit | Ledger | Reconciles to zero |

This is exactly the prototype's `Bridged → PayingOut → Settled` via
`createPayout` / `confirmPayout`
([`apps/api/src/adapters/china-payout.adapter.ts`](../../apps/api/src/adapters/china-payout.adapter.ts)),
with the trade pack added to `PayoutInput`.

---

## Providers (licensed for CNY inbound trade payments)

| Provider | Notes |
|---|---|
| **XTransfer** | Own X-Net trade-settlement + risk control; ~0.4% inbound; BD/partnership, not yet self-serve API |
| **PingPong** | Own China payment licence; trade-focused |
| **Airwallex** | **Own PBOC licence** (via Yunhui Pay) on UnionPay + NUCC clearing — one of few foreign-owned firms with a China payment licence; a competitor to (not reseller of) XTransfer |
| **Yativo / Triple-A** | Stablecoin-in → CNY-out, bundled; embeddable |
| **Circle Payments Network (China BFI)** | CPN lists China; requires a **live licensed BFI** active on the network |
| **Yativo-shaped (prototype stub)** | What `ChinaPayoutAdapter` live mode targets (`/wallet/payout`) |

These are **independent licensed rails, not resellers of each other** — good for
Bandari: substitutable providers, no single-rail dependency. Detail + integration
readiness in [`providers-and-integration.md`](./providers-and-integration.md).

---

## Costs & timing (indicative)

| Item | Typical |
|---|---|
| USDC → USD | 1:1 (Circle Mint), no spread |
| Inbound FX USD→CNY + onshore payout | ~0.3–0.6% all-in via licensed PSP (e.g. XTransfer ~0.4%) |
| Speed | Same-day to T+1 once docs clear; slower if SAFE/doc review triggers |
| Limits | Per-beneficiary / per-purpose-code caps; PSP-set |

---

## Mapping to the prototype

- **State machine:** `Bridged → PayingOut → Settled` (unchanged).
- **Backend:** generalise `ChinaPayoutAdapter` into a `PayoutBackend` with
  `currency: "CNY"`; live mode already posts to a Yativo-shaped `/wallet/payout`.
  Add the trade pack to the request body.
- **`PayoutInput`:** today `{ amountUsdcMinor, cnyMinor, beneficiary }`. Extend
  `beneficiary`/input to carry `tradeDoc` (invoice id, contract id, purpose code,
  customs ref) and onshore method (`bank | alipay`, already supported).
- **Ledger:** `debit payout_external_cny / credit supplier_paid_cny` — exactly the
  CNY rows shown in the root [`README.md`](../../README.md) documented run.

```ts
// today (apps/api/src/adapters/china-payout.adapter.ts)
interface PayoutInput {
  amountUsdcMinor: number;
  cnyMinor: number;
  beneficiary: Beneficiary; // { name, country, payoutMethod: "bank"|"alipay", account..., bankName? }
}

// proposed addition for production
interface CnyPayoutInput extends PayoutInput {
  tradeDoc: {
    invoiceId: string;
    contractId?: string;
    purposeCode: string;        // SAFE trade category
    customsRef?: string;
    declaredGoods: string;
  };
}
```

---

## Failure modes (the ones that bite on the China leg)

| Failure | Cause | Handling |
|---|---|---|
| **Card freeze (冻卡)** | Supplier account flagged in an AML sweep / mixed with bad funds | Pay only verified trade beneficiaries; clean provenance; avoid personal-card payouts; if frozen, PSP returns funds → `Refunding` |
| Doc/SAFE rejection | Incomplete or mismatched trade pack | Block before submit; request docs; never "force" via a wrong purpose code |
| Entity mismatch | Payer/payee ≠ invoice parties | Hard fail at KYB; do not proceed |
| FX/quota limit | Beneficiary or purpose-code cap reached | Split per rules or schedule; or route supplier's HK account in CNH/USD instead |
| Provider rejects USDC funding | Provider wants USD, not on-chain USDC | Off-ramp to USD first (Circle Mint), fund provider in USD |
| Partial / stuck payout | PSP-side delay | Hold at `PayingOut`; reconciliation flags; do not mark `Settled` |

---

## Decision: don't force onshore CNY

If the supplier has a **HK/USD account**, prefer [USD](./usdc-to-usd.md) or
[CNH](./usdc-to-cnh.md) — cheaper, faster, far less compliance surface. Use this
onshore route only when the supplier genuinely has no offshore option.

---

_Verify each PSP's current China licence, USDC-funding support, purpose-code
handling, and limits before go-live. Regulatory basis: PBOC/SAFE current-account
rules; PBOC Yinfa [2026] No. 42 (stablecoin). Accessed Jun 2026._
