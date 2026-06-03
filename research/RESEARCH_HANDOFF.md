# Bandari — Research Track Handoff

> **You are the Bandari research agent.** Your job is to own and extend the market /
> competitor / regulatory research for Bandari, and to keep the **Bandari Research Hub
> canvas** as the single source of truth. You do **not** touch implementation code — that
> lives on the separate "Implementation & Tech Stack" chat. Read this whole file, then open
> the canvas, then continue from the open-questions backlog below.

---

## 0. How to take over (do this first)

1. Read this file end to end.
2. Open the research hub canvas or research board if available (this is your primary artifact —
   keep it current).
3. Skim the implementation README for context (do **not** edit it):
   - `/Users/devinyue/Developer/bandari/README.md`
4. Pick from the **Open research backlog** (§5), do the research, then update the canvas (§4).
5. Always cite sources and date your facts (§6 conventions).

---

## 1. What Bandari is (one paragraph)

Bandari ("port/harbour" in Swahili) is a prototype for **B2B cross-border trade payments
from Kenya to China, settled on stablecoin rails.** A Kenyan importer pays in **KES**
(via M-Pesa); the value is converted to **USDC**, moved on-chain, off-ramped through a
Hong Kong partner, and delivered as **CNY** to the Chinese exporter — faster and cheaper
than correspondent banking / SWIFT. The current codebase is a **local-only, testnet/mock
prototype** (no real money, nothing pushed to GitHub). The research track exists to
pressure-test the business: who else does this, what does it cost, what licenses/rails are
required, and where Bandari wins or loses.

**Corridor:** Kenya → China. **Customer:** SME importers/exporters (B2B). **Wedge:** one
corridor done well, then land-and-expand into trade finance / multi-currency accounts.

---

## 2. Your deliverable: the Research Hub canvas

**Path:** maintained outside this repository as the current research board.

It currently contains:
- **Comparables at a glance** — a table comparing Aspora, XTransfer, Airwallex, NALA/Rafiki.
- **Company profiles** — one card each (model, numbers, "for Bandari" lesson).
- **What to copy / what's harder for Bandari** — two callouts.
- **Glossary** — ~60 terms across 7 categories (people, currencies/institutions, payments &
  rails, stablecoins, regulation/compliance, business model, Bandari internals).

Keep this canvas as the **living source of truth**. When you finish a research task, fold the
findings into the canvas (new rows, new profile cards, new sections, updated figures).

---

## 3. What's already been researched (baseline — verify before re-citing)

Figures are company-disclosed and approximate **as of ~June 2026**. Re-check before quoting.

| Company | Customer | Corridors | Rails | Scale | Relevance |
|---|---|---|---|---|---|
| **Aspora** (ex-Vance) | Consumer (NRIs) | UK/EU/UAE → India | Bank rails + licenses; flat fee, "Google rate" FX; **no stablecoin** | ~$2B/yr, ~250k users, ~$99M raised, $500M val (Series B, Sequoia+Greylock) | Wedge→stack diaspora template + rate transparency. Consumer + well-banked corridor; not B2B/China. |
| **XTransfer** | B2B SME trade | China ↔ world | Bank network "X-Net" + AI compliance "TradePilot" | China's #1 B2B trade-payment fintech; unicorn | The B2B + China + trade-AML blueprint. Its AI TBML/AML moat is Bandari's hardest problem. |
| **Airwallex** | B2B businesses | Global, strong APAC | Owns/licenses local clearing + global accounts + FX | Decacorn (~$5–6B val) | The "own local rails + multi-currency accounts" endgame; shows licensing depth needed to scale. |
| **NALA / Rafiki** ← closest | Consumer app + B2B API | US/UK/EU ↔ Africa & Asia (**KES live**) | **Stablecoin (USDC/USDT)** collect→settle→payout; Noah for USD virtual accounts | Rafiki $0→$1B vol in 18mo; 5× biz / 10× rev YoY; $40M equity (2024) + up to $50M credit facility (MUFG-backed Liquidity, 2026) | **Almost exactly Bandari's thesis, already in Kenya.** Strongest competitor and/or a rail to build on. |

**Key takeaways already established:**
- **NALA/Rafiki is the closest comparable** and is already operating in Kenya on stablecoin
  rails. Treat as competitor *and* potential infrastructure partner.
- **What to copy:** wedge→stack; transparent/locked FX as trust; licenses as moat; pre-fund
  corridors (consider non-dilutive debt for the float, like NALA).
- **What's harder for Bandari:** B2B trade compliance (KYB + TBML), CNY payout into China
  (PBOC/SAFE capital controls), larger tickets ⇒ more liquidity, a genuinely broken corridor.

The glossary (in the canvas) already defines: NRI, diaspora, importer/exporter, SME, KES,
CNY/RMB, USD, M-Pesa, Safaricom, Daraja, CBK, PBOC, SAFE, HKMA, FCA, Alipay, IMTO, SWIFT,
correspondent banking, nostro/vostro, local rails, on/off-ramp, mobile money, STK push,
Paybill/Till, C2B/B2C/P2P/B2B, collection, payout, settlement, pre-funding/float, FX,
mid-market rate, spread/bps, liquidity, stablecoin, USDC/USDT/USDG, peg, on-chain, wallet,
treasury wallet, gas, ERC-20, tx hash, confirmation, attestation, CCTP, testnet/mainnet,
custody, KYC, KYB, AML, CFT, sanctions screening, Travel Rule, TBML, SAR, PSP, VASP, MSO,
EMI, safeguarding, wedge, land-and-expand, trade finance, take rate, unit economics,
non-dilutive/credit facility, Series A/B, and Bandari internals.

---

## 4. How to update the canvas

The canvas is an external research artifact maintained separately from this repository.
Hard rules:

- **One artifact only.** No helper/style files.
- **Use only the canvas runtime APIs available in the host environment.** No relative imports,
  npm packages, or Node built-ins.
- **No `fetch()` / no network calls** in the canvas — embed all data inline.
- **Colors only from `useHostTheme()` tokens** — no hardcoded hex.
- **No slop:** no gradients, emojis, box-shadows, rainbow coloring, or a wall of identical cards.
- **Never render empty states** — omit a section rather than show "TODO"/"No data".
- Default-export the top component if the host format requires it. Run a pre-delivery
  self-check before saving.
- When you mention the canvas in chat, link it through the active workspace UI rather than
  a machine-local absolute path.

Pattern for adding a comparable: add an entry to the `COMPARABLES` array (and a `PROFILES`
card if it deserves one). For glossary terms: add `[term, definition]` to the right category
in the `GLOSSARY` array. Keep definitions one line and Bandari-contextual.

---

## 5. Open research backlog (prioritized)

**P0 — NALA / Rafiki deep dive (closest competitor)** — ✅ DONE (Jun 2026); folded into the canvas "Deep dive — NALA / Rafiki" section.
- ~~Exact Rafiki pricing / take rate; which corridors and currencies are live (confirm KES + any CN/HK leg).~~ → ~1–2% all-in (vs ~6.5% legacy), FX within 0.5–1% of next-best. **KES live; NO China/HK.** Asia = BD/IN/PK/PH (+UAE).
- ~~Their license stack (the "10+ licenses") and which markets each covers.~~ → **17 licenses** globally (May 2026), incl. Bank of Tanzania PSP, EU EMI, FCA-regulated ramp; KE via Equity Bank + Pesalink, direct M-Pesa.
- ~~The Noah partnership mechanics (USD virtual accounts → USDC → local payout) — replicable by Bandari?~~ → Yes, architecturally (it's what Bandari mocks), but Noah/NALA only cover the collect→stablecoin→Africa/Asia-payout half; the China off-ramp is unbuilt.
- ~~Partner-vs-compete decision.~~ → **Supplier for one leg, competitor for the thesis:** ride Rafiki/similar for the KES + USDC leg; build/partner the China CNY off-ramp; keep B2B trade compliance + KE→CN as the wedge.

> **Next agent: start at P1 (the China side).** It's now the binding constraint — no peer (incl. Rafiki) serves the CNY payout leg.

**P1 — The China side (the corridor's hardest half)** — ✅ FIRST PASS DONE (Jun 2026); see canvas "Why China is the hard half".
- ~~How do peers actually deliver CNY into mainland China?~~ → Via **licensed CN-inbound trade PSPs** (XTransfer holds a PBOC Payment Business Permit; PingPong, Airwallex, LianLian, Payoneer, Sunrate all went unlicensed→licensed in 2025) that settle CNY same-day via **CIPS** + domestic clearing against **mandatory trade docs** (invoice + shipment + beneficiary match). Inbound *trade* (current-account) is legal/routine; the block is on stablecoin off-ramp + capital-account moves.
- ~~Realistic HK off-ramp / payout partners?~~ → **Thunes** (HK MSO; pay-to-stablecoin-wallets 130+ countries) for the USDC→fiat hop; HK now licenses stablecoin issuers (HSBC, Anchorpoint, Apr 2026, HKD first). A **CNH stablecoin** is the prize but PBOC is curbing it (Feb 2026 ban; Alibaba/JD paused). USDC/USDT are professional-investor-only in HK.
- ~~What does compliant CNY payout cost?~~ → Licensed PSP all-in ~**0.4–0.8%** (XTransfer), plus FX; incomplete docs → automatic holds + multi-day delays.

**Key China findings:** (1) China's **closed capital account** + **Feb 2026 PBOC stablecoin ban** (CNH *and* CNY, foreign issuers included) mean there is **no compliant USDC→CNY off-ramp inside China** — only state e-CNY is legal. (2) **Bandari hits the same wall as Rafiki, structurally** — the clean USDC→CNY off-ramp the prototype mocks doesn't exist. (3) Realistic play: **don't build the China leg — partner a licensed CN trade PSP / HK MSO** for the fiat last mile; Bandari = orchestrator (KE on-ramp + USDC transit + licensed CN payout); moat = trade compliance + corridor UX. (4) **Never** rely on gray-market USDT→CNY P2P (card-freeze 冻卡 risk + active enforcement).

> Remaining P1 nuance to chase later: exact XTransfer/PingPong API access + onboarding terms for a KE-origin orchestrator; whether any partner will accept *stablecoin* settlement at the HK hop vs requiring USD fiat; live CNH-stablecoin status.

**Aspora FX model (answered alongside):** Aspora does **not** run a hidden FX spread — it passes the mid-market "Google rate" and monetizes via a small capped flat fee (£3/$3/€3/AED10; UAE→India often free) + wedge→stack upsell (USD savings, investing, credit). Transparency is an acquisition lever, not the margin. **Implication:** Bandari's B2B-trade margin is the FX spread (bps) + fees on larger tickets — the opposite of Aspora's give-away-the-rate move.

**P2 — Kenya local rails & licensing**
- Path to M-Pesa access: aggregator (e.g. via a PSP) vs direct Safaricom; costs and timelines.
- CBK licensing for a PSP / payments + any VASP/crypto stance in Kenya.

**P3 — More comparables to add to the hub**
- **Conduit**, **Bridge (Stripe)**, **Yellow Card**, **Thunes**, **Swypt / Kotani Pay** (on-ramps),
  **Caliza**, **Juicyway**. For each: corridor, rails (stablecoin?), customer, scale, B2B trade fit.

**P4 — Margins & unit economics**
- Where Bandari makes money (FX spread in bps, fixed fees) vs where it bleeds (on-ramp fee,
  gas, off-ramp spread, float cost, compliance opex). Build a per-transaction decomposition.

**P5 — Regulatory map**
- One clean table: jurisdiction → license needed → who has it → difficulty/time/cost. (KE PSP,
  HK MSO/VASP, China PBOC permit, US/EU as needed.)

---

## 6. Working conventions

- **Cite sources** for every non-obvious claim (publication + date). Prefer primary sources
  (company sites, regulator pages) and reputable trade press (TechCrunch, TechCabal, FintechFutures,
  Launch Base Africa, The Block, etc.).
- **Date your facts.** Funding/volume numbers go stale fast — tag them "(as of <month year>)".
- **The canvas is the deliverable**, not chat. Summarize in chat, but land findings in the canvas.
- **Stay on the research track.** Do not edit implementation code, the README, or anything under
  `apps/`, `packages/`, `scripts/`. If something has implementation implications, note it for the
  implementation chat instead of building it.
- **Local-only / no spend.** Don't sign up for paid services or move money. This is desk research.
- Keep a running **Sources** list at the bottom of this file as you go.

---

## 7. Sources gathered so far

- NALA $50M credit facility (FintechFutures / Launch Base Africa, May 2026)
- NALA × Noah stablecoin settlement network (TechCabal, Jan 2026)
- Rafiki product/coverage — rafiki.com (2026)
- NALA company profile / funding (LinkedIn, 2026)
- Aspora (ex-Vance) funding & model — prior research in the implementation chat (2025–26)
- XTransfer / TradePilot — prior research in the implementation chat
- Airwallex — prior research in the implementation chat

**Added during the P0 NALA/Rafiki deep dive (Jun 2026):**
- Rafiki country/currency coverage list — rafiki.com homepage + docs.rafiki.com country-coverage (2026). Confirms **no China (CNY) / no Hong Kong**; Asia = Bangladesh, India, Pakistan, Philippines (+ UAE). 300+ banks, 40+ mobile money. USDC/USDT/USDG active.
- "Why are payments in emerging markets still 1% built? Introducing Rafiki.API" — rafiki.com / nala.com blog (Mar 22, 2024). FX philosophy ("within 0.5–1% of next-best, then win on reliability"), 99.3% of payouts <1 hr, "applied for nine licenses, received in three" (now superseded), split of NALA vs Rafiki orgs, dLocal/Nium framing.
- Noah × NALA partnership mechanics — noah.com/blog/nala-noah + IBS Intelligence + The Paypers + BitKE (Jan 13–14, 2026). Noah = regulated USD virtual accounts + real-time USD→stablecoin + KYC/AML at entry; NALA/Rafiki = local distribution; ~$850B inbound liquidity gap.
- NALA 17 licenses + $50M facility (Mars Growth / Liquidity, MUFG-backed) — TechMoran + WeeTracker + The Citizen + Innovation Village (May 29, 2026). Retains >50% of 2024 $40M equity; pre-funds enterprise accounts.
- Rafiki economics (~1–2% all-in vs ~6.5% legacy; 4–5% treasury yield on idle USDC) — fintechnews.co.ke (2026, secondary framing — treat as approximate).
- NALA enters Kenya via Equity Bank + Pesalink; Bank of Tanzania PSP license — rafiki.com blog index (2026).

**Added during the Aspora-FX + China deep dive (Jun 2026):**
- Aspora FX/fee model (mid-market "Google rate", capped flat fee £3/$3/€3/AED10, FCA Real Transfer Ltd FRN 535949, US MSB Vance Money Services LLC, India-only) — forexfee.com + moneytransfers.com + get.aspora.com + aspora.com blog (2026).
- China closed capital account + SAFE/PBOC FX controls (current vs capital account; documented-purpose rule; 2026 KYC tightening) — privacyshield.gov, china-briefing.com, getwherenext.com, marketingtochina.com; IMF WP 2026/04 (capital controls add 4–8h at the beneficiary leg).
- PBOC + 7-agency stablecoin ban, Feb 5–6 2026 (RMB-pegged stablecoins CNH *and* CNY; extends 2021 crypto ban to offshore issuance + foreign issuers serving residents; only e-CNY legal) — Cointelegraph, news.bitcoin.com, IFR.
- May 2026 offshore-broker crackdown + gray-market USDT→CNY card-freeze (冻卡) risk — KenMacro, BeInCrypto, TheChainPost.
- Licensed CN-inbound trade PSPs deliver CNY against trade docs via CIPS (XTransfer PBOC Payment Permit, ~0.4–0.8%; PingPong/Airwallex/LianLian/Sunrate/Payoneer licensed 2025) — TechBullion, XTransfer wiki, bizzbuzz (X-Net), Fangda Partners PRC Financial Regulation Annual Report 2026.
- HK stablecoin issuer licenses (HSBC, Anchorpoint = StanChart/HKT/Animoca), HKD-first, CNH curbed; Thunes HK MSO pay-to-stablecoin-wallets — HKMA (Apr 2026), Standard Chartered PR, stablestate1 substack, IFR.

**"We have USDC — now what?" mechanics (Jun 2026):**
- **Confirmed: no direct USDC→onshore-CNY service exists.** Licensed PSPs settle CNY on fiat rails, not stablecoin off-ramps — TechBullion + Airwallex + XTransfer (2026). So the path is two unavoidable handoffs: (1) USDC→USD off-ramp, (2) licensed PSP USD→CNY as a documented export receipt.
- Circle Mint off-ramp: USDC↔USD 1:1, **$0 Circle fee** (pay your own wire fee), same-day if before 4pm ET else T+1, institutional only (full KYB + monthly volume minimums), covers gas — developers.circle.com / circle.com/circle-mint / eco.com routes guide (2026). Alternatives: Bridge.xyz, Stripe stablecoin, exchange OTC.
- Airwallex building a stablecoin settlement platform (22 stablecoin eng hires; buy/hold/send/settle tokens, fiat↔stablecoin) — PANews/IOSG (2026): a likely future one-stop (USDC in → CNY out) but China last mile still fiat today.
- Float/pre-funding is what makes the supplier payout instant (PSP or Bandari fronts CNY liquidity in China); otherwise CNY waits for USD to land. Landscape texture (PANews/IOSG): RD Technologies = HK-only (no onshore CNY); WorldFirst 1-min Alipay = personal accounts only; Yeepay T+1–T+2; SWIFT adds 1–7 days.

**USD→CNY detail + "straight USDC→CNY?" + the HK question (Jun 2026):**
- CNH (offshore, freely convertible, market rate, HK/London/SG) vs CNY (onshore, managed float, PBOC daily mid ±2% band, mainland-only) — sokin, Cambridge Currencies, Statrys. Delivery clears over **CIPS** (1,400+ FIs, 110+ countries, onshore same-day, now standard for cross-border RMB); payment needs a **purpose-of-payment code** (e.g. goods) + docs or it's auto-rejected.
- **HK is crypto-legal but is NOT the mainland.** 12 SFC-licensed VATPs (OSL, HashKey, HKVAX…); USDC = professional-investor only (HK$8M+); **HashKey added CNH off-ramp channels** (32 countries) — fintechnews.hk, OSL, PANews. So USDC→CNH off-ramp in HK is clean + better FX, but CNH→onshore CNY still crosses the controlled border (and Feb 2026 ban covers CNH-pegged stablecoins). HK = the bridge's near side, not its far side.
- **Closest to "straight" USDC→CNY:** (1) **Circle CPN** — OFI on-ramps fiat→USDC, BFI off-ramps USDC→local fiat; near-instant, less pre-funding; China is on Circle's *exploratory* roadmap; Conduit (OFI) lists China payouts, Tazapay (BFI) does HK. (2) **Offshore↔onshore PSP bridges**: KUN (Yeepay), DFX Labs (LianLian), RD InnoTech (RD Tech) take USDC offshore; licensed onshore parent pays CNY. Under the hood it's still off-ramp + fiat, but can be a single integration ("send USDC → supplier gets CNY") that cuts a redundant USD hop and pre-funding. Pure on-chain USDC into a mainland account = still illegal. — Circle CPN docs/blog, PANews/IOSG.

*(Append new sources here as you research.)*

---

## 8. Suggested first message for the research chat

> Research track for Bandari (KE→China B2B stablecoin payments). Read
> `research/RESEARCH_HANDOFF.md`, then take over the Bandari Research Hub canvas at
> the active Bandari Research Hub canvas.
> Start with the P0 task: a NALA/Rafiki deep dive (pricing, corridors, licenses, partner-vs-compete),
> and fold the findings into the canvas.
