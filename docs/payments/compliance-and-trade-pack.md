# Compliance & the trade-document pack

The thing that makes "USDC → the currency they want" **legal** is not a clever
rail — it's **documentation + licensed partners**. This file is the checklist that
every payout must satisfy, and the data the system must persist at each leg.

> One-line rule: **we never move money; licensed partners do.** Our job is to
> orchestrate, verify the parties, assemble a clean trade pack, and keep an
> auditable trail. We hold no VASP/PSP/forex licence ourselves (out of scope per
> the root [`README.md`](../../README.md)) — every regulated step is a partner's.

---

## The eight concerns (and how each is handled)

| # | Concern | How we handle it |
|---|---|---|
| 1 | **Crypto banned onshore in China** | No on-chain USDC ever reaches a mainland account. USDC stops offshore; the inbound leg is fiat via a licensed PSP. |
| 2 | **CNY not freely convertible (SAFE)** | Convert only under the **current account** (trade), with a purpose code + docs, through a licensed bank/PSP. |
| 3 | **KYB / KYC of both parties** | Verify importer (payer) and supplier (payee) before payout. Maps to the `KycAdapter` (Smile ID-shaped). |
| 4 | **Entity match** | Payer/payee on the payment = parties on the invoice/contract. Hard fail on mismatch. |
| 5 | **AML / CFT / TBML** | Sanctions + PEP screening; trade-based money-laundering checks (price sanity, goods plausibility); transaction monitoring. |
| 6 | **Travel Rule (VASP hop)** | Originator/beneficiary info passed on the USDC off-ramp via the licensed VASP; we keep records. |
| 7 | **Card freeze (冻卡)** | Pay only verified trade beneficiaries with clean provenance; avoid personal-card payouts; mixed/illicit funds upstream are screened out. |
| 8 | **Provenance of funds** | Source = real KES trade collection via M-Pesa; full ledger trail KES→USDC→CNY proves origin. |

---

## The trade-document pack (per payment)

Required for **onshore CNY** (current-account conversion); a lighter set applies to
USD/CNH offshore payouts but the entity-match + screening always apply.

| Field | Required for | Notes |
|---|---|---|
| Commercial invoice (id, amount, goods, parties) | CNY (and best-practice all) | Amount must reconcile to the payout |
| Trade contract / PO | CNY | Establishes the trade relationship |
| Customs declaration / shipping docs | CNY (goods) | Where applicable |
| **Purpose-of-payment code** | CNY | Correct SAFE trade category — never mis-code |
| Importer (payer) identity + KYB | all | From collection side |
| Supplier (payee) identity + KYB | all | Name must match beneficiary account |
| Beneficiary account (bank/Alipay, name) | all | Onshore for CNY; HK/offshore for CNH/USD |
| SAFE declaration fields | CNY | As required by the PSP |
| Sanctions/PEP screening result | all | Both parties + bank |
| FX quote + rate ref | all | Lock at payout (convert-on-payout) |

**If the pack is incomplete → block the payout and request docs.** Never force a
payment through with a guessed purpose code or a mismatched beneficiary.

---

## What each leg must persist (audit trail)

Every state transition already "writes balanced double-entry ledger rows + appends
an immutable audit event" (root [`README.md`](../../README.md)). For the payout
leg specifically, persist:

| Leg / state | Persist |
|---|---|
| `Bridged` | USDC amount, treasury wallet ref, locked FX quote + target currency |
| `PayingOut` (create) | Provider, payout id, target `{currency, amount}`, beneficiary, **trade-pack refs**, screening results |
| off-ramp hop | VASP off-ramp tx/ref, Travel-Rule record id (USDC→USD/CNH) |
| `Settled` (confirm) | Settlement id, delivered amount, timestamp, provider raw response |
| any failure | Reason code, provider error, who/what blocked → drives `Refunding` |

This is what lets reconciliation prove every payment + account nets to zero, and
lets an auditor trace KES→USDC→(USD/CNH/CNY) end to end.

---

## Screening gates (where they fire in the state machine)

```
Funded ─▶ [KYB both parties + sanctions/PEP] ─▶ OnRamped ... Bridged
Bridged ─▶ [trade-pack complete? entity match? TBML sanity?] ─▶ PayingOut
PayingOut ─▶ [beneficiary screen + provenance ok?] ─▶ Settled
   │
   └─ any gate fails → Refunding → Refunded (funds returned to importer)
```

Gates are **deterministic** (per the prototype's "no AI in the product" stance) —
pass/fail with a recorded reason, not a judgement call buried in code.

---

## Licensing reality (who holds what)

| Function | Who is licensed | Bandari's role |
|---|---|---|
| USDC off-ramp (VASP) | SFC VATP (HashKey, OSL) / Circle Mint | Orchestrate; never custody-as-VASP |
| USD/CNH/CNY payout | Licensed PSP/bank (XTransfer, Airwallex, Tazapay, KUN, Yativo…) | Submit payout + docs; never settle ourselves |
| Onshore CNY FX (SAFE) | The China PSP's own PBOC licence | Provide the trade pack |
| KES collection | M-Pesa / licensed on-ramp (Swypt/Kotani) | Initiate; partner is the MSB |

**Bandari's moat is the orchestration + trade-compliance layer**, not a rail trick:
clean KYB, correct purpose codes, entity-matched trade packs, multi-provider
routing/fallback, and a provable ledger. See the Research Hub canvas for the full
argument.

---

## Policy map by stage (full corridor)

Every relevant policy at each stage, mapped to the payment state machine. Kenya
side verified current: VASP Act 2025 (Act No. 20/2025) effective 21 Oct 2025; the
3% Digital Asset Tax was replaced (Jul 2025) by a 10% excise duty on VASP fees.

### Stage 1 — Collection: KES via M-Pesa (Kenya) · `Quoted → Funded`
- **National Payment System Act 2011 + NPS Regs 2014** (CBK) — payment-service regulation; M-Pesa/Safaricom is the licensed PSP (Daraja API).
- **POCAMLA** (Proceeds of Crime & Anti-Money Laundering Act) — AML/KYC on the payer.
- **Data Protection Act 2019** (ODPC) — importer personal data.
- Context: Kenya's FATF grey-listing drives tighter AML here.
- **Bandari:** collect via a licensed PSP/aggregator; KYC the payer.

### Stage 2 — On-ramp: KES → USDC (Kenya) · `Funded → OnRamped`
- **VASP Act 2025** (eff. 21 Oct 2025) — on/off-ramp platforms must be licensed. **CBK** regulates payment-processor/wallet/stablecoin VASPs; **CMA** regulates exchanges/brokers. Draft VASP Regulations 2026 in consultation; first licences ~mid-2026; min capital up to ~KES 500M.
- **Tax:** 10% excise duty on VASP **fees** (since Jul 2025); KRA annual reporting + foreign data-sharing (Finance Bill 2026); income/CGT on gains.
- **FATF Travel Rule**; **POCAMLA** AML/CFT, KYC.
- **Bandari:** use a licensed Kenyan VASP on-ramp (Swypt/Kotani) or get licensed; pass Travel-Rule data.

### Stage 3 — Custody + bridge: USDC, Kenya → HK (on-chain) · `OnRamped → Bridged`
- **USDC issuer regimes:** US **GENIUS Act** (2025), EU **MiCA**, Circle's MTLs/BitLicense/MSB.
- **FATF Travel Rule** on VASP-to-VASP transfers.
- **Sanctions** (OFAC/UN) — screen wallet addresses.
- **Custody/key-management** licensing for the wallet holder.
- **Bandari:** the on-chain hop is unregulated, but the actors must be licensed; screen addresses, record Travel-Rule data. (This is the "just a crypto wallet" leg.)

### Stage 4 — Off-ramp: USDC → USD / CNH (Hong Kong) · `Bridged → PayingOut`
- **SFC VATP regime** — licensed exchanges (HashKey VASP-001, OSL VASP-002).
- **HKMA Stablecoins Ordinance** (eff. 1 Aug 2025).
- **HK MSO licence** under **AMLO (Cap. 615)**.
- **FATF Travel Rule** (HK); AMLO AML/CFT + KYC.
- Circle licensing if Circle Mint is used.
- **Bandari:** off-ramp via a licensed VATP/MSO or Circle.

### Stage 5 — Delivery · `PayingOut → Settled`
- **5a · USD offshore:** standard AML/CFT, OFAC sanctions, wire/correspondent rules. No China capital-control surface.
- **5b · USD → onshore CNY (licensed PSP):** **PBOC payment licence** (the PSP's); **SAFE** FX controls; current account only; **purpose-of-payment codes**; trade docs; **RCPMIS** reporting; goods exported from China.
- **5c · CNH offshore:** HK AMLO/KYB. Offshore RMB is freely convertible — no mainland controls.
- **5d · CNH → onshore CNY:** **PBOC RMB cross-border trade settlement**; **CIPS** (mandatory for cross-border CNY since Jan 2021); **BOCHK Trade Conversion Service** (trade docs for goods); SAFE; RCPMIS; purpose codes.

### Stage 6 — Onshore receipt (supplier, China) · `Settled`
- **Crypto ban:** PBOC **Yinfa [2026] No. 42** (RMB stablecoins illegal onshore) + 2021 PBOC crypto-activity ban — no on-chain USDC may land onshore.
- **SAFE declaration** by the recipient; RCPMIS.
- **Card-freeze (冻卡)** enforcement under AML sweeps.
- Supplier tax/invoicing (fapiao).

### Cross-cutting (every stage)
- **FATF standards:** AML/CFT, Travel Rule, sanctions (OFAC/UN).
- **KYB/KYC** of both counterparties + beneficial ownership.
- **TBML** controls: entity match, price/goods plausibility.
- **Data protection:** Kenya DPA 2019, HK PDPO, China PIPL.
- **Bandari's posture:** prototype is licensing-out-of-scope; production needs a Kenya VASP/PSP (own or partner), a HK MSO/VASP (own or partner), and relies on licensed China PSPs for the inbound CNY leg.

---

_This is process guidance, not legal advice. Confirm SAFE purpose codes, PSP
documentary requirements, and Travel-Rule thresholds with each licensed partner
and counsel before go-live. Kenya VASP Act 2025 / VASP Regulations 2026 and tax
treatment verified Jun 2026 — re-verify as the 2026 regulations finalise._
