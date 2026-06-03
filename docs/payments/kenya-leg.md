# Kenya leg: collect KES → on-ramp to USDC

The **front half** of the corridor: take the importer's Kenyan shillings and turn
them into the **USDC** that the payout docs (`usdc-to-*`) then deliver to the
supplier. This is the leg where **Bandari owns the customer**, so it gets the
most care.

> Scope: collection (`Quoted → Funded`) and on-ramp (`Funded → OnRamped`). The
> back half — USDC → USD/CNH/CNY — lives in the other docs in this folder. Like
> them, this is a **process-design doc**: it describes the real process we would
> run and how it maps onto the prototype's adapters and state machine. Nothing
> here moves real money today.

---

## Why this leg matters more than the rail

The newsletter framing applies directly here:

- **This is where we earn the customer relationship and the data.** Every other
  player (Yiwu Pay, the PSPs) treats the Kenyan buyer as a faceless payer. The
  collection + on-ramp step is our KYC/KYB touchpoint, our first data point, and
  the anchor for later **importer credit**.
- **We sell velocity, not just a cheaper transfer.** A faster KES→USDC step only
  matters if it lets the importer turn working capital more times per year.
  Credit (later) is what actually changes turn frequency; the Kenya leg is where
  we observe the data that makes that credit underwritable.
- **Legibility is the product.** The grey path (P2P USDT) is illegitimate-looking
  even when it's legitimate. Doing this through a **licensed on-ramp with clean
  KYC and an audit trail** is what makes the same trade *legible* downstream.

---

## The two sub-legs at a glance

```
Quoted ─────────────────────────────► AwaitingFunding ─► Funded ─────────► OnRamped
   │  lock a KES/USD quote (TTL)          │ STK push /        │ KES→USDC      │ USDC in
   │  + show importer the all-in price    │ paybill / wire    │ via licensed  │ treasury
   │                                      │ KYC/KYB gate      │ on-ramp       │ wallet
   └─ collection (KES in) ────────────────────────────────┘  └─ on-ramp ─────┘
```

| Sub-leg | State transition | Prototype adapter |
|---|---|---|
| **Collection** (KES in) | `Quoted → AwaitingFunding → Funded` | [`MpesaAdapter`](../../apps/api/src/adapters/mpesa.adapter.ts) |
| **KYC/KYB gate** | gates `Funded` | [`KycAdapter`](../../apps/api/src/adapters/kyc.adapter.ts) |
| **On-ramp** (KES→USDC) | `Funded → OnRamped` | [`OnRampAdapter`](../../apps/api/src/adapters/onramp.adapter.ts) |

---

## Sub-leg 1 — Collection (getting KES in)

### Rails, and the one problem that decides everything: **limits**

Importer invoices are large ($2k–$50k+ ≈ KES 260k–6.5M). **M-Pesa's consumer
caps are well below a typical invoice**, so the collection rail must be chosen by
ticket size. This is the single most important design fact on the Kenya side.

| Rail | Per-txn cap (2026) | Daily cap | Fee (who pays) | Use for |
|---|---|---|---|---|
| **M-Pesa STK Push** (Lipa na M-Pesa Online) | KES 250,000 | KES 500,000 wallet/day | customer pays paybill tariff (caps ~KES 105) | small invoices / deposits / the smooth UX |
| **M-Pesa Paybill C2B** | KES 999,999 (big billers negotiate higher) | per merchant agreement | customer pays (fee-free to merchant) | mid invoices; offline/manual pay |
| **Buy Goods Till** | KES 500,000 | KES 5,000,000 inflow | merchant 0.5% capped KES 200 | mid invoices (verify tier) |
| **Pesalink** (bank↔bank instant) | ~KES 999,999–1,000,000 | bank-set, often 1M+ | capped ~KES 250 | large invoices, bank-initiated |
| **RTGS** (same-day high value) | none (high-value) | — | KES 200–500 | invoices > KES 1M |
| **EFT** (next-day batch) | high | — | KES 50–150 | non-urgent large invoices |

**Consequence — the collection design:**

1. **Small / deposit (≤ KES 250k):** **STK Push** — best UX (phone prompt, PIN,
   instant callback). This is what the prototype models today.
2. **Mid (KES 250k–1M):** **Paybill C2B** (raised-limit paybill) or **Pesalink**.
   Avoid splitting an STK push into many tranches — it multiplies failure surface
   and looks like structuring (an AML red flag).
3. **Large (> KES 1M):** **Pesalink** (≤ ~1M) or **RTGS** (above). Bank-grade,
   one clean transfer, full reference data — also the most *legible* for
   compliance.

> **Get a raised-limit paybill + a bank/RTGS path early.** A single STK push can
> never collect a $10k invoice. The "real" collection product is paybill +
> bank/Pesalink/RTGS, with STK push reserved for small tickets and deposits.

### KYC/KYB gate (before `Funded` is honoured)

Collection without identity is how you become the next **Flutterwave** (KES ~6.2B
frozen after a Ponzi routed through loose merchant KYC). Gate funding on:

- **KYB** of the importer business (registration, beneficial ownership).
- **KYC** of the paying individual (M-Pesa name vs. account holder match).
- **Screening** (sanctions/PEP) + **purpose of payment** captured up front.
- **Structuring watch** — many sub-limit payments toward one invoice is a flag.

Maps to [`KycAdapter`](../../apps/api/src/adapters/kyc.adapter.ts); persists to the
audit trail described in [`compliance-and-trade-pack.md`](./compliance-and-trade-pack.md).

---

## Sub-leg 2 — On-ramp (KES → USDC)

### What the importer does today (the grey path we replace)

Kenyan SMEs already buy **USDT (usually TRON/TRC-20)** with KES via P2P or
exchanges, then send it to the supplier's wallet — fees often <$2, settles in
minutes. It works but is **non-compliant, unlicensed, and freeze-prone**. Our job
is to deliver the *same speed and cost* on a **licensed, KYC'd, auditable** rail.

### Licensed on-ramp providers

| Provider | Model | KES in | Delivers | Licence basis | Notes |
|---|---|---|---|---|---|
| **Swypt** | API, **non-custodial** | M-Pesa STK Push / paybill / QR | USDC/USDT to *our* wallet | Kenyan; KYC via Sumsub | No upfront fee; cost on payout side, off-ramp **<1%**; OTC desk via API for high volume; depends on Daraja 3.0 |
| **Kotani Pay** | White-label API | mobile money | cUSD/USDT/USDC/DAI, 15+ chains | FSCA (SA) FSP #53594 | Deep stablecoin liquidity; enterprise white-label |
| **Yellow Card / Fonbnk / others** | API | mobile money / bank | USDC/USDT | per-market licences | Alternates for liquidity/fallback — verify Kenya status |

**Recommended:** integrate **two** providers behind one interface (primary +
fallback) so a single provider's liquidity gap, downtime, or Daraja hiccup can't
stall the corridor. Swypt's **non-custodial** model is attractive — funds land in
*Bandari's* wallet, not the provider's, cutting counterparty risk.

### Mechanics (Swypt-shaped, matches the live stub)

```
1. quote   POST /api/fx-quotes        { type:"onramp", amount, fiatCurrency:"KES", cryptoCurrency:"USDC", network }
2. onramp  POST /api/onramp-orders     { partyA: msisdn, amount: KES, side:"onramp", userAddress, tokenAddress }
3. STK push fires → importer enters M-Pesa PIN
4. deposit POST /api/deposit          → USDC released on-chain to userAddress (our treasury wallet)
```

USDC asset ids/contracts are per-chain (e.g. Algorand asset `31566704`); choose a
chain that the **payout** leg can off-ramp cheaply (Base/Ethereum for Circle Mint;
keep USDC, not USDT, to stay on the clean Circle path — see
[`usdc-to-usd.md`](./usdc-to-usd.md)).

### Rates, spread, liquidity

- **FX context:** KES/USD ≈ **129.5** (May 2026), **stable** below 130; CBK
  reserves ~$13.2B / **5.6 months** import cover. Low near-term devaluation risk,
  but watch debt-service + remittance-inflow pressure flagged by CBK.
- **Where our margin comes from:** the **spread** between the KES/USD we quote the
  importer and the rate the on-ramp gives us, plus a transparent fee — captured
  **at conversion**, not by holding KES (we never sit on shillings; convert-on-collect).
- **Liquidity:** route high-value tickets through the provider's **OTC desk** for a
  tighter, guaranteed rate; small tickets through the standard pool.
- **Quote TTL:** lock the KES/USD quote with a short expiry (the prototype carries
  `rateKesPerUsd` on the quote); if funding arrives after expiry, re-quote.

---

## Regulation & licensing (Kenya) — the part that's existential

| Instrument | What it governs | Bandari implication |
|---|---|---|
| **VASP Act 2025** (eff. **21 Oct 2025**, Act 20/2025) | Licensing of virtual-asset services | On/off-ramp = licensed activity. **CBK** licenses payment/wallet/stablecoin VASPs; **CMA** licenses exchanges/brokers. |
| **Draft VASP Regulations 2026** | Operationalises the Act | Public participation closed **10 Apr 2026**; final expected **May/Jun 2026**; ~**6–9 month grace** after gazettement. |
| Capital / structure | Solvency & governance | Local **company limited by shares**, local office, **Kenyan board representation**, fit-and-proper, AML/CFT. Paid-up capital ~**KES 50M–200M** by activity (stablecoin *issuer* ~KES 500M — not us). **No single shareholder > 33.3%** of an exchange/issuer/wallet. |
| **POCAMLA** + FATF **Travel Rule** | AML/CFT, VASP-to-VASP data | KYC/KYB, screen, attach Travel-Rule data on the on-ramp hop. |
| **Data Protection Act 2019** (ODPC) | Importer personal data | Lawful basis, storage, minimisation. |
| **NPS Act 2011** | Payment-service regulation | The M-Pesa collection leg rides a licensed PSP (Safaricom). |

**Tax (verified Jun 2026):** the 3% Digital Asset Tax was **repealed** (Finance
Act 2025) and replaced by a **10% excise duty on VASP fees/commissions** (tax on
our *fee*, not transaction value). **Finance Bill 2026** adds VASP **annual
information returns to KRA**, customer identification, transaction reporting, and
cross-border data exchange. Income/CGT still apply to gains.

### The licensing decision (do this deliberately)

1. **Launch (fastest, compliant):** ride a **licensed Kenyan on-ramp partner**
   (Swypt/Kotani) — *their* VASP licence covers the KES↔USDC conversion. Bandari
   orchestrates + owns the customer; we are not the VASP of record yet.
2. **Scale:** acquire **Bandari's own Kenya VASP/PSP licence** (CBK track) to cut
   the partner spread, control compliance, and own the rail. Budget for the
   capital floor, local entity, Kenyan board seat, and the 6–9 month timeline.

Either way: **never run the unlicensed grey path.** Kenya now takes "a firm stance
on unlicensed operations," up to shutdown.

---

## The perfected Kenya-leg design (recommended)

1. **Quote** with a TTL: show the importer one **all-in KES price** (FX spread +
   on-ramp fee + excise) — transparent, "Google-rate"-style framing.
2. **Collect by ticket size:** STK Push (≤250k) · Paybill/Pesalink (250k–1M) ·
   RTGS (>1M). One clean transfer per invoice; no structuring.
3. **Gate on KYC/KYB + screening + purpose code** before honouring `Funded`.
4. **On-ramp via a licensed partner**, **two providers** behind one interface,
   **non-custodial** where possible (USDC lands in Bandari's treasury wallet).
5. **Convert-on-collect:** never hold KES; lock the rate, capture the spread at
   conversion, move USDC straight to the bridge/treasury.
6. **Persist everything** (M-Pesa receipt, on-ramp ref, tx hash, KYC result) — the
   first rows of the trade-data set that later underwrites credit.

---

## How this maps onto the prototype

State machine
([`packages/shared/src/payment-states.ts`](../../packages/shared/src/payment-states.ts)):

```
Quoted → AwaitingFunding → Funded → OnRamped → Bridging → Bridged → PayingOut → Settled
   └──────── Kenya leg (this doc) ────────┘
```

- **Collection** — [`MpesaAdapter.initiateStkPush()`](../../apps/api/src/adapters/mpesa.adapter.ts)
  fires Daraja STK Push (`/mpesa/stkpush/v1/processrequest`); `parseCallback()`
  normalises the Daraja callback → `Funded`. Mock mode builds a synthetic callback
  via `buildMockCallback()`.
- **On-ramp** — [`OnRampAdapter.convertKesToUsdc()`](../../apps/api/src/adapters/onramp.adapter.ts)
  posts to a Swypt-shaped `/onramp-orders`; mock converts at the quoted
  `rateKesPerUsd` → `OnRamped`.

### Gaps to close to "perfect" the leg (proposed)

| Gap today | Proposed |
|---|---|
| Collection assumes STK Push only | Add **rail selection by amount** (STK / paybill-C2B / Pesalink / RTGS) so large invoices are collectable. Extend `MpesaAdapter` or add a `BankCollectionAdapter`. |
| `OnRampInput` is `{ amountMinorKes, rateKesPerUsd }` | Add **quote TTL**, **provider id**, **chain/token**, and **OTC vs pool** flag; surface the all-in fee. |
| Single on-ramp provider | **Provider interface + fallback** (mirror the custody `mock|evm|circle` pattern): `buildOnRampBackend(config) → swypt | kotani | mock`. |
| No structuring/limit guard | Add a **limit + structuring check** in the engine before `Funded`. |
| Excise/fee not modelled | Add a **fee/excise line** to the quote + ledger so reconciliation is exact. |

Config envs already exist (`MPESA_*`, `ONRAMP_BASE_URL`/`_API_KEY`/`provider`,
`FX_USD_KES`); flip `ADAPTER_MODE=live` + keys to exercise the live stubs.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Invoice > M-Pesa cap** | Rail-by-amount; raised-limit paybill + Pesalink/RTGS. |
| **KES devaluation between quote & on-ramp** | Short quote TTL; convert-on-collect; re-quote on expiry. |
| **On-ramp liquidity gap at size** | OTC desk for large tickets; two-provider fallback. |
| **Loose KYC → freeze / criminal exposure** (Flutterwave) | Hard KYC/KYB gate, screening, purpose codes, structuring watch. |
| **Daraja / provider downtime** | Multiple collection rails + multiple on-ramps; idempotent retries. |
| **Regulatory (unlicensed op)** | Launch on a licensed partner; pursue own CBK VASP licence for scale. |
| **Reversal / failed STK** | Reconcile on callback `ResultCode`; only on-ramp confirmed funds. |

---

## Open questions / BD asks (Kenya on-ramp partners)

1. Which **VASP licence** do you hold, and does it cover us reselling KES↔USDC?
2. **Custodial or non-custodial** — does USDC land in *our* wallet directly?
3. **All-in price** at our ticket sizes: FX spread + fee + the 10% excise pass-through?
4. **Limits** per transaction / day / KYC tier; **OTC desk** threshold + rate guarantee.
5. Supported **chains/tokens** (need USDC on a Circle-friendly chain for the payout leg).
6. **KYC/Travel-Rule** handling + data we receive back for our audit trail.
7. **Collection rails** you support natively (STK, paybill, Pesalink, bank/RTGS)?
8. **Settlement speed** + failure/reversal reason codes; idempotency.
9. **Uptime / Daraja dependency** and your fallback when Safaricom's API is down.

---

_Process guidance, not legal advice. Kenya VASP Act 2025 / draft Regulations 2026,
M-Pesa limits, tax treatment, and FX levels verified **Jun 2026** — re-verify as the
2026 regulations finalise and limits change. Confirm each partner's current licence
and USDC support before integration._
