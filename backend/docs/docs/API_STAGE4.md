# API Documentation — Backend Stage 4 (Financial Engine, Cashback, Commissions, Rewards & Withdrawals)

Base URL: `{API_BASE}/api/v1`

Response shape (unchanged from Stages 1-3):

```json
{ "success": true, "message": "...", "data": { } }
```

or, on error:

```json
{ "success": false, "message": "...", "error": { } }
```

This document covers only what Stage 4 actually implements. Backend
Stages 1-3 are documented in `API_STAGE2.md` / `API_STAGE3.md` and are
unchanged (all regression tests for them still pass). `/transactions`,
`/commissions`, `/reports` (top-level) still return a clean `501`
placeholder — their real functionality lives under `/users/me/*` and
`/admin/*` below, per the Stage 4 spec.

**Every balance, cashback, commission, and reward figure below is
calculated server-side.** No endpoint anywhere accepts a client-supplied
amount, balance, or commission value as authoritative.

**Platform rules:** cashback = 20% of a paid course order; referral
commission = 40% of a paid, validly-referred course order; verified
Agent = 20 successful referrals; no minimum or maximum withdrawal;
successful purchases are final (no refunds/cancellations exist anywhere
in this codebase).

---

## Balances & Transaction History — `/users/me`

### `GET /users/me/balances`
Private. Returns the caller's three balances plus their sum.

```json
{
  "balances": {
    "cashbackBalance": 100.5,
    "commissionBalance": 200,
    "rewardBalance": 50,
    "availableWithdrawalBalance": 350.5
  }
}
```

### `GET /users/me/transactions`
Private. Full ledger history for the caller across every transaction
type. Query: `type` (`COURSE_PURCHASE`|`CASHBACK`|`COMMISSION`|`REWARD`|
`WITHDRAWAL`|`WITHDRAWAL_REVERSAL`), `balanceType`
(`CASHBACK`|`COMMISSION`|`REWARD`), `status`
(`PENDING`|`SUCCESSFUL`|`FAILED`), `from`, `to`, `page`, `limit`.

### `GET /users/me/cashback`
Private. Same shape as `/transactions`, pre-filtered to `type=CASHBACK`.
Query: `status`, `from`, `to`, `page`, `limit`.

### `GET /users/me/commissions`
Private. Pre-filtered to `type=COMMISSION`. Same query params.

### `GET /users/me/rewards`
Private. Referral milestone reward history. Query: `status`
(`SUCCESSFUL`|`REVERSED`), `page`, `limit`.

---

## Agent Financial Summary — `/agents/me`

### `GET /agents/me/financial-summary`
Private (Agent). Returns:

```json
{
  "summary": {
    "cashbackBalance": 100,
    "commissionBalance": 400,
    "rewardBalance": 125,
    "availableWithdrawalBalance": 625,
    "totalCommissionEarned": 400,
    "totalCashbackEarned": 100,
    "totalRewardsEarned": 125,
    "successfulReferrals": 22,
    "verificationStatus": "VERIFIED"
  }
}
```

`GET /agents/me` (Stage 2) now also embeds real
`commissionSummary`/`referralStatistics` figures instead of Stage 3's
placeholders.

---

## Withdrawals — `/withdrawals`

No minimum, no maximum. The backend always re-checks the caller's actual
balance server-side; a balance or amount value supplied by the client is
never trusted.

### `POST /withdrawals`
Private. Body: `amount` (number > 0), `balanceType`
(`CASHBACK`|`COMMISSION`|`REWARD`), `paymentMethod` (string),
`paymentDetails` (optional object — provider-specific payout info).
`userId` is never accepted; the authenticated caller is always used.

Atomically reserves (debits) the requested amount from the chosen
balance and creates the withdrawal as `PENDING`. Fails with `400` if the
actual balance is insufficient. This reservation is what makes
concurrent double-withdrawal impossible — see `withdrawal.service.js`.

### `GET /withdrawals`
Private. Only the caller's own withdrawals. Query: `status`
(`PENDING`|`PROCESSING`|`COMPLETED`|`FAILED`), `balanceType`, `from`,
`to`, `page`, `limit`.

### `GET /withdrawals/:id`
Private. 404s (not 403) for another user's withdrawal.

---

## Admin — Financial Engine — `/admin`

All routes below require `ADMIN` or `SUPER_ADMIN`. There is intentionally
**no** endpoint that lets an Admin directly edit a balance.

### `GET /admin/withdrawals`
Query: `status`, `balanceType`, `userId`, `from`, `to`, `page`, `limit`.

### `GET /admin/withdrawals/:id`

### `POST /admin/withdrawals/:id/approve`
`PENDING` → `PROCESSING` only. Logs an `AdminActivity` entry.

### `POST /admin/withdrawals/:id/reject`
Body: `reason` (required, 3-500 chars). Allowed from `PENDING` or
`PROCESSING` only → `FAILED`. Reverses the held balance via a
`WITHDRAWAL_REVERSAL` ledger transaction — the user never loses funds
because of a rejected/failed withdrawal. Logs `AdminActivity`.

### `POST /admin/withdrawals/:id/complete`
Body: `reference` (optional). `PROCESSING` → `COMPLETED` only —
terminal; cannot be completed, approved, or rejected again. Logs
`AdminActivity`.

### `GET /admin/transactions`
Search/browse the full ledger across all users. Query: `search`
(matches transactionId / description / user email), `userId`, `type`,
`balanceType`, `status`, `referenceId`, `from`, `to`, `page`, `limit`.

### `GET /admin/reports/financial-summary`
Query: `period`
(`today`|`yesterday`|`last_7_days`|`last_30_days`|`this_month`|
`last_month`|`custom`), plus `from`/`to` for `custom`. Every figure is a
database aggregation:

```json
{
  "summary": {
    "period": { "from": "...", "to": "..." },
    "totalCourseSales": 12500,
    "totalCashback": 2500,
    "totalCommission": 3200,
    "totalRewards": 450,
    "totalWithdrawals": 4000,
    "pendingWithdrawals": 500,
    "processingWithdrawals": 300,
    "completedWithdrawals": 3000,
    "failedWithdrawals": 200
  }
}
```

### `GET /admin/users/:id/reconciliation`
Diagnostic only — compares the user's stored balance fields against
what the ledger implies (sum of credits minus debits per balance type)
and reports any discrepancy. **Never auto-corrects a balance.**

```json
{
  "reconciliation": {
    "userId": "user_1",
    "balances": {
      "CASHBACK": { "storedBalance": 100, "ledgerBalance": 100, "discrepancy": 0, "consistent": true },
      "COMMISSION": { "storedBalance": 0, "ledgerBalance": 0, "discrepancy": 0, "consistent": true },
      "REWARD": { "storedBalance": 0, "ledgerBalance": 0, "discrepancy": 0, "consistent": true }
    }
  }
}
```

---

## Not implemented (by design)

Per the platform rules for this stage, none of the following exist
anywhere in this codebase: refund endpoints/services, order
cancellation-after-success, quizzes/assessments, an endpoint to
directly edit a balance, real Paystack integration, or fake/simulated
payments beyond the existing Stage 3 `dev.routes.js` test helper (only
mounted when `NODE_ENV !== "production"`).
