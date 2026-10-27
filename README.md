# World Associates Shipping CO — منصة الشحن (Arabic RTL)

A complete Arabic RTL shipping & logistics platform: a **customer portal**
(shipments, warehouse packages, consolidation, claims, support) and an
**operations/admin console** (shipments, warehouse, claims, tickets, payments,
customers, status matrix, audit log) for **Guangzhou, China → KSA** freight.

> This README is a developer/setup guide. The product UI itself is 100 % Arabic
> RTL (`dir="rtl"`, timezone `Asia/Riyadh`, currency `SAR`).

---

## 1. Stack

| Layer | Choice |
| --- | --- |
| Framework | **Next.js 16.4** (App Router, Cache Components, Partial Prerendering) + **React 19.3** |
| Language | TypeScript (strict) |
| Styling | **Tailwind CSS v4** + a hand-built shadcn-style UI kit in `src/components/ui/` |
| Database | **PostgreSQL — the Supabase project itself** (schema in `supabase/migrations/`) |
| Auth | **Supabase Auth** (email + password) via `@supabase/ssr` cookie sessions |
| Data access | **`@supabase/supabase-js`** (PostgREST) with column aliasing; **no ORM at runtime** |
| Security | **Row Level Security on every table** (deny-by-default) + `SECURITY DEFINER` RPCs |
| Validation | Zod v4 (`src/lib/validation.ts`), Arabic error messages |
| Tests | Vitest (`tests/*.test.ts`) — 46 tests |

**Design rule:** the browser and the server actions only ever hold the
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The service-role key is never used by
the app — every privileged operation happens inside `SECURITY DEFINER`
PostgreSQL functions, and every table read/write is gated by RLS.

---

## 2. Features

**Customer portal** — registration (server-generated customer number
`WA-100001`), dashboard statistics, shipment list/detail with event timeline,
warehouse packages, consolidation groups, address book (one default, deletion
locks on active shipments), shipment linking via claims (staff approval),
payments overview, support tickets, notifications, public **tracking page**
(`WAS-2026-000001`, no login required).

**Admin console** — dashboard stats (real counts only), customer management
(suspend/reinstate), shipment status changes through an **admin-configurable
transition matrix**, warehouse package register/receive (`PKG-000001`),
claim review (`approve_claim` / `reject_claim` RPCs), support replies
(`TKT-000001`), offline payment recording (`record_payment` RPC recomputes
paid/partially_paid/unpaid), status catalogue flags, and an immutable audit log.

**Roles** — `super_admin`, `operations_manager`, `warehouse_staff`,
`customer_support`, `finance_staff` (+ implicit `customer`), matrix in
`src/lib/permissions.ts`.

---

## 3. Repository layout

```
supabase/migrations/     0001_schema · 0002_functions · 0003_rls · 0004_seed
RESET_AND_SETUP.sql      Full DB setup (paste into Supabase SQL Editor)
PATCH_0005_align_app.sql App-alignment patch (columns + RPCs; see §4.2)
src/lib/supabase/        supabase-js browser / SSR clients + env checks
src/server/queries/      read paths (supabase-js, aliased selects)
src/server/actions/      Server Actions (Zod → RPCs / RLS-guarded writes)
src/server/auth/         session + route/action guards
middleware.ts            cookie refresh + auth redirects (edge)
tests/                   unit tests (format, permissions, rate-limit, validation)
```

---

## 4. Setup

### 4.1 Create the Supabase project

1. Create a project at <https://supabase.com/dashboard>.
2. Open **SQL Editor** → paste the entire **`RESET_AND_SETUP.sql`** → **Run**.
   (18 tables, 17 functions, triggers, RLS policies, status catalogue + site
   settings seed.)
3. **Authentication → Sign In / Providers → Email**: turn **Confirm email**
   OFF while testing (otherwise new accounts can't sign in immediately).

### 4.2 Apply the app-alignment patch (required)

In the same SQL Editor, paste the entire **`PATCH_0005_align_app.sql`** →
**Run**. It is idempotent and adds:

- the columns the UI reads/writes (`customer_addresses.label`,
  `shipment_events.source`, ticket `reply`/`replied_at`, payment
  `notes`, audit `actor_label`, …) and widens two status checks;
- the `SECURITY DEFINER` RPCs the app calls:
  `check_signup_conflicts`, `lookup_login_email`, `log_audit`,
  `create_notification`, `track_shipment_public` (public tracking), the
  notes-aware `record_payment`, and an enriched `handle_new_user` trigger
  that also provisions the first default address;
- grants that let signed-in users generate tracking/package/ticket numbers,
  and let anonymous visitors read `site_settings` (public homepage content).

✅ Success signal: a results table of 10 rows (column counts per table) with no
errors.

### 4.3 Environment

```bash
cp .env.example .env
```

Fill in (Dashboard → Project Settings):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL, e.g. `https://abcdefgh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Publishable** (anon) API key |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` (prod: your deployed URL) |

Never add the service-role key to this app.

### 4.4 Run

```bash
npm install
npm run dev        # http://localhost:3000
```

Quality gates:

```bash
npm test           # vitest (46 tests)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # production build
```

### 4.5 Bootstrap the first administrator

Staff roles are rows in `user_roles` — there is no self-service way to become
staff (customers cannot insert into `user_roles`; RLS blocks it):

1. Supabase Dashboard → **Authentication → Users → Add user** →
   email + password (confirm email off).
2. SQL Editor → run (replace `<AUTH_USER_UUID>` with that user's UUID):

```sql
select public.promote_to_super_admin('<AUTH_USER_UUID>');
```

3. Sign in at `/login` with that account → `/admin`.

---

## 5. Deployment

The fastest path is Vercel's one-click deploy of this repository:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbinsunker-glitch%2FShippingGoods&project-name=world-associates-shipping&framework=nextjs&env=NEXT_PUBLIC_SUPABASE_URL%2CNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY%2CNEXT_PUBLIC_APP_URL&envDescription=Supabase%20Project%20URL%2C%20publishable%20(anon)%20key%2C%20then%20the%20deployed%20URL%20itself&env-NEXT_PUBLIC_SUPABASE_URL=https%3A%2F%2Fgqsydgfftfnecpmwlpqh.supabase.co&env-NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ykbUQmMJNsWtYgtNXuIooQ_P8lsKY0a&env-NEXT_PUBLIC_APP_URL=https%3A%2F%2Fyour-app.vercel.app)

Manual equivalent: **Vercel → Add New → Import Git Repository** → select
`binsunker-glitch/ShippingGoods` → set the three env vars above → Deploy
(Next.js is auto-detected).

**After the first deploy:**

1. Set `NEXT_PUBLIC_APP_URL` to the real URL Vercel assigned
   (`https://<project>.vercel.app`) — it is used in auth/recovery links.
2. Supabase → **Authentication → URL Configuration** → add
   `https://<project>.vercel.app/**` to Redirect URLs (needed for password
   recovery links).
3. The database is shared with your Supabase project — just make sure §4.1–4.2
   were applied once; no per-deploy DB work exists anymore.

> **Note:** the deploy button already contains this project's URL and
> *publishable* key. That key is designed to be public (it ships in the
> browser bundle of any Supabase app); RLS is what protects the data. The
> service-role key is never part of the app or the repository.

---

## 6. Architecture & security notes

- **Identity** — `profiles.id` is `auth.users.id`; a `handle_new_user` trigger
  provisions the profile (`WA-100001`, server-seeded) and first address on
  sign-up. Suspended accounts (`profiles.account_status ≠ 'active'`) get
  `null` from `getSession()` on every request, which kills all live sessions.
- **Session** — `@supabase/ssr` stores the Supabase session in `httpOnly`
  cookies; `middleware.ts` refreshes tokens and redirects anonymous visitors.
- **RLS** — deny-by-default on all 18 tables. Customers read only their own
  rows; staff writes are role-scoped policies; audit/notifications go through
  `SECURITY DEFINER` RPCs so ownership checks live in one place
  (`supabase/migrations/0003_rls.sql`).
- **Status taxonomy** — the 18 shipment statuses live in
  `shipment_status_catalog`; the 7 dashboard groups
  (`warehouse/ready/awaiting_payment/in_transit/delivered/exception/cancelled`)
  are **derived in TypeScript** from `STATUS_GROUP_BY_CODE`
  (`src/lib/constants.ts`) so UI tabs and filters can never drift from the DB.
- **Status changes** — only via `transition_shipment()`, which validates the
  admin-managed transition matrix and writes one idempotent timeline event
  atomically. Catalogue flags (`restricted`, `is_active`) are enforced too.
- **Claim linking** — submitting a claim never assigns a shipment. Every claim
  is queued `pending`; staff approve through `approve_claim()`, which links the
  shipment to the claimant inside one transaction.
- **Payments** — `record_payment()` accepts amount/method/reference/notes only
  (never card numbers or CVV), recompute the shipment's
  `paid/partially_paid/unpaid` state from `verified` rows, and write the audit
  entry themselves.
- **Public tracking** — anonymous lookups go through
  `track_shipment_public()`, which returns only safe fields (status, dates,
  timeline) — never customer names, phones, addresses, or fees.
- **Rate limiting** — in-process fixed windows on login, registration,
  password recovery, claims, tickets, and tracking (see `src/server/rate-limit.ts`).
  For multi-instance deployments back this with a shared store.
- **Audit** — every sensitive action appends to `audit_logs` via `log_audit()`;
  the actor is always `auth.uid()` (never client-supplied), and sensitive keys
  are redacted.

---

## 7. License / contact

World Associates Shipping CO — Guangzhou, China → المملكة العربية السعودية.
