# Bandari Cross-Border Payment Prototype (Sandbox)
## Overview
Kenyan SME importers paying Chinese suppliers lose four to seven percent of every
invoice to FX spread, wire fees, and correspondent-bank deductions, and wait three
to seven days for the money to land. On the Kenya → China corridor alone that is an
estimated 200–300 million dollars leaking out every year, and the bigger cost is
speed: when working capital is stuck in transit for a week, importers turn it fewer
times a year and can't compete on price.
**Bandari lets a Kenyan importer pay a Chinese supplier in shillings and have it
settle in seconds, using a stablecoin as the rail instead of correspondent banks.**
This repository is a **local-only, sandbox/test-mode prototype** that orchestrates a
simulated cross-border payment end to end through a typed, idempotent state machine
with double-entry accounting and per-leg adapter isolation: collect KES via the M-Pesa
STK push flow, on-ramp to a USD stablecoin (USDC), settle the value transfer on-chain,
off-ramp to HKD through a stubbed HK FX endpoint, and disburse to the supplier in their
chosen settlement currency (HKD / CNH / CNY). Every state transition is idempotent,
writes balanced double-entry ledger rows, appends to an append-only audit log, and is
gated by a deterministic stage verifier. Downstream failures trigger a compensating
refund path rather than leaving the payment in an inconsistent state.
> **Nothing here moves real money.** The M-Pesa collection leg is wired to the real
> Daraja sandbox (one-step toggle below) and the on-chain leg can run a real testnet
> transfer; the on-ramp, HK FX, and payout legs are production-shaped placeholders.
## Architecture highlights
- **Double-entry ledger with enforced invariants**: every payment writes balanced
  debit/credit rows per currency; the verification suite asserts the ledger nets to
  zero, that there are zero per-payment imbalances, and that internal treasury accounts
  reconcile to a zero net position.
- **Typed, idempotent payment state machine**: transitions are idempotent (safe to
  replay on retry or duplicate callback), each appends to an append-only audit log, and
  each is gated by a deterministic stage verifier before it commits. The
  `Refunding → Refunded` path implements compensating transactions for any downstream
  failure, in the manner of a saga.
- **Adapter abstraction over external legs**: each integration (`MpesaAdapter`,
  `OnRampAdapter`, `CustodyAdapter`, `ChinaPayoutAdapter`, `KycAdapter`) implements a
  common interface exposing `healthCheck()` and `runProbe()`, and switches between mock
  and live implementations via a single environment flag, so any leg can be exercised
  in isolation without standing up the others.
- **Durable orchestration**: BullMQ on Redis drives the transition queue, with a
  fallback to an inline orchestrator when no broker is present, so the happy path runs
  with or without external infrastructure.
- **Deterministic verifier suite**: `probe` / `e2e` / `verify` exercise the full happy
  path and the refund path locally and emit structured results per segment (expected vs
  actual, amounts, latency, raw request/response, and the failing assertion on error).
## Stack
| Area | Choice |
|---|---|
| Monorepo | Turborepo + pnpm workspaces, TypeScript end-to-end |
| Web | `apps/web` Next.js + Tailwind + shadcn/ui (Stripe-inspired UI) |
| API | `apps/api` NestJS on Fastify, modular monolith |
| Mobile | `apps/mobile` Expo/React Native, scaffolded for later |
| Shared | `packages/shared` types + Zod schemas + typed API client (reused by web + mobile) |
| Data | Postgres + Prisma (state + double-entry ledger) |
| Jobs | Redis + BullMQ (durable orchestration); falls back to an inline orchestrator |
**Integration adapters (swappable, mock ⇄ live):**
`MpesaAdapter` (Daraja) · `OnRampAdapter` (Swypt/Kotani) · `CustodyAdapter` (Circle) ·
`ChinaPayoutAdapter` (Yativo-shaped) · `KycAdapter` (Smile ID). Each exposes
`healthCheck()` and `runProbe()` so any leg is testable in isolation.
## Payment state machine
```
Quoted -> AwaitingFunding -> Funded -> OnRamped -> Bridging -> Bridged -> PayingOut -> Settled
                  |              |          |           |
                  v             (any downstream failure) --> Refunding -> Refunded
                Failed
```
Each transition is idempotent, writes balanced double-entry ledger rows, appends an
immutable audit event, and is guarded by a deterministic stage verifier.
## Prerequisites
- Node.js 20+ and pnpm
- Postgres + Redis running locally. Either:
  - `pnpm services:up` (uses Docker Compose if present, else Homebrew
    `postgresql@16` + `redis`), or
  - your own local instances (set `DATABASE_URL` / `REDIS_URL` in `apps/api/.env`).
## Setup
```bash
pnpm install
cp .env.example apps/api/.env        # adjust if needed; defaults target local Postgres/Redis
pnpm services:up                     # start Postgres + Redis locally
pnpm db:migrate                      # apply Prisma schema
pnpm db:seed                         # demo importer + supplier
```
## Run the app
```bash
pnpm dev          # turbo runs api (http://localhost:3001) + web (http://localhost:3000)
```
- **Dashboard** http://localhost:3000 (totals + recent payments)
- **New payment** `/payments/new` (live quote, all-in price)
- **Payment detail** `/payments/:id` (Stripe-style timeline, references, ledger, retry/refund)
- **Ops console** `/ops` (run segment probes, inspect verifiers)
In mock mode, the payment detail page has a **Simulate M-Pesa funding** button that
fires the STK callback and drives the corridor to `Settled`.
## Live demo (Vercel, no backend)
The web app can run fully self-contained against an in-browser mock no API,
Postgres, or Redis so it deploys to Vercel as a static demo. Seeded data lives in
`localStorage` and payments animate through the happy path on a wall clock
(`apps/web/lib/mock-client.ts`).
Demo mode turns on automatically whenever `NEXT_PUBLIC_API_URL` is not set (the case
on Vercel), or explicitly with `NEXT_PUBLIC_DEMO_MODE=true`. Locally,
`apps/web/.env.local` sets `NEXT_PUBLIC_API_URL=http://localhost:4000`, so dev keeps
talking to the real API.
**Deploy on Vercel:**
1. Import this repo and set Root Directory to `apps/web` (build/install are pinned in
   `apps/web/vercel.json`, which builds `@bandari/shared` first via Turborepo).
2. No env vars are required for the demo. (Optionally set `NEXT_PUBLIC_DEMO_MODE=true`
   to be explicit, or later set `NEXT_PUBLIC_API_URL` to point the UI at a hosted API.)
## Verification (local only no GitHub / hosted CI)
All checks run locally with no dependency on hosted CI. Adapters default to
deterministic mock implementations, which makes the suite fast and reproducible; an
opt-in live run (`ADAPTER_MODE=live`) exercises the same assertions against the real
sandboxes using secrets from your local `.env`.
```bash
pnpm probe          # segment health checks + one canned probe per leg
pnpm e2e            # one happy-path corridor end to end + ledger + reconciliation
pnpm verify         # full suite: probes + happy-path + refund-path stage verifiers
pnpm verify:live    # same suite against real sandboxes (ADAPTER_MODE=live)
pnpm hooks:install  # optional local pre-push git hook that runs `pnpm verify`
```
Every probe/verifier returns a structured result (segment, expected vs actual,
amounts, latency, raw request/response, pass/fail + the failing assertion).
## Documented run
`pnpm e2e` boots an isolated inline API, runs one corridor, and prints the timeline,
ledger, and reconciliation. A passing run looks like:
```
=== Payment <id> timeline (Settled) ===
  ... -> Quoted           Payment created from quote
  Quoted          -> AwaitingFunding  STK push sent (mock); awaiting M-Pesa confirmation
  AwaitingFunding -> Funded           Funds collected via M-Pesa (...)
  Funded          -> OnRamped         KES converted to 386.10 USDC (mock)
  OnRamped        -> Bridging         USDC transfer submitted (mock) tx=0x...
  Bridging        -> Bridged          USDC confirmed on-chain (att=att_...)
  Bridged         -> PayingOut        HK off-ramp USDC→HK$3011.58 @ 7.80; payout created (mock) id=payout_mock_...
  PayingOut       -> Settled          Supplier paid; settlement stl_...
=== Ledger entries ===            (KES -> USDC -> CNY, every payment balances per currency)
  debit  mpesa_collected             5060000 KES
  credit importer_external           5060000 KES
  ...
  debit  payout_external_cny          277220 CNY
  credit supplier_paid_cny            277220 CNY
=== Reconciliation ===
  payments balanced: N/N  imbalances: 0  ledger-nets-to-zero: true
  treasury_usdc                     0 USDC      (internal accounts net to zero)
  hk_usdc                           0 USDC
E2E PASSED (Settled)
```
50,000 KES sent → 50,600 KES all-in (fee/spread) → 386.10 USDC bridged → HK off-ramp
(USDC→HKD ≈ HK$3,011 via the stubbed HK FX) → 2,772.20 CNY credited on the internal
ledger. Internal treasury accounts net to zero; external accounts carry the expected
net positions.
## What's live vs placeholder
| Leg | Status |
|---|---|
| M-Pesa collection (STK push) | **Live-capable** against the real Daraja sandbox (one-step toggle below). Mocked by default so the demo runs offline. |
| KYC / AML | **In progress** currently integrating Smile ID against the M-Pesa funding source (name-match verification, where the name on the funding account has to match the account). In the meantime the demo runs a hardcoded/prefilled flow: layered screening (identity, sanctions, risk, wallet), "documents on file", gating, and an ops review queue, all client-side. |
| KES → USDC on-ramp | **Placeholder**: converts in-process at the locked rate. |
| USDC custody / bridge | **Mock by default**; a real testnet transfer runs on Base Sepolia when `CUSTODY_PROVIDER=evm`. |
| HK off-ramp (USDC → HKD) | **Placeholder**: a stubbed HK FX call at a fixed ≈ 7.80. |
| Supplier payout (HKD / CNH / CNY) | **Placeholder**: simulated payout id; no real rail. |
## Real M-Pesa (Daraja sandbox) runbook
The collection leg is fully wired:
1. Create a sandbox app at https://developer.safaricom.co.ke and copy the Consumer
   Key, Consumer Secret, and the Lipa na M-Pesa Online passkey (sandbox STK uses
   shortcode `174379`).
2. In `apps/api/.env` paste the three values, then set:
   ```
   ADAPTER_MODE=live
   MPESA_ENABLED=true
   ```
   (Other legs stay mocked because their `*_ENABLED` flags remain false.)
3. Expose the API so Safaricom can POST the callback, and point `PUBLIC_BASE_URL`
   at it:
   ```bash
   pnpm tunnel                 # prints an https://<id>.trycloudflare.com URL
   # set PUBLIC_BASE_URL=<that url> in apps/api/.env, then restart the API
   ```
4. Run the stack (`pnpm dev`) and create a payment from the importer flow. A real STK
   prompt hits the test phone; the async callback resolves funding (or maps a declined
   `ResultCode` to `Failed`). The M-Pesa receipt is captured and shown on the payment
   detail. Everything downstream of `Funded` continues in mock mode.
To return KES on failure for real, the refund (B2C) leg would be a separate M-Pesa app.
## Out of scope
Real money movement, production licensing (PSP/MRP/VASP/Forex), live partner
contracts, and lending tracked separately on the regulatory/ops track.
## Evaluation & Evidence
This project was validated along three lines: the problem (user interviews), the
technical claim (the verifier suite), and the regulatory context (primary-source
research).
### Problem validation (user + expert interviews)
- **Kenyan SME importers.** I interviewed 7 importers directly, mostly businesses
  bringing in textiles and auto parts from China. The interviews confirmed the cost
  (four to seven percent lost to FX spread, wire fees, and correspondent-bank
  deductions) but, more importantly, surfaced the insight that speed is the deeper
  problem: money locked in transit for a week means fewer working-capital turns per
  year and an inability to compete on price. A notable finding: all 7 were open to
  crypto and stablecoin rails, largely because M-Pesa had already made them comfortable
  moving money digitally. Mobile-money adoption appears to lower the trust barrier to a
  stablecoin-based product rather than raise it.
- **Fintech founders (WAKA).** Conversations with the founders of WAKA, a similar
  cross-border payments effort, reframed the problem: there is no dollar shortage, the
  dollars are stranded across correspondent banks in Europe with no African hub to
  aggregate and route them toward Asia. This shaped the corridor thesis.
### Technical validation (testing)
- **End-to-end and compensation paths.** `pnpm verify` drives both the happy path
  (`Quoted → … → Settled`) and the failure/compensation path
  (`… → Refunding → Refunded`) through the state machine, with deterministic per-stage
  verifiers asserting expected vs actual amounts and state at each transition.
- **Ledger invariants.** The double-entry ledger is checked on every payment: the suite
  asserts `ledger-nets-to-zero: true`, zero per-payment imbalances, and that internal
  treasury accounts reconcile to a zero net position (see the Documented run above).
- **Per-leg isolation probes.** Each adapter implements `healthCheck()` and `runProbe()`,
  so every external leg is independently exercised in isolation via `pnpm probe` without
  running the full corridor.
- **Integration against real sandboxes.** The M-Pesa collection leg is validated against
  the live Daraja sandbox (real STK push and asynchronous callback resolution, with
  declined `ResultCode`s mapped to `Failed`), and the custody/bridge leg against a real
  Base Sepolia testnet transfer when `CUSTODY_PROVIDER=evm`.
### Comparison (baseline vs Bandari)
The quote screen shows a direct side-by-side: a bank's four to seven percent and three
to seven day settlement versus Bandari's sub-one-percent all-in fee and seconds-scale
settlement. As an illustrative example, an importer sending USD 50,000 per month would
lose roughly USD 2,000 to 3,500 a month at the bank's four to seven percent; on Bandari
at under one percent that drops to under USD 500, a saving of roughly USD 1,500 to 3,000
per month before counting the value of faster settlement.
### Market figures and their basis
- **Cost (4-7% lost per invoice).** This is consistent with published cross-border cost
  data for Kenya: World Bank / RemitSCOPE figures put the average cost of sending money
  to Kenya at roughly 8% of the amount sent, above both the 3% SDG target and the ~7.7%
  Africa average (RemitSCOPE Africa, Kenya).
- **Corridor size ($200-300M/year).** This is an estimate rather than a single
  published figure: it is derived from the Kenya-China import corridor (approximately
  USD 5 billion per year) multiplied by the per-transaction cost above. At roughly four
  to six percent, that 5 billion implies on the order of 200 to 300 million dollars lost
  to fees and FX each year.
### Regulatory validation (primary sources)
- Kenya's Virtual Asset Service Providers Act, 2025 (Act No. 20 of 2025) received
  Presidential assent on 15 October 2025 and came into force on 4 November 2025,
  opening a regulated path for the first time. The implementing regulations (license
  types, fees) are still being finalized by the National Treasury in consultation with
  the CBK and CMA, and as of late 2025 no VASP had yet been licensed, so part of the
  next step is confirming what is permissible today versus what waits on those
  regulations. Sources: Act No. 20 of 2025, Kenya Law
  (https://new.kenyalaw.org/akn/ke/act/2025/20); CBK/CMA public notice on commencement
  (Central Bank of Kenya, November 2025).
- Next-step validation in progress: conversations with KCB and M-Pesa, the institutions
  that gate this corridor, on banking and regulatory viability.
### Known limitations
The Kenya-side rail is real and demoable; the China off-ramp runs against a partner
sandbox rather than live mainland settlement, and that final RMB leg plus full
regulatory viability are the main things left to prove. See **What's live vs
placeholder** above for the per-leg status.
---
# Project Q&A
## Q1: Why did you build what you did?
I've spent a lot of time studying global trade, how value actually moves between
countries, companies, and people. And for a while I've been fascinated by stablecoin
infrastructure, especially watching how fast Latin America adopted it to pay
suppliers. Companies like Conduit and Bridge showed that you could rebuild
cross-border payments on stablecoin rails and have it just work. So my question was:
why hasn't this come to Africa yet?
It's a weird and niche pull, but I have a lot of friends in Kenya, so I decided to
research one specific corridor: Kenya to China. It turns out a Kenyan importer paying
a Chinese supplier loses four to seven percent of every invoice to FX spread, wire
fees, and correspondent-bank deductions, and waits three to seven days for it to land.
On the Kenya to China corridor alone, that's an estimated 200 to 300 million dollars
leaking out every year.
To make sure this was a real problem, I interviewed Kenyan SME importers directly,
mostly companies bringing in textiles and auto parts from China. What I learned is
that the fee is only the visible part. The real damage is speed. These importers run
on thin margins by turning their working capital quickly. When an importer's money is
locked in transit for a week, they turn their capital fewer times a year, which means
they can't compete on price with a buyer who can pay instantly. So slow payments don't
just cost a few percent. They cap how big and how competitive these businesses can
become.
I also talked to a couple of fintech founders building WAKA, a similar cross-border
payments idea, and I want to credit them for shaping how I think about this. What I
realized from those conversations is that there isn't a dollar shortage. The dollars
exist. They're just stranded, scattered across correspondent banks in Frankfurt,
London, and Paris, with no African financial hub to gather them and move them toward
Asia the way Singapore does for Southeast Asia. Money routes from Nairobi, to Europe,
to China, and velocity collapses along the way.
Two things just changed. The cost of moving value on a stablecoin rail in Kenya has
dropped to around fifty basis points round-trip, finally cheaper than the bank
workaround it replaces. And on November 4th, 2025, Kenya's Virtual Asset Service
Providers Act came into force, opening a regulated path for the first time.
Bandari is a payments app that lets a Kenyan importer pay a Chinese supplier in
shillings and have it settle in seconds, using a stablecoin as the rail instead of
correspondent banks.
## Q2: How exactly does the product work?
First, onboarding. An importer signs up and uploads their KYC documents, business
registration and an ID. Bandari runs a compliance check, and the key trick is that we
use the importer's own bank or M-Pesa account as a verification signal. The name on
the funding source has to match the name on the account, so the money itself becomes
part of the identity check. In this version that verification is mocked, but in
production it plugs into a KYC vendor like Smile ID, which already does this across
Africa.
Next, the importer funds their Bandari account in shillings over M-Pesa, the rail
every Kenyan business already uses. This part is real. We're integrated with
Safaricom's Daraja sandbox, so the app fires a genuine STK push, the test phone gets
the prompt, and a payment callback confirms it and updates the balance.
Now the actual payment. The importer enters how much they want to send and who the
supplier is. Bandari pulls live mid-market exchange rates, shillings to dollars and
dollars to Hong Kong dollars, and quotes near that rate with one small, visible fee.
No hidden spread. Right next to it, you see the comparison: what a bank would charge
and how long it would take, versus what we charge and how fast we settle.
When they hit send, three things happen. The shillings convert to USDC, the digital
dollar, handled through a Circle integration. That USDC moves across the border
on-chain. This leg can run as a real transfer on a public testnet (Base Sepolia) that
you can click and verify; in the demo it runs in mock mode by default. Then the USDC
is off-ramped into Hong Kong dollars, because Hong Kong is the natural clearing hub
for China trade, and from there a licensed mainland partner settles to the supplier in
RMB. We own the customer and the orchestration, and we rent that final mainland leg,
since paying into China directly requires a license we can't hold as a startup.
Underneath, the architecture is simple on purpose. A web frontend, a live FX rates
API, the Safaricom Daraja integration for shillings in, and a wallet that signs the
on-chain transfer. The dollar leg is the only thing that touches a blockchain, and
USDC there is just transport. The only true conversions are shillings to dollars on
our side and dollars to Hong Kong dollars on the other.
## Q3: Potential use cases of the product?
The direct user is the Kenyan SME importer. The trader in Nairobi bringing in phone
accessories from Shenzhen, the hardware shop owner importing power tools, the boutique
stocking textiles from Guangzhou. These are businesses doing anywhere from a few
thousand to a few hundred thousand dollars in imports a year, and almost all of them
pay their Chinese suppliers the same painful way today: an expensive bank wire, or
cash through an informal agent.
At the bank's four to seven percent, that's two to three and a half thousand dollars
lost every month, twenty-five to forty thousand a year, gone to fees and FX. On
Bandari that drops to well under one percent. SMEs are the backbone of Kenya's
economy, and import-dependent trade is how a huge share of them operate. When payment
friction is the hidden tax on every transaction, it caps how fast these businesses can
grow and how well they can compete against larger firms that can absorb the cost.
## Q4: What more would you add?
Next would be a treasury layer to handle FX risk during settlement. But the big one is
lending. Every payment an importer makes builds a verified record of their trade: who
they pay, how much, how often, how reliably they settle. No bank can see this, which
is exactly why these importers are treated as unbankable and locked out of credit
today. We can see all of it. So the next product is working-capital financing, using
our own trade ledger as the underwriting tool. An importer who no longer has to wait
to free up cash between orders can run more import cycles a year, turn their capital
more times, and grow faster, and we earn a financing margin that's far larger than the
payment fee.
I also want to be honest about the limits of where this is today. The Kenya-side rail
is real and fully demoable: M-Pesa in, live FX, and a verifiable on-chain transfer on
Base Sepolia (mocked by default for offline demos). The China off-ramp is built
against a partner sandbox rather than a live mainland settlement, and that final RMB
leg plus regulatory viability under the new VASP Act is the main thing left to prove.
The implementing regulations in Kenya, the actual license types and fees, are still
being finalized, so part of my next step is learning what is genuinely permissible
today versus what waits on those regulations.
That's why the validation so far is split into two parts. Calls with Kenyan SME
importers have verified the problem firsthand, and they were notably open to the
product. The technical prototype proves the rail works end to end on the Kenya side.
The remaining open question is regulatory and banking viability, which is why we're
going to KCB and M-Pesa, the institutions that actually gate this corridor, rather
than guessing.
---
## AI Usage
AI tools were used throughout this project:
- **Code generation**: Cursor and Claude were used to generate most of the code,
  including the NestJS API modules, Prisma schema and ledger logic, the swappable
  integration adapters, and the Next.js frontend.
- **Debugging**: Cursor and Claude were used for most of the debugging, including the
  Daraja callback flow, the payment state machine, and ledger reconciliation.
All architectural and integration decisions were made by me, and I reviewed the
generated code before it went into the project.
## Credits & Sources
- UI built on [shadcn/ui](https://ui.shadcn.com/) components.
- Problem framing shaped by interviews with Kenyan SME importers and conversations with
  the founders of WAKA.
- Adapter targets reference real providers: Safaricom Daraja, Circle, Swypt/Kotani,
  Smile ID, and a Yativo-shaped China payout interface.
