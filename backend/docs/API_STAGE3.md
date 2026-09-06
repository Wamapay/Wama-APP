# API Documentation — Backend Stage 3 (Courses, Content, Purchases & Course Access)

Base URL: `{API_BASE}/api/v1`

All responses share this shape:

```json
{ "success": true, "message": "...", "data": { } }
```

or, on error:

```json
{ "success": false, "message": "...", "error": { } }
```

This document covers only what Stage 3 actually implements. Backend
Stages 1-2 (health, auth, users, agents, admin user/agent management)
are documented in `API_STAGE2.md` and remain unchanged. Cashback,
commission, reward, and withdrawal endpoints are documented in
`API_STAGE4.md`.

**No cashback, commission, or reward is calculated anywhere in this
document** — see `API_STAGE4.md`, which extends
`order.service.js#handleSuccessfulPurchase` rather than rewriting it.

---

## Courses — `/courses`

### `GET /courses`
Public. Only `PUBLISHED` courses are returned unless the caller is an
authenticated Admin/Super Admin (who may also filter by `status`).

Query: `search`, `category` (category slug), `featured` (`true`/`false`),
`minPrice`, `maxPrice`, `status` (Admin only), `sort`
(`newest`|`oldest`|`price_asc`|`price_desc`|`title`), `page`, `limit`.

### `GET /courses/:slug`
Public for `PUBLISHED` courses (404 otherwise unless Admin). Returns
title/description/price/currency/category/thumbnail/coverImage/
publishedAt, a **syllabus** (modules + lesson titles/type/duration/
isPreview — **never lesson `content`**), studentCount, and
ratingSummary/reviewCount.

### `GET /courses/:courseId/content`
Public (shape differs by access). Returns modules + lessons with
`locked: true/false` per lesson; `content` is only included when
`locked` is `false` (preview lesson, or the caller has purchased the
course).

### `GET /courses/:courseId/lessons/:lessonId`
Public for preview lessons. Otherwise requires authentication +
`hasCourseAccess(userId, courseId)` — returns `401` if unauthenticated,
`403` if authenticated but no access, `404` if the lesson doesn't belong
to that course (prevents Course-A-lesson-via-Course-B access).

### `POST /courses/:courseId/lessons/:lessonId/complete`
Private + course access required. Upserts `LessonProgress`, updates the
enrollment's `lastAccessedAt`, and auto-transitions the enrollment to
`COMPLETED` once every lesson in the course is complete.

### `GET /courses/:courseId/progress`
Private. Requires an existing enrollment. Returns totalLessons,
completedLessons, progressPercentage, lastAccessedLesson,
enrollmentStatus, completedAt.

### `GET /courses/:courseId/reviews`
Public — only `PUBLISHED` reviews (Admins may pass `status` to see
`HIDDEN` ones too). Includes `ratingSummary`.

### `POST /courses/:courseId/reviews`
Private + course access required (`403` otherwise). Create-or-update —
one review per user per course; a resubmission updates the same row
instead of creating a duplicate, and never silently un-hides a review an
Admin has moderated.

---

## Categories — `/categories`

### `GET /categories`
Public. Only `ACTIVE` categories.

### `GET /categories/:slug`
Public. `404` for `ARCHIVED` categories.

Category creation/editing is Admin-only — see below.

---

## Orders — `/orders` (all Private, current user)

### `POST /orders`
Body: `courseId`, `referralCode?`. **The client can never supply an
amount** — the schema doesn't accept one, and the service always reads
`Course.price`/`Course.currency` from the database. Requires the course
to be `PUBLISHED` with a valid price. Creates a `PENDING` order with a
generated `orderNumber` (`ORD-YYYYMMDD-NNNNNN`).

### `GET /orders`
Current user's purchase history. Query: `status`, `paymentStatus`,
`courseId`, `from`, `to`, `page`, `limit`.

### `GET /orders/:id`
Only the owning user may view it — any other user gets `404` (never
`403`, to avoid confirming the order exists).

**There is no refund endpoint, no cancellation-of-a-paid-order endpoint,
anywhere in this API.** A `PAID` order is final.

---

## Admin — `/admin/*`

All Admin routes require `authenticate` + `requireRole(ADMIN,
SUPER_ADMIN)`.

### Categories
- `GET /admin/categories` — all statuses
- `POST /admin/categories` — body: `name`, `slug?`, `description?`, `image?`
- `PATCH /admin/categories/:id`
- `POST /admin/categories/:id/archive`
- `POST /admin/categories/:id/activate`

### Courses
- `GET /admin/courses` — any status via `?status=`
- `GET /admin/courses/:id`
- `POST /admin/courses` — body: `title`, `slug?`, `description?`,
  `shortDescription?`, `thumbnail?`, `coverImage?`, `price`, `currency?`,
  `categoryId?`, `instructorId?`, `status?`, `featured?`. **`price` is
  always what gets stored — never re-derived from anything the frontend
  computes at checkout time.**
- `PATCH /admin/courses/:id` — never touches orders/enrollments/
  cashback/commission/balances.
- `POST /admin/courses/:id/publish` — `400` if the course has no valid
  price.
- `POST /admin/courses/:id/unpublish`
- `POST /admin/courses/:id/archive` — preferred over deletion once a
  course has historical orders/enrollments.

### Modules
- `POST /admin/courses/:courseId/modules`
- `PATCH /admin/modules/:id`
- `DELETE /admin/modules/:id` — cascades to its lessons' progress/file
  records inside a transaction.
- `PATCH /admin/courses/:courseId/modules/reorder` — body:
  `{ order: [{ id, position }, ...] }`; rejects any id not belonging to
  the course.

### Lessons
- `POST /admin/modules/:moduleId/lessons` — `type` one of `VIDEO`, `PDF`,
  `AUDIO`, `TEXT`, `DOCUMENT`, `IMAGE`, `EXTERNAL_RESOURCE` (no quiz/
  assessment types exist).
- `PATCH /admin/lessons/:id` — moving `moduleId` is rejected with `400`
  if the target module belongs to a different course.
- `DELETE /admin/lessons/:id`
- `PATCH /admin/modules/:moduleId/lessons/reorder`

### Orders (read-only)
- `GET /admin/orders` — query: `search`, `status`, `paymentStatus`,
  `courseId`, `userId`, `agentId`, `from`, `to`, `page`, `limit`.
- `GET /admin/orders/:id`

**No refund/cancel endpoints exist here either.**

### Review moderation
- `GET /admin/reviews?courseId=...`
- `POST /admin/reviews/:id/approve` — sets `status = PUBLISHED`
- `POST /admin/reviews/:id/hide` — sets `status = HIDDEN`
- `DELETE /admin/reviews/:id`

Moderation only ever toggles `status` — it never rewrites the user's
rating/title/comment.

---

## Dev-only — `/dev/*`
Only mounted when `ENABLE_DEV_ROUTES=true` (forced `false` in
production).

### `POST /dev/orders/:orderId/simulate-payment`
Simulates a successful Paystack payment for an order the current user
owns, driving the exact same `handleSuccessfulPurchase()` path real
Paystack webhook verification will call in a later stage: order → `PAID`
/ `paymentStatus: SUCCESSFUL`, `Enrollment` created, buyer's `Agent`
account ensured via `agentService.createAgentForUser`.

(`/dev/simulate-purchase` and `/dev/simulate-referral-success` are
unchanged from Stage 2.)
