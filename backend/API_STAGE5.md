# API Documentation — Backend Stage 5 (Paystack Payment Integration)

Base URL: `{API_BASE}/api/v1`

Response shape (unchanged from Stages 1-4):

```json
{ "success": true, "message": "...", "data": { } }
```

or, on error:

```json
{ "success": false, "message": "...", "error": { } }
```

This document covers only what Stage 5 actually implements. Backend
Stages 1-4 are documented in `API_STAGE2.md` / `API_STAGE3.md` /
`API_STAGE4.md` and are unchanged — every regression test for them still
passes (see "Regression" below).

**The frontend is never trusted to declare that a payment succeeded.**
Every payment is independently verified against Paystack's API before
anything financial happens, and the amount/currency sent to Paystack (and
checked against on verification) always come from the existing `Order`
row — never from the frontend, never assumed from a webhook body alone.

---

## 1. Architecture

```
User creates order (Stage 3, unchanged)
        │
        ▼
POST /payments/paystack/initialize   — amount/currency read from Order
        │
        ▼
Paystack-hosted checkout (frontend redirects to authorization_url)
        │
        ▼
GET /payments/paystack/verify/:reference   ─┐
        or                                   ├─► same shared verification logic
POST /payments/paystack/webhook (charge.success) ─┘
        │  (only on a genuine amount+currency match)
        ▼
orderService.handleSuccessfulPurchase(orderId)   — EXISTING Stage 3/4 code, untouched
        │
        ▼
Enrollment • 20% cashback • referral SUCCESSFUL • 40% commission •
successful-referral count • Agent verification • milestone rewards
```

`payment.service.js` contains **no** cashback/commission/enrollment
calculation of its own. It verifies the payment and then calls the exact
same `handleSuccessfulPurchase()` that Stage 3/4's dev-simulation
endpoint (`POST /dev/orders/:orderId/simulate-payment`) already used —
see `order.service.js`. This is deliberate: it's the single place that
logic is allowed to live (platform rule "No Duplicated Financial Logic").

## 2. Data model

A `Payment` row is created for every payment **attempt** — not 1:1 with
`Order`. This means a failed/abandoned attempt never permanently blocks
retrying the same (still-`PENDING`) order; a fresh `Payment` row (and
fresh Paystack reference) is created for each retry, and full history is
preserved. `Order.paymentReference` always points at the most recent
attempt.

```
Payment {
  id, orderId, userId, provider ("PAYSTACK"),
  providerReference (unique),
  amount, currency,                 // copied from Order at initialize time
  status: INITIALIZED | PENDING | SUCCESSFUL | FAILED | CANCELLED,
  channel, gatewayResponse, metadata,
  paidAt, verifiedAt, createdAt, updatedAt
}
```

`Order.status` / `Order.paymentStatus` are only ever flipped by the
existing `handleSuccessfulPurchase()` — Stage 5 never writes to them
directly.

## 3. Endpoints

### `POST /payments/paystack/initialize`
Private. Body: `{ "orderId": "..." }` — nothing else is accepted; the
amount sent to Paystack is always `Order.amount`/`Order.currency` from
the database, converted to Paystack's integer subunit (e.g. pesewas for
GHS) via `utils/money.js#toSubunit` (Decimal-based — never a native
float `* 100`).

- 403 if the order belongs to a different user.
- 400 if the order is already `PAID` or `CANCELLED`.
- 404 if the order doesn't exist.

Response `data`:
```json
{
  "payment": { "reference": "PAY-20260823-000001", "amount": 500, "currency": "GHS", "status": "INITIALIZED", ... },
  "authorizationUrl": "https://checkout.paystack.com/...",
  "accessCode": "...",
  "reference": "PAY-20260823-000001"
}
```
Never returns the Paystack secret key or any internal ledger/commission
data.

### `GET /payments/paystack/verify/:reference`
Private (own payments only — an unrecognized/foreign reference 404s,
never leaking whether it exists). Independently calls Paystack's
`GET /transaction/verify/:reference`, cross-checks the returned
amount+currency against the order, and only on a genuine match calls the
existing successful-purchase pipeline. Idempotent: re-verifying an
already-`SUCCESSFUL` payment never re-hits Paystack and never re-runs the
pipeline.

Response `data.status` is one of `SUCCESS | PENDING | FAILED`; a
detected amount/currency mismatch responds `400` instead (see
"Security" below) and never reaches `SUCCESS`.

### `POST /payments/paystack/webhook`
Public endpoint (Paystack calls it directly — no bearer token), but never
trusted without a valid `x-paystack-signature` header: an HMAC-SHA512 of
the **raw** request body, keyed with `PAYSTACK_SECRET_KEY` (see
"Webhook signature verification" below). Only the `charge.success` event
triggers processing; every other recognized event is acknowledged
(`200`) without touching any financial record. An unknown payment
reference is also acknowledged without creating anything.

Internally shares the exact same verify → amount/currency-check →
`handleSuccessfulPurchase()` logic as the `/verify` endpoint above, so a
webhook delivery and a manual verify call for the same payment can never
double-process it.

### `GET /payments`
Private. The caller's payment history. Query: `status`
(`INITIALIZED|PENDING|SUCCESSFUL|FAILED|CANCELLED`), `from`, `to`,
`page`, `limit`.

### `GET /payments/:reference`
Private. The caller's own payment record only (same not-found-shaped
ownership protection as `/payments/paystack/verify/:reference`).

### `GET /admin/payments`
Admin (`ADMIN`/`SUPER_ADMIN`). Query: `search` (matches reference, order
number, course title, or user email), `status`, `userId`, `orderId`,
`courseId`, `from`, `to`, `page`, `limit`.

### `GET /admin/payments/:reference`
Admin. Full payment record including the buyer's identity. Never exposes
the Paystack secret key.

---

## 4. Webhook signature verification

Per Paystack's current documentation, every webhook delivery carries an
`x-paystack-signature` header: a hex-encoded **HMAC-SHA512** of the exact
raw request body, signed with your Paystack **secret** key (not a
separate webhook-signing secret — Paystack does not issue one).

```js
const expected = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
// constant-time compare against the x-paystack-signature header
```

To make the *exact* raw bytes available (re-serializing `req.body` with
`JSON.stringify` can differ in whitespace/key order and silently break
verification), `express.json()`'s `verify` option captures the raw
buffer onto `req.rawBody` for every request in `app.js`. This has no
effect on any other route.

An invalid or missing signature is rejected with `401` before any body
parsing/business logic runs.

## 5. Security checklist (see also §61 of the stage brief)

- [x] Paystack secret key lives only in `config.paystack.secretKey`
      (from `PAYSTACK_SECRET_KEY`) — never returned in a response, never
      logged (`paystack.service.js` logs Paystack's own `message` field
      on errors, never the key or headers).
- [x] Amount and currency always come from `Order` (Stage 3's
      server-priced-from-`Course.price` row) — never the frontend, never
      trusted from the Paystack response without comparison.
- [x] Order ownership checked on initialize (403) and on
      read/verify (404-shaped, no existence leak).
- [x] Every Paystack response is independently re-verified via
      `GET /transaction/verify/:reference` — the webhook body's
      `data.status`/`data.amount` are never trusted on their own either;
      `applyVerificationResult()` calls Paystack again before deciding.
- [x] Webhook signature verified (HMAC-SHA512 over the raw body) before
      any processing.
- [x] Duplicate webhook delivery for an already-`SUCCESSFUL` payment is a
      safe no-op (checked before re-hitting Paystack).
- [x] Duplicate successful-payment processing is impossible:
      `handleSuccessfulPurchase()` itself is idempotent (Stage 3/4,
      unchanged), and Stage 5 adds its own guard in front of it.
- [x] Failed/pending payments never trigger enrollment, cashback,
      commission, or rewards.
- [x] A fake "success" POST from the frontend cannot mark anything
      successful — there is no endpoint that accepts a client-asserted
      status; only Paystack's own verify response (independently
      fetched) can do that.
- [x] No duplicated financial logic — the Paystack controller/service
      never calculates cashback/commission/rewards; it only ever calls
      the existing `handleSuccessfulPurchase()`.
- [x] No refund endpoint, no successful-order cancellation — none exist
      anywhere in this codebase (Stage 3 already guarantees this; Stage 5
      adds nothing that would violate it).
- [x] Timeouts on every Paystack HTTP call (`PAYSTACK_REQUEST_TIMEOUT_MS`,
      default 15s) via `AbortController` — a gateway request can never
      hang indefinitely.

## 6. Environment variables

See `.env.example`:

```
PAYSTACK_SECRET_KEY=""
PAYSTACK_PUBLIC_KEY=""
PAYSTACK_BASE_URL="https://api.paystack.co"
PAYSTACK_CALLBACK_URL="http://localhost:3000/payments/callback"
PAYSTACK_WEBHOOK_SECRET=""     # optional additive check only — Paystack itself signs with the secret key above
PAYSTACK_REQUEST_TIMEOUT_MS=15000
```

`PAYSTACK_SECRET_KEY` is now required in production (`assertCriticalConfig()`
in `config/env.js` fails fast at boot if missing, same pattern as
`JWT_ACCESS_SECRET`).

## 7. Regression

Backend Stages 1-4 are untouched code-wise except for:
- `app.js`: added `verify` option to `express.json()` to capture
  `req.rawBody` (additive; every other route's behavior is unchanged).
- `config/env.js`: expanded the existing (previously unused) `paystack`
  config block; added the secret key to the production
  `assertCriticalConfig()` check.
- `prisma/schema.prisma`: added the `Payment` model and its enums, plus
  a `payments` relation on `Order`/`User`. No existing model/field was
  changed.

All 128 pre-existing tests plus the new Stage 5 tests pass together (see
`tests/services/payment.service.test.js`, `tests/utils/money.test.js`).
