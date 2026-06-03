# USDC → CNH (offshore RMB)

**Use when:** the supplier has a **Hong Kong company / offshore-RMB account** and
is happy to be paid in **CNH** (offshore yuan) — or when CNH is a staging step
before a licensed CNH→onshore-CNY conversion.

CNH is **freely convertible** and trades offshore (HK, London, Singapore), so
this route **never touches mainland capital controls**. It is the natural "RMB"
answer for the large share of exporters who already bank in Hong Kong.

---

## Two facts that define every CNH route

1. **A HK VATP off-ramps to *your own whitelisted account*, not to a third party.**
   SFC-licensed exchanges (HashKey, OSL) will sell your USDC for CNH/HKD/USD and
   send the proceeds to **your** named bank account — they won't pay an arbitrary
   supplier for you. So in the DIY route *we* become the CNH holder, then *we*
   pay the supplier.
2. **CNH is *not* onshore CNY.** Paying a supplier's HK/offshore account in CNH
   "completes" the payment. Turning CNH into mainland CNY is a *separate* licensed,
   documented trade-conversion step (see [`usdc-to-onshore-cny.md`](./usdc-to-onshore-cny.md)).
   Don't conflate the two.

---

## The routes (with named providers)

### Route A — DIY via a HK VATP → our account → pay supplier
```
HK treasury USDC ─▶ SFC VATP (HashKey / OSL) ─▶ CNH/HKD in OUR HK account ─▶ supplier HK account
```
- Off-ramp USDC on a licensed Virtual Asset Trading Platform. **HashKey Exchange**
  supports CNH withdrawals; **OSL** does USDC→HKD/USD.
- Proceeds land in **our** whitelisted HK account (no third-party payout).
- We then transfer CNH (or HKD) to the supplier's HK account.
- **Needs:** a HK entity + CNH/HKD account; enterprise daily off-ramp limits
  (~US$500k–900k/day typical). **Status: live.**

### Route B — Licensed HK payout provider (direct to supplier) — *most embeddable*
```
HK treasury USDC ─▶ licensed provider (off-ramp + payout) ─▶ supplier HK account (CNH)
```
- Hand USDC to a provider that **both** off-ramps **and** pays the supplier:
  **Tazapay** (Digital Assets Licence; Circle Payments Network BFI into Hong Kong)
  or **KUN** (licensed Asia payments; CPN partner).
- One API call; we never hold the CNH ourselves.
- **Verify:** that they deliver **CNH**, not just HKD. **Status: live; preferred
  for an embedded product.**

### Route C — CNH-stablecoin (AxCNH) — *watch only*
```
USDC ─▶ AxCNH (AnchorX, on Conflux) ─▶ settle with an AxCNH counterparty
```
- First licensed offshore-RMB stablecoin; Belt-&-Road trade focus (MOUs w/
  Zoomlion, Lenovo).
- **Licensed in Kazakhstan (AFSA), not HKMA** (HKMA publicly warned on AnchorX);
  China's *Yinfa [2026] No. 42* reaffirms RMB-pegged stablecoins are **illegal
  onshore**. Offshore-only and nascent. **Status: do not build on yet — monitor.**

### Route D — CNH → onshore CNY (only if the supplier insists on onshore)
- Convert the CNH to onshore CNY via **licensed cross-border RMB trade settlement**
  (BOCHK clearing / a licensed bank or PSP) as a **documented trade payment**.
- At this point CNH stops being a shortcut — it follows the same rules as any
  onshore CNY payout. See [`usdc-to-onshore-cny.md`](./usdc-to-onshore-cny.md).

### Route E — Skip explicit CNH: let a provider deliver CNY in one call
- If the supplier only needs onshore CNY, don't manage the CNH hop yourself —
  use a bundled provider (Yativo/Triple-A, a CPN China BFI like KUN, or a licensed
  trade PSP). You hand USDC; supplier gets CNY. (This is really the onshore route.)

---

## Recommendation

- **Embedded product → Route B** (Tazapay / KUN): one call, no HK treasury ops, no
  VATP limits to manage.
- **Treasury-operated / high control → Route A** (HashKey / OSL): we hold the CNH,
  pay on our schedule, but we must run a HK entity + account and respect VATP limits.
- **AxCNH (C):** track for Belt-&-Road counterparties; not a core rail.

---

## Step-by-step (Route B, the embedded case)

| # | Step | Owner / system | Output |
|---|---|---|---|
| 1 | Confirm supplier **HK/offshore-RMB** beneficiary | Onboarding / KYB | Verified CNH beneficiary |
| 2 | Lock amount + CNH quote at `Bridged` | Payment engine | `target = { CNH, amountMinor }` |
| 3 | Submit USDC + beneficiary to provider (off-ramp+payout) | `PayoutBackend("CNH")` | Payout id |
| 4 | Provider sells USDC→CNH and credits supplier HK account | Provider | CNH delivered |
| 5 | Poll to settlement → `Settled` | Payment engine | Settlement id |
| 6 | Ledger: USDC out, **CNH** out (kept distinct from CNY) + audit | Ledger | Reconciles to zero |

---

## Costs & timing (indicative)

| Item | Typical |
|---|---|
| USDC → CNH off-ramp | ~0.1–0.5% spread/fee (VATP or provider) |
| CNH payout to HK account | local/instant rail, minutes–hours |
| FX | USD↔CNH market spread (offshore, tight) |
| Limits | VATP enterprise daily caps (Route A); provider-set (Route B) |
| Speed | Same-day typical; faster than onshore CNY |

---

## Mapping to the prototype

- **State machine:** `Bridged → PayingOut → Settled` (unchanged).
- **New currency:** add **`CNH`** to `CURRENCIES` in
  [`packages/shared/src/money.ts`](../../packages/shared/src/money.ts) (2 decimals).
  **Keep `CNH` and `CNY` separate** in the ledger so reconciliation never nets
  offshore RMB against onshore RMB.
- **Backend:** a `PayoutBackend` with `currency: "CNH"`:
  - Route A backend → VATP off-ramp + internal HK transfer.
  - Route B backend → single provider call (off-ramp + payout). This is the
    closest analogue to today's `ChinaPayoutAdapter` and the easiest to mock.

```ts
// proposed leaf backend (Route B sketch)
class HkCnhPayoutBackend implements PayoutBackend {
  currency = "CNH" as const;
  async createPayout(i: PayoutInput) {
    const p = await provider.payout({           // Tazapay / KUN-shaped
      usdcMinor: i.amountUsdcMinor,
      deliver: { currency: "CNH", amountMinor: i.target.amountMinor },
      beneficiary: i.beneficiary,               // HK/offshore-RMB account
    });
    return { payoutId: p.id, mode: "live", raw: p };
  }
}
```

---

## Failure modes

| Failure | Handling |
|---|---|
| Provider only delivers HKD, not CNH | Pre-flight check; either accept HKD (if supplier ok) or re-route |
| VATP daily limit hit (Route A) | Split across days or fall back to Route B provider |
| Supplier has no offshore account | Re-route to onshore CNY (licensed + documented) |
| Off-ramp price moves | Convert-on-payout (lock at payout time); refund if quote breached |
| AxCNH counterparty unavailable | N/A — not used as a core rail |

---

_Verify each provider's CNH (vs HKD-only) delivery, SFC/VATP status, and current
daily limits before integration. AxCNH status per HKMA notices + PBOC Yinfa [2026]
No. 42. Accessed Jun 2026._
