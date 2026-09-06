# API Documentation — Backend Stage 2 (Authentication, Users & Agents)

Base URL: `{API_BASE}/api/v1`

All responses share this shape:

```json
{ "success": true, "message": "...", "data": { } }
```

or, on error:

```json
{ "success": false, "message": "...", "error": { } }
```

Only endpoints actually implemented in this stage are documented below.
Every other module (`/categories`, `/orders`, `/transactions`,
`/commissions`, `/withdrawals`, `/notifications`, `/reports`) still
returns a clean `501` placeholder response and is documented in a later
stage.

---

## Auth — `/auth`

### `POST /auth/register`
Public. Rate-limited.

Body: `fullName`, `email`, `phone?`, `password`, `referralCode?`

- Email is normalized (trimmed + lowercased) and must be unique.
- Password must be 8+ characters with at least one letter and one number.
- If `referralCode` matches an existing Agent, a `Referral` attribution
  record is created with status `REGISTERED`. **Registration alone is
  never a successful referral** — it does not increment the Agent's
  `successfulReferrals` and generates no commission.
- Response never includes the password or its hash.

### `POST /auth/login`
Public. Rate-limited.

Body: `email`, `password`.

- Generic `401 "Invalid email or password."` for both an unknown email
  and a wrong password — account existence is never revealed.
- `403` if the account is `SUSPENDED`.
- On success, returns the user plus `{ accessToken, refreshToken,
  expiresIn }`.

### `POST /auth/refresh`
Public (requires a valid refresh token in the body).

Body: `refreshToken`.

- Refresh tokens are opaque random strings, tracked (hashed) in the
  database so they can be individually revoked — not JWTs.
- Rotates on every use: the presented token is revoked and a new pair is
  issued. Rejects expired/revoked tokens with `401`.

### `POST /auth/logout`
Body: `refreshToken`. Revokes that specific refresh token/session.

### `POST /auth/change-password`
Private. Requires `Authorization: Bearer <accessToken>`.

Body: `currentPassword`, `newPassword`.

Revokes **all** of the user's active refresh tokens on success (all other
sessions/devices are signed out).

### `POST /auth/forgot-password`
Public. Rate-limited.

Body: `email`. Always returns the same generic message regardless of
whether the account exists. Creates a hashed, 1-hour-expiry reset token
(the raw token is never returned in the API response; a real email
provider is wired up in a later stage — for now it's logged server-side
only in non-production environments).

### `POST /auth/reset-password`
Public. Rate-limited.

Body: `token`, `newPassword`. Validates and expires the token on use,
hashes the new password, and revokes all of the user's refresh tokens.

### `POST /auth/verify-email`
Body: `token`. Marks `emailVerified = true` and consumes the token.

### `POST /auth/resend-verification`
Rate-limited. Body: `email`. Generic response; no-ops for unknown/already
verified accounts.

---

## Users — `/users`

### `GET /users/me`
Private. Returns the authenticated user's profile (never
`passwordHash`/tokens), including nested Agent info when applicable.

### `PATCH /users/me`
Private. Body may include `fullName`, `phone`, `profileImage` — any
other field (role, status, commission, verification, Agent ID, etc.) is
silently ignored; those are backend-controlled.

---

## Agents — `/agents`

### `GET /agents/me`
Private. `404` if the caller has no Agent profile yet (Agents are only
created via the purchase system — see below). Returns agentId,
referralCode, referralLink (frontend can render this as a QR code),
status, successfulReferrals, verificationStatus, verifiedAt, plus
placeholder `commissionSummary`/`referralStatistics` blocks that a later
finance stage will populate.

---

## Admin — `/admin`

All routes require `Authorization: Bearer <accessToken>` for an `ADMIN`
or `SUPER_ADMIN` user; anything else gets `403`.

- `GET /admin/users?status=&page=&limit=` — paginated user list.
- `GET /admin/users/:id`
- `POST /admin/users/:id/suspend`
- `POST /admin/users/:id/activate`
- `GET /admin/agents?status=&page=&limit=`
- `GET /admin/agents/:id`
- `POST /admin/agents/:id/suspend`
- `POST /admin/agents/:id/activate`

Suspend/activate never deletes data (orders, referrals, agent record,
etc.) and is logged to `AdminActivity` (`adminId`, `action`,
`targetType`, `targetId`, `createdAt`). No delete-user, and no
commission/cashback/reward editing — those are out of scope for Stage 2.

---

## Dev-only — `/dev` (non-production only)

Only mounted when `ENABLE_DEV_ROUTES=true` **and** `NODE_ENV !==
"production"` (the production check cannot be overridden by the env
var). Lets you exercise the Agent-creation and verification flows before
the real purchase/referral system exists in a later stage.

- `POST /dev/simulate-purchase` — private; ensures the caller has an
  Agent profile (idempotent — calling it twice never creates a second
  Agent).
- `POST /dev/simulate-referral-success` — private; body `{ "count": 20
  }`; sets the caller's Agent `successfulReferrals` and recalculates
  verification.

---

## Business rules preserved from Stage 2 spec

- 20 successful referrals ⇒ `verificationStatus = VERIFIED` (backend-only,
  recalculated in `updateAgentVerification`).
- One user ⇔ at most one Agent profile (unique constraint + idempotent
  creation service).
- Passwords hashed with bcrypt (12 rounds); JWT secrets from environment
  variables only.
- Suspension restricts access without deleting any data.
- No refunds/course cancellations/quizzes/assessments/financial
  calculations implemented in this stage.
