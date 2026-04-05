# Bandari — Cross-Border Payment Prototype (Sandbox)

A **local-only**, sandbox/test-mode prototype that moves a simulated cross-border
payment end to end: collect **KES via M-Pesa**, convert to a USD stablecoin (**USDT**),
move it to **Hong Kong**, off-ramp **USDT→HKD** via a stubbed HK FX API, and pay the
supplier in their chosen currency (**HKD / CNH / CNY**) — with a correct double-entry
ledger, refund handling, and a deterministic verification layer.

> Nothing here moves real money. The **M-Pesa collection leg is wired to the real
> Daraja sandbox** (one-step toggle below); the on-ramp, HK FX, and payout legs are
> production-shaped placeholders. The asset is technically Circle USDC internally and
> is **labelled USDT** in the demo narrative. KYC/AML is hardcoded/prefilled for the
> demo. **No real value moves — testnet only.**

## Stack

| Area      | Choice |
|-----------|--------|
| Monorepo  | Turborepo + pnpm workspaces, TypeScript end-to-end |
| Web       | `apps/web` — Next.js + Tailwind + shadcn/ui (Stripe-inspired UI) |
| API       | `apps/api` — NestJS on Fastify, modular monolith |
| Mobile    | `apps/mobile` — Expo/React Native, scaffolded for later |
| Shared    | `packages/shared` — types + Zod schemas + typed API client (reused by web + mobile) |
| Data      | Postgres + Prisma (state + double-entry ledger) |
| Jobs      | Redis + BullMQ (durable orchestration); falls back to an inline orchestrator |

### Integration adapters (swappable, mock ⇄ live)

`MpesaAdapter` (Daraja) · `OnRampAdapter` (Swypt/Kotani) · `CustodyAdapter` (Circle)
· `ChinaPayoutAdapter` (Yativo-shaped) · `KycAdapter` (Smile ID). Each exposes
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

- Node.js 20+ and `pnpm`
- Postgres + Redis running locally. Either:
  - `pnpm services:up` (uses Docker Compose if present, else Homebrew `postgresql@16` + `redis`), or
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

- **Dashboard** — `http://localhost:3000` (totals + recent payments)
- **New payment** — `/payments/new` (live quote, all-in price)
- **Payment detail** — `/payments/:id` (Stripe-style timeline, references, ledger, retry/refund)
- **Ops console** — `/ops` (run segment probes, inspect verifiers)

In mock mode, the payment detail page has a **Simulate M-Pesa funding** button that
fires the STK callback and drives the corridor to `Settled`.

## Live demo (Vercel, no backend)

The web app can run **fully self-contained** against an in-browser mock — no API,
Postgres, or Redis — so it deploys to Vercel as a static demo. Seeded data lives in
`localStorage` and payments animate through the happy path on a wall clock
(`apps/web/lib/mock-client.ts`).

Demo mode turns on automatically whenever `NEXT_PUBLIC_API_URL` is **not** set (the
case on Vercel), or explicitly with `NEXT_PUBLIC_DEMO_MODE=true`. Locally,
`apps/web/.env.local` sets `NEXT_PUBLIC_API_URL=http://localhost:4000`, so dev keeps
talking to the real API.

Deploy on Vercel:

1. Import this repo and set **Root Directory** to `apps/web` (build/install are pinned
   in `apps/web/vercel.json`, which builds `@bandari/shared` first via Turborepo).
2. No env vars are required for the demo. (Optionally set `NEXT_PUBLIC_DEMO_MODE=true`
   to be explicit, or later set `NEXT_PUBLIC_API_URL` to point the UI at a hosted API.)

## Verification (local only — no GitHub / hosted CI)

All checks run on your machine. Mocks make them fast and reproducible; an opt-in
live run hits the real sandboxes using your local `.env` secrets.

```bash
pnpm probe          # segment health checks + one canned probe per leg
pnpm e2e            # one happy-path corridor end to end + ledger + reconciliation
pnpm verify         # full suite: probes + happy-path + refund-path stage verifiers
pnpm verify:live    # same suite against real sandboxes (ADAPTER_MODE=live)
pnpm hooks:install  # optional local pre-push git hook that runs `pnpm verify`
```

Every probe/verifier returns a structured result (segment, expected vs actual,
amounts, latency, raw request/response, pass/fail + the failing assertion). There is
**no AI in the product** — interpretation is left to whoever runs the hooks.

## Documented run

`pnpm e2e` boots an isolated inline API, runs one corridor, and prints the timeline,
ledger, and reconciliation. A passing run looks like:

```
=== Payment <id> timeline (Settled) ===
  ... -> Quoted           Payment created from quote
  Quoted          -> AwaitingFunding  STK push sent (mock); awaiting M-Pesa confirmation
  AwaitingFunding -> Funded           Funds collected via M-Pesa (...)
  Funded          -> OnRamped         KES converted to 386.10 USDT (mock)
  OnRamped        -> Bridging         USDT transfer submitted (mock) tx=0x...
  Bridging        -> Bridged          USDT confirmed on-chain (att=att_...)
  Bridged         -> PayingOut        HK off-ramp USDT→HK$3011.58 @ 7.80; payout created (mock) id=payout_mock_...
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

50,000 KES sent → 50,600 KES all-in (fee/spread) → 386.10 USDT bridged → HK off-ramp
(USDT→HKD ≈ HK$3,011 via the stubbed HK FX) → 2,772.20 CNY credited on the internal
ledger. Internal treasury accounts net to zero; external accounts carry the expected
net positions.

## What's live vs placeholder

| Leg | Status |
|-----|--------|
| **M-Pesa collection (STK push)** | **Live-capable** against the real Daraja sandbox (one-step toggle below). Mocked by default so the demo runs offline. |
| KYC / AML | **Hardcoded & prefilled** for the demo — layered screening (identity, sanctions, risk, wallet), "documents on file", gating, and an ops review queue, all client-side. |
| KES → USDT on-ramp | Placeholder — converts in-process at the locked rate (labelled USDT; internally USDC). |
| USDT custody / bridge | Mock by default; a **real** testnet transfer runs on Base Sepolia when `CUSTODY_PROVIDER=evm`. |
| HK off-ramp (USDT → HKD) | Placeholder — a **stubbed HK FX call** at a fixed ≈ 7.80. |
| Supplier payout (HKD / CNH / CNY) | Placeholder — simulated payout id; no real rail. |

## Real M-Pesa (Daraja sandbox) runbook

The collection leg is fully wired; you just need free sandbox credentials.

1. Create a sandbox app at <https://developer.safaricom.co.ke> and copy the
   **Consumer Key**, **Consumer Secret**, and the **Lipa na M-Pesa Online passkey**
   (sandbox STK uses shortcode `174379`).
2. In `apps/api/.env` paste the three values, then set:
   ```
   ADAPTER_MODE=live
   MPESA_ENABLED=true
   ```
   (Other legs stay mocked because their `*_ENABLED` flags remain `false`.)
3. Expose the API so Safaricom can POST the callback, and point `PUBLIC_BASE_URL` at it:
   ```bash
   pnpm tunnel                 # prints an https://<id>.trycloudflare.com URL
   # set PUBLIC_BASE_URL=<that url> in apps/api/.env, then restart the API
   ```
4. Run the stack (`pnpm dev`) and create a payment from the importer flow. A **real
   STK prompt** hits the test phone; the async callback resolves funding (or maps a
   declined `ResultCode` to `Failed`). The M-Pesa receipt is captured and shown on the
   payment detail. Everything downstream of `Funded` continues in mock mode.

To return KES on failure for real, the refund (B2C) leg would be a separate M-Pesa app.

## Out of scope

Real money movement, production licensing (PSP/MRP/VASP/Forex), live partner
contracts, and lending — tracked separately on the regulatory/ops track.
