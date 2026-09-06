# Services

Business logic lives here, separated from routes/controllers. Controllers
call services; services call the database layer (`src/database/client.js`)
and never the other way around.

## Implemented (Backend Stage 2)

- `auth.service.js` — registration, login, JWT access + opaque
  DB-tracked refresh tokens (issue/rotate/revoke), change/forgot/reset
  password, email verification token issuance/consumption.
- `user.service.js` — current-user retrieval (with Agent info attached)
  and self-service profile updates (fullName/phone/profileImage only).
- `agent.service.js` — idempotent `createAgentForUser(userId)` (called by
  the purchase system in a later stage), Agent ID/referral code
  generation, `updateAgentVerification(agentId)` (the ONLY place
  verification is calculated, from `successfulReferrals >= 20`), and
  suspend/activate.
- `referral.service.js` — referral attribution at registration time only
  (status `REGISTERED`). Does NOT increment `successfulReferrals` or
  generate commission — that requires a later stage confirming a
  qualifying purchase.
- `admin.service.js` — list/get users & agents, suspend/activate (with
  `AdminActivity` audit logging). No delete, no financial editing.

## Implemented (Backend Stage 3)

- `category.service.js` — CRUD + archive/activate for course categories.
  Admin-only writes.
- `course.service.js` — CRUD, publish/unpublish/archive (guards against
  publishing without a valid price), search/filter/sort/pagination. The
  single source of truth for `price`/`currency` — never re-derived from
  a client value.
- `module.service.js` / `lesson.service.js` — course content CRUD,
  position-based ordering, and cross-course containment checks (a lesson
  can never be silently moved into another course's module).
- `courseAccess.service.js` — `hasCourseAccess(userId, courseId)`, the
  single reusable check every protected-content path goes through.
- `enrollment.service.js` — idempotent enrollment creation
  (`ensureEnrollment`, called only from `order.service.js`'s
  `handleSuccessfulPurchase`), access lookups.
- `progress.service.js` — per-lesson completion tracking rolled up into
  course-level progress %, auto-completing the enrollment.
- `order.service.js` — order creation with **server-side price
  protection** (the client can only ever supply `courseId`), unique
  human-readable order numbers, and `handleSuccessfulPurchase(orderId)` —
  idempotent, marks the order `PAID`, creates the `Enrollment`, and calls
  `agentService.createAgentForUser`. Cashback/commission/reward
  calculation and `Referral.status -> SUCCESSFUL` are intentionally NOT
  done here — Backend Stage 4 hooks into this function without needing to
  touch the purchase system itself. No refund/cancellation function
  exists anywhere in this file.
- `review.service.js` — one review per user per course (upsert, not
  duplicate), eligibility gated by `courseAccess.service.js`, Admin
  moderation via `status` only (never rewrites the review content).
- `fileAsset.service.js` — storage-provider-agnostic file metadata +
  access-checked metadata retrieval, preparing for real object storage
  (S3-compatible + signed URLs) in a later stage.

## Planned (later stages)

- `order.service.js` payment webhook verification (real Paystack) — Backend Stage 4
- `cashback.service.js`, `commission.service.js`, `reward.service.js`,
  `withdrawal.service.js` — Backend Stage 6 (referral SUCCESS transition
  and `Agent.successfulReferrals` increments land here too)
- `notification.service.js` — Backend Stage 7
- `report.service.js` — Backend Stage 9
