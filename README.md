# World Associates Shipping CO — نظام الشحن (Arabic RTL)

منصة شحن كاملة باللغة العربية (RTL) لشركة **World Associates Shipping CO** لشحن المشتريات من
مستودع قوانغتشو (الصين) إلى المملكة العربية السعودية: موقع عام، تسجيل ودخول، لوحة العميل،
ربط وتتبع الشحنات، عناوين، مدفوعات، إشعارات، دعم فني — بالإضافة إلى **لوحة إدارة** بتقسيم
صلاحيات حسب الدور.

> This README is a developer/setup guide. The product UI itself is 100 % Arabic RTL
> (`dir="rtl"`, timezone `Asia/Riyadh`, currency `SAR`).

---

## 1. Stack

| Layer | Choice |
| --- | --- |
| Framework | **Next.js 16.4** (App Router, Cache Components, Partial Prerendering) + **React 19.3** |
| Language | TypeScript (strict) |
| Styling | **Tailwind CSS v4** + a hand-built shadcn-style UI kit in `src/components/ui/` |
| ORM | **Drizzle ORM** (`PostgreSQL` dialect) — schema in `src/db/schema.ts` |
| Database | **PostgreSQL**. Locally: embedded **PGlite** in `.data/` when `DATABASE_URL` is empty. In production: any Postgres (e.g. Supabase) via `DATABASE_URL` |
| Auth | First-party credentials auth: bcryptjs password hashes + DB-backed sessions in an `httpOnly` cookie (SHA-256 token hashes in the DB) |
| Validation | Zod v4 (`src/lib/validation.ts`), Arabic error messages |
| Tests | Vitest (`tests/*.test.ts`) |

**Why not Supabase Auth / a hosted BaaS?** No Supabase credentials were available in this
environment, so the app ships with a complete, secure first-party auth + Postgres layer that
runs with **zero external services** (PGlite). The SQL schema and Drizzle migrations are
standard PostgreSQL — pointing `DATABASE_URL` at a Supabase (or any) Postgres database is a
drop-in change, no code edits required.

---

## 2. Quick start (local, zero services)

```bash
npm install
cp .env.example .env      # then edit SESSION_SECRET (see below)
npm run dev               # predev runs db:migrate + db:seed automatically
```

Open http://localhost:3000.

`npm run dev` / `npm run build` automatically:

1. `db:migrate` — applies the SQL migrations from `supabase/migrations/` (or `.sql` files) to the database.
2. `db:seed` — idempotently inserts **reference data only**: the 19 shipment status catalog rows,
   status transitions, numbering sequences, site settings, and the first super admin.

No fake customers or shipments are ever seeded.

### Required `.env` before any real use

```bash
SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
BOOTSTRAP_ADMIN_EMAIL="admin@your-domain.com"
BOOTSTRAP_ADMIN_PASSWORD="<strong temporary password>"
```

---

## 3. Environment variables

All variables are documented inline in [`.env.example`](.env.example).

| Variable | Purpose | Required? |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection string. **Empty ⇒ embedded PGlite in `PGLITE_DATA_DIR`** (local dev) | Prod: yes |
| `PGLITE_DATA_DIR` | Local embedded DB directory (default `.data`, git-ignored) | No |
| `SESSION_SECRET` | HMAC/entropy source for session tokens — must be long & random | **Yes** |
| `SESSION_COOKIE_NAME` / `SESSION_TTL_DAYS` | Session cookie name / lifetime (default 30 days) | No |
| `NEXT_PUBLIC_APP_URL` | Canonical origin, used in emails/links | Prod: yes |
| `APP_TIMEZONE` | `Asia/Riyadh` | No |
| `UPLOAD_DIR` / `MAX_UPLOAD_BYTES` | Upload storage root & size cap | No |
| `PAYMENT_GATEWAY_*` | Gateway name, keys, webhook secret. `PAYMENT_GATEWAY_ENABLED=false` until a Saudi gateway is contracted; the UI then shows **"بانتظار الإعداد"** instead of pretending to charge cards | For payments |
| `BOOTSTRAP_ADMIN_EMAIL/_PASSWORD/_NAME` | Creates the first super admin on first `db:seed` | First run |

Card numbers and CVV are **never** stored anywhere — the payment layer records gateway
references, amounts and statuses only.

---

## 4. Scripts

```bash
npm run dev          # start dev server (auto db:setup)
npm run build        # production build (auto db:setup)
npm start            # serve the production build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # vitest run (authorization, validation, rate-limit, format suites)
npm run db:generate  # drizzle-kit generate → new SQL migration
npm run db:migrate   # apply migrations
npm run db:seed      # idempotent reference seed + admin bootstrap
npm run db:setup     # migrate + seed
```

> `npx next typegen` must be re-run after adding any new route file, otherwise `tsc`
> fails with stale `PageProps` route constraints.

---

## 5. Project structure

```
src/
  app/
    (marketing)/     # public: /, /track, /privacy
    (auth)/          # /register, /login, /forgot-password, /reset-password
    (portal)/        # customer: /dashboard /shipments /addresses /payments
                     #           /notifications /help /link-shipment /welcome ...
    admin/           # staff: dashboard, customers, shipments, warehouse,
                     #        claims, payments, support, statuses, audit
  components/        # ui kit (button, card, dialog, form, table, badge, ...)
                     # shipment/, brand/, stat-card
  db/
    schema.ts        # 21 tables, enums, constraints, indexes (source of truth)
    client.ts        # getDb() → PGlite or node-postgres, withTransaction()
  lib/               # validation.ts, permissions.ts, format.ts, constants.ts, ids
  server/
    actions/         # server actions (auth, addresses, claims, tracking, admin, statuses, support)
    queries/         # read models (portal + admin)
    auth/            # session, guards (requireCustomer / requireAdmin / requirePermission)
    audit.ts, notify.ts, rate-limit.ts, ids.ts
scripts/             # migrate.mjs, seed.mjs (plain ESM)
tests/               # vitest suites
supabase/migrations/ # generated SQL migrations
```

---

## 6. Security model

- **Authentication**: bcryptjs (cost 10+) password hashes; sessions stored server-side with
  SHA-256 token hashes; `httpOnly`, `SameSite=Lax`, `Secure` (in production) cookie.
  Customer IDs (`WA-100001`) are **display identifiers only — never credentials**.
- **Authorization**: every portal/admin server action and query re-checks the session and role
  server-side (`requireCustomer`, `requireAdmin`, `requirePermission`). The admin nav is
  filtered by `permissionsFor(role)`, but the **server is the enforcement point** — a hidden
  link is never the only control.
- **Roles**: `super_admin`, `operations_manager`, `warehouse_staff`, `support`, `finance`,
  `customer`. Unknown/garbage roles are rejected by an explicit staff-role allow-list.
- **Data isolation**: every customer query filters by `customerId = session.profileId`
  (IDOR-proof); shipment claims verify ownership and queue uncertain ones for staff approval,
  with DB partial unique indexes preventing multi-claim.
- **Rate limiting**: in-memory limiter on register / login / password reset / public tracking.
- **Audit log**: staff and sensitive customer mutations write `audit_logs` rows (actor, action,
  entity, timestamp) — viewable at `/admin/audit`.
- **Passwords**: never logged, never returned by actions; reset tokens are single-use,
  expiring, stored hashed.
- **PII**: no passwords/tokens/full addresses in logs; retention aligned with Saudi PDPL-style
  expectations (documented in `/privacy`, editable from admin).

---

## 7. Deployment

1. Provision a PostgreSQL database (Supabase, Neon, RDS, …) and set `DATABASE_URL`.
2. Set `SESSION_SECRET`, `NEXT_PUBLIC_APP_URL`, `BOOTSTRAP_ADMIN_*`, and upload/payment vars.
3. `npm run build` → `npm start` (or deploy to Vercel/Node host). `prebuild` runs `db:setup`.
4. Log in with the bootstrap admin, change the password immediately, then create staff
   accounts and assign roles.
5. Point the payment gateway variables at a contracted Saudi gateway before enabling
   checkout; until then payments stay in the documented "pending configuration" state.

The embedded PGlite database (`/data`, `.data/`) is **not** suitable for multi-instance or
serverless production — use a real Postgres there.

---

## 8. Known limitations / what still needs wiring

- **Payment gateway**: architecture is in place (gateway abstraction, verified-webhook
  endpoint, finance offline-payment recording with audit), but no live gateway credentials
  were available, so live card checkout is intentionally disabled and labeled as such.
- **Email/SMS delivery**: password-reset and notification *delivery* goes through the DB
  notification center; wiring an actual SMTP/SMS provider (e.g. Unifonic) is a config-only
  task in `src/server/notify.ts`.
- **File uploads**: upload constraints and storage path exist, but virus-scanning and an
  object-storage (S3) backend should be added for production documents.
- **Rate limiting** is in-memory per instance; use Redis for multi-instance deployments.
- **Content**: FAQ/privacy/contact/site settings are editable rows in `site_settings`
  (seeded with sensible Arabic defaults and an explicit "review with legal counsel" note).
