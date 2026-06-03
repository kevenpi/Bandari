# Providers & integration readiness

Who we'd actually call to off-ramp USDC and deliver USD / CNH / onshore CNY, how
embeddable each is, and how they map onto the prototype's adapters.

> Verify everything before integration — licences, USDC support, and currency
> coverage change fast. "USDC accept" below means *can they take stablecoin in*;
> if not, we off-ramp to USD via **Circle Mint** first and fund them in USD.

---

## Provider matrix

| Provider | Embeddable? | USDC in? | Delivers | Licence / basis | Best for |
|---|---|---|---|---|---|
| **Circle Mint** | API (institutional) | redeem USDC→USD 1:1 | USD | Circle (issuer) | The USD off-ramp; baseline for every route |
| **Circle Payments Network (CPN)** | API | yes (network) | USD + listed corridors (incl. China via a BFI) | Network of licensed BFIs | USD payout; CNY *if* a live China BFI is active |
| **Tazapay** | API — embeddable | yes (Digital Assets Licence) | USD, HKD, **CNH** (verify), CNY corridors | SG/HK licences; CPN BFI into HK | Embedded HK/CNH payout (Route B) |
| **KUN** | API — embeddable | yes | Asia incl. **CNY** | Licensed Asia payments; CPN partner | Embedded CNH/CNY payout |
| **Yativo / Triple-A** | API — embeddable | yes | **CNY** (bundled USDC→CNY) | Licensed PSP partners | One-call USDC→CNY (the prototype's shape) |
| **XTransfer** | BD / partnership (not self-serve yet) | announced (not confirmed live) | **CNY** ~0.4% | Own X-Net + licences | Onshore CNY at scale (partnership) |
| **PingPong** | BD / partnership | via USD | **CNY** | Own China payment licence | Onshore CNY trade payments |
| **Airwallex** | API | via USD | **CNY** + global | **Own PBOC licence** (Yunhui Pay), UnionPay+NUCC | Onshore CNY; broad coverage |
| **HashKey Exchange** | VATP (own-account off-ramp) | yes | **CNH**/HKD to *our* account | SFC VATP (VASP-001) | DIY CNH off-ramp (Route A) |
| **OSL** | VATP (own-account off-ramp) | yes | HKD/USD to *our* account | SFC VATP (VASP-002) | DIY USD/HKD off-ramp (Route A) |
| **AnchorX (AxCNH)** | emerging | yes | CNH-stablecoin | AFSA (Kazakhstan), **not HKMA** | Watch only — not a core rail |
| **Conduit** | API — embeddable | yes | USD + corridors | Licensed partners | USD disbursement alternative |

Key nuance: **these are independent licensed rails, not resellers of each other.**
Airwallex runs its *own* PBOC licence; XTransfer its own X-Net; PingPong its own
licence. Good for us — several substitutable providers, **no single-rail
dependency**, easy fallback.

---

## Integration readiness (the honest version)

| Rail | Embed today | USDC funding | CNY delivery |
|---|---|---|---|
| **Circle Mint + CPN** | API, institutional onboarding | native | USD now; CNY needs a live China BFI on CPN |
| **Tazapay / KUN** | self-serve-ish API | yes | yes (verify CNH vs HKD vs CNY per corridor) |
| **Yativo / Triple-A** | API | yes | yes — bundled USDC→CNY (closest to prototype) |
| **XTransfer** | partnership/BD via X-Net (referral program is mostly referral) | announced Aug 2025, not confirmed live — fund in USD for now | yes, licensed, ~0.4% |
| **Airwallex** | API | fund in USD | yes, own PBOC licence |
| **HashKey / OSL** | exchange accounts, own-account withdrawals | yes | no direct supplier payout (own-account only) |

**Takeaway for the build:** start with a **bundled USDC→CNY provider (Yativo/Triple-A
or KUN)** for the onshore case and **Tazapay/KUN** for CNH — both are embeddable and
match the existing `ChinaPayoutAdapter` shape. Treat **XTransfer/Airwallex/PingPong**
as scale/BD partners to add once volume justifies the relationship. Use **Circle
Mint** as the universal USD off-ramp underneath all of it.

---

## How providers map onto the prototype adapters

Today (CNY-only), live mode posts to a Yativo-shaped endpoint
([`apps/api/src/adapters/china-payout.adapter.ts`](../../apps/api/src/adapters/china-payout.adapter.ts)):

```ts
// existing live call
POST {CHINA_PAYOUT_BASE_URL}/wallet/payout
Authorization: Bearer {CHINA_PAYOUT_API_KEY}
{ amountUsdcMinor, cnyMinor, beneficiary }
```

Proposed multi-currency shape — one **`PayoutBackend` per provider**, selected by
target currency/route (mirrors custody's `mock | evm | circle` in
[`apps/api/src/adapters/custody/`](../../apps/api/src/adapters/custody/)):

| Target | Backend | Provider | Env (suggested) |
|---|---|---|---|
| USD | `circle-mint` | Circle Mint (+ CPN/Conduit) | `CIRCLE_*`, `USD_PAYOUT_*` |
| CNH | `hk-cnh` | Tazapay / KUN (Route B) or HashKey/OSL (Route A) | `CNH_PAYOUT_BASE_URL` / `_API_KEY` |
| CNY | `cn-psp` | Yativo/Triple-A (now) → XTransfer/Airwallex (scale) | `CHINA_PAYOUT_BASE_URL` / `_API_KEY` |
| any | `mock` | deterministic stub | default (`ADAPTER_MODE=mock`) |

Each backend keeps `createPayout` / `confirmPayout` so the engine, ledger, and
stage verifiers are untouched. Flip `ADAPTER_MODE=live` + set the relevant keys to
exercise a real sandbox (see root [`README.md`](../../README.md) "Going live").

---

## BD asks (what to confirm with each provider before integrating)

For **every** provider:

1. Do you accept **on-chain USDC** as funding, or must we fund in **USD**? Which chains?
2. Exactly which currency do you **deliver** — USD / HKD / **CNH** / **onshore CNY**? (Don't assume CNH if they only do HKD.)
3. Licences held for the **destination** (HK VASP/MSO; China PBOC/inbound trade).
4. **Trade-document** requirements + purpose-code handling for CNY.
5. **Limits:** per-transaction, daily, per-beneficiary, per-purpose-code.
6. **Settlement speed** + cut-off times; weekend/holiday behaviour.
7. **All-in price:** off-ramp spread + FX + payout fee.
8. **Failure/refund** path + reason codes (esp. card-freeze / SAFE rejection returns).
9. **Travel-Rule** handling on the VASP hop.
10. Embedding model: **API self-serve** vs **partnership/BD** vs **referral**.

---

_All licensing/coverage claims are point-in-time (Jun 2026). Re-verify against each
provider's current docs + the SFC VATP register / PBOC notices before go-live.
Background research: Bandari Research Hub canvas + [`research/RESEARCH_HANDOFF.md`](../../research/RESEARCH_HANDOFF.md)._
