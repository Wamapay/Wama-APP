# Platform Backend

Node.js + Express + Prisma backend for the platform (courses, agents,
referrals, financial engine, Paystack payments). Built incrementally
across numbered "Backend Stages" — see `docs/API_STAGE*.md` for the
per-stage API reference. This stage (6) is a security/production
hardening pass; no new business features were added.

## Requirements

- Node.js >= 18
- PostgreSQL (any version compatible with Prisma 5)

## 1. Install

```bash
npm install
```

## 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env` with real values. At minimum for local development you
need `DATABASE_URL`. See `.env.example` for every variable and what it
does — notably:

- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — generate strong random
  values, e.g. `openssl rand -hex 64`.
- `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` — use **test** keys in
  development, from Paystack Dashboard > Settings > API Keys & Webhooks.
- `FRONTEND_URL` / `ADMIN_FRONTEND_URL` — used for CORS and for building
  referral links. In production, requests from origins not in this list
  (plus `CORS_EXTRA_ORIGINS`) are rejected.
- `ENABLE_DEV_ROUTES` — convenience simulation routes for local testing
  only. Forced off in production regardless of this value (see
  `src/config/env.js`).

Never commit `.env` or put real secrets in source control, the README,
or any frontend.

## 3. Database

```bash
npm run generate       # generate the Prisma client
npm run migrate        # apply migrations in development (interactive)
npm run migrate:deploy # apply migrations in production (non-interactive)
npm run seed           # optional: seed reference data
```

## 4. Run

```bash
npm run dev     # development, auto-restart (nodemon)
npm start       # production
```

The server binds to `process.env.PORT` (falls back to `5000` locally),
which is what platforms like Render/Railway/Heroku require. In
production, `assertCriticalConfig()` fails fast at boot (non-zero exit)
if any of `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`FRONTEND_URL`, or `PAYSTACK_SECRET_KEY` is missing.

- Base API URL: `{HOST}/api/v1`
- Health check: `GET /api/v1/health` — liveness only, deliberately never
  touches the database (see `tests/integration/routes.test.js`), so it
  stays fast and reliable as an uptime/orchestrator probe even during a
  transient DB issue.

## 5. Tests

```bash
npm test
```

Fully mocked Prisma client (see `tests/helpers/mockPrisma.js`) — no
real database connection is needed to run the suite.

## 6. Paystack webhook (local development)

Point Paystack's webhook URL (Dashboard > Settings > API Keys &
Webhooks) at `{PUBLIC_URL}/api/v1/payments/paystack/webhook`, or use the
Paystack CLI / a tunnel (ngrok, etc.) to forward it to your local
server during development. The endpoint is public (no bearer token —
Paystack cannot supply one) but verifies the `x-paystack-signature`
header (HMAC-SHA512 over the raw request body, keyed with
`PAYSTACK_SECRET_KEY`) before trusting anything in the payload — see
`docs/API_STAGE5.md` for the full design.

## Architecture notes

- All money math uses `decimal.js` (`src/utils/money.js`) — never
  native floating-point arithmetic.
- The financial ledger (`src/services/ledger.service.js`) is the only
  code path allowed to insert a `Transaction` row or mutate a user's
  cashback/commission/reward balance, and is idempotent per
  `(type, referenceId)` at the database level via a unique constraint —
  not just an application-level check.
- Response shape is consistent across the API:
  `{ success, message, data }` or `{ success: false, message, error }`.
- Consult `docs/API_STAGE2.md` through `API_STAGE5.md` for endpoint-level
  documentation of each stage.
