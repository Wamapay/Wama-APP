# Learn & Earn

A course platform: real-money cashback on purchases, an affiliate/agent
referral system with commissions, and Paystack-powered payments and
payouts (Mobile Money + bank transfer).

This repo has three independently-deployable parts sharing one backend:

```
backend/    Node.js + Express + Prisma (PostgreSQL) API
frontend/   Main learner-facing app (static, single index.html)
admin/      Admin dashboard (static, single index.html + source to rebuild)
```

## Deployment order

1. **Database** — provision PostgreSQL (e.g. Neon, Supabase, RDS, or
   self-hosted).
2. **Backend** — deploy `backend/` to a Node host (Render, Railway,
   Fly.io, a VPS, etc.). See `backend/README.md` for env vars, migration,
   and start commands.
3. **Frontend + Admin** — deploy `frontend/index.html` and
   `admin/index.html` to any static host. Each needs to be told the
   backend's URL (see their individual READMEs) — and the backend's
   `FRONTEND_URL` / `ADMIN_FRONTEND_URL` env vars need to match wherever
   you put them, for CORS.
4. **Paystack** — once you know your real frontend domain, set
   `PAYSTACK_CALLBACK_URL` on the backend to
   `https://<your-frontend-domain>/#/checkout/callback`, and configure
   the webhook URL in the Paystack Dashboard to
   `https://<your-backend-domain>/api/v1/payments/paystack/webhook`.

## Required environment variables (backend only)

Full details and every variable in `backend/.env.example`. Never commit
a real `.env` file — only `.env.example` (no real values) belongs in
source control. At minimum for production: `DATABASE_URL`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URL`,
`ADMIN_FRONTEND_URL`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_CALLBACK_URL`.

## Security notes

- No secret (database credentials, JWT secrets, Paystack secret key)
  appears anywhere in `frontend/` or `admin/` — both are pure static
  files that only ever call the backend's public API.
- Admin authorization is enforced server-side on every `/admin/*`
  request — the admin dashboard's frontend login check is a UX
  convenience only, not the actual security boundary.
- Paystack payment/payout verification always happens server-side,
  independently re-confirmed with Paystack rather than trusted from a
  frontend callback or webhook payload alone.

## Local development

Run the backend locally (`backend/README.md`), then open
`frontend/index.html` and `admin/index.html` directly, or serve them with
any static file server, pointed at `http://localhost:<backend-port>/api/v1`.
