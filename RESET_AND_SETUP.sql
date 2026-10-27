-- ============================================================================
-- World Associates Shipping CO — RESET + FULL SETUP
-- إعادة إنشاء قاعدة البيانات من الصفر بالطريقة المثالية
--
-- الطريقة: Supabase Dashboard → SQL Editor → New query → الصق محتوى هذا الملف
-- كاملاً → اضغط Run.
-- آمن للتشغيل المتكرر: يفحص الجداول القديمة ويبديها داخل معاملة واحدة،
-- ثم ينشئ 18 جدولاً + الدوال والمشغّلات + حماية RLS + بيانات الإسناد.
-- (مخطط auth الخاص بـ Supabase لا يُمس.)
-- ============================================================================

begin;

-- 1) فحص وحذف القديم --------------------------------------------------------
do $$
declare
  t text;
  old_tables text := '';
begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
  loop
    old_tables := old_tables || t || ', ';
  end loop;
  if old_tables <> '' then
    raise notice 'DELETE OLD TABLES: %', old_tables;
  else
    raise notice 'No old tables found — fresh database.';
  end if;
end $$;

drop schema public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;

commit;

-- ============================================================================
-- PART 2 — SCHEMA (18 tables)
-- ============================================================================
-- ============================================================================
-- 0001_schema.sql
-- World Associates Shipping CO — منصة الشحن والخدمات اللوجستية (Guangzhou → KSA)
-- Schema / البنية الأساسية: extensions, tables, constraints, indexes
--
-- ملاحظات عامة / General notes:
--   • العملة: SAR — جميع أعمدة المال NUMERIC(12,2) / all money NUMERIC(12,2).
--   • الوزن: NUMERIC(10,3) / weights NUMERIC(10,3).
--   • كل الجداول لها مفتاح أساسي UUID (DEFAULT gen_random_uuid()).
--   • الطوابع الزمنية TIMESTAMPTZ DEFAULT now() (Asia/Riyadh يضبط التطبيق، القاعدة UTC).
--   • المصادقة عبر Supabase Auth — جدول auth.users موجود مسبقاً ولا ننشئه هنا.
-- ============================================================================

-- pgcrypto => gen_random_uuid(); citext => emails غير حساسة لحالة الأحرف
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- ============================================================================
-- 1) shipment_status_catalog — كتالوج حالات الشحنة (18 حالة، مزرع في 0004)
--    جدول مرجعي (reference) لا يملك علاقات تؤدي لحذف بيانات تشغيلية.
-- ============================================================================
create table public.shipment_status_catalog (
  code            text primary key,
  label_ar        text not null,
  label_en        text not null,
  group_name      text not null check (group_name in ('pending','in_transit','exception','completed')),
  sort_order      int  not null,
  is_exception    boolean not null default false,
  is_terminal     boolean not null default false,
  created_at      timestamptz not null default now(),
  -- الكود نفسه لازم يكون ضمن القائمة المعتمدة (18 حالة فقط)
  constraint shipment_status_catalog_code_check check (
    code in (
      'created','awaiting_package','received_at_warehouse','registered',
      'ready_for_consolidation','consolidating','ready_to_ship','awaiting_payment',
      'paid','shipped_from_china','arrived_in_saudi_arabia','customs_clearance',
      'handed_to_local_carrier','out_for_delivery','delivered',
      'delayed','delivery_failed','cancelled'
    )
  )
);
comment on table public.shipment_status_catalog is
  'Catalog of the 18 allowed shipment statuses / كتالوج الحالات الـ18 المسموح بها';

-- ============================================================================
-- 2) sequences — عدّاد تسلسلي آمن ضد التزامن (customer_number, tracking_number,
--    package_reference, ticket_number).
--    ملاحظة: المفتاح الأساسي مركب (name, year) لأن أرقام التتبع تبدأ من 1 كل سنة
--    (WAS-2026-000001, WAS-2027-000001, ...) — Primary key is (name, year) because
--    tracking numbers reset annually.
-- ============================================================================
create table public.sequences (
  name        text not null,
  year        int  not null default 0,
  last_value  bigint not null default 0,
  prefix      text,
  primary key (name, year)
);
comment on table public.sequences is
  'Concurrency-safe counters via next_seq() / عدّادات آمنة ضد التزامن — لا وصول مباشر للعملاء (لا توجد سياسة RLS)';

-- ============================================================================
-- 3) profiles — ملفات العملاء (مرتبطة بـ auth.users)
--    ON DELETE CASCADE: حذف المستخدم من Supabase Auth يحذف ملفه.
--    (سجلات الشحن نفسها محمية لاحقاً بـ RESTRICT ضد حذف العملاء).
-- ============================================================================
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  customer_number text not null unique
                   check (customer_number ~ '^WA-[0-9]{6}$'),        -- WA-100001
  full_name      text not null,
  phone          text not null unique
                   check (phone ~ '^\+9665[0-9]{8}$'),               -- جوال سعودي +9665XXXXXXXX
  email          citext unique,                                       -- من Supabase Auth (nullable) — نوع citext غير حساس لحالة الأحرف
  city           text,
  account_status text not null default 'active'
                   check (account_status in ('active','suspended','closed')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on column public.profiles.customer_number is
  'Human-facing customer ID (WA-100001) / رقم العميل المقروء — يُولَّد بـ gen_customer_number()';
comment on column public.profiles.account_status is
  'Staff-only field; enforce_profile_self_update() blocks customer edits / حقل للموظفين فقط';

-- ============================================================================
-- 4) customer_addresses — عناوين العملاء (بيانات مملوكة للعميل → CASCADE)
-- ============================================================================
create table public.customer_addresses (
  id                        uuid primary key default gen_random_uuid(),
  customer_id               uuid not null references public.profiles (id) on delete cascade,
  recipient_name            text not null,
  phone                     text not null,   -- جوال/هاتف المستلم (يتحقق التطبيق من الصيغة؛ لا نقيّد عناوين الآخرين)
  city                      text not null,
  district                  text,
  street                    text,
  building_number           text,
  secondary_number          text,
  postal_code               text,
  national_address_short_code text,
  address_details           text,
  delivery_instructions     text,
  is_default                boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
-- عنوان افتراضي واحد فقط لكل عميل (partial unique index)
create unique index customer_addresses_one_default_per_customer
  on public.customer_addresses (customer_id) where is_default;
create index idx_customer_addresses_customer_id on public.customer_addresses (customer_id);
create index idx_customer_addresses_city on public.customer_addresses (city);

-- ============================================================================
-- 5) user_roles — أدوار الموظفين
--    ملاحظة: مستخدم بلا صفوف هنا = عميل عادي (regular customer).
-- ============================================================================
create table public.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in (
               'super_admin','operations_manager','warehouse_staff',
               'customer_support','finance_staff')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
comment on table public.user_roles is
  'Staff roles; a user with NO row is a regular customer / أدوار الموظفين — من لا صف له هو عميل عادي';

-- ============================================================================
-- 6) shipments — الشحنات
--    customer_id nullable حتى تُسند لاحقاً، و ON DELETE RESTRICT لمنع حذف
--    سجل العميل أثناء وجود شحناته (حماية سجل الشحن التاريخي).
-- ============================================================================
create table public.shipments (
  id                        uuid primary key default gen_random_uuid(),
  tracking_number           text not null unique
                              check (tracking_number ~ '^WAS-[0-9]{4}-[0-9]{6}$'), -- WAS-2026-000001
  customer_id               uuid references public.profiles (id) on delete restrict,
  description               text,
  package_count             integer not null default 1 check (package_count > 0),
  weight                    numeric(10,3),
  dimensions                jsonb,                 -- {"length":..,"width":..,"height":..,"unit":"cm"}
  shipping_method           text,
  origin                    text not null default 'Guangzhou, China',
  destination_city          text,
  destination_address_snapshot jsonb,              -- نسخة مجمّدة من العنوان وقت الإرسال
  current_status            text not null references public.shipment_status_catalog (code),
  estimated_delivery_date   date,
  shipping_fee              numeric(12,2),
  currency                  text not null default 'SAR',
  payment_status            text not null default 'unpaid'
                              check (payment_status in ('unpaid','partially_paid','paid','refunded')),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
comment on column public.shipments.destination_address_snapshot is
  'Frozen copy of address at dispatch / نسخة مجمّدة من العنوان عند الإرسال';
create index idx_shipments_customer_id on public.shipments (customer_id);
create index idx_shipments_current_status on public.shipments (current_status);
create index idx_shipments_payment_status on public.shipments (payment_status);
create index idx_shipments_destination_city on public.shipments (destination_city);
-- tracking_number بـ UNIQUE ينشئ فهرس تلقائياً (lookup بالباركود)

-- ============================================================================
-- 7) shipment_events — سجل أحداث الشحنة
--    ON DELETE RESTRICT: لا يمكن حذف شحنة لها أحداث (تاريخ الشحن مقدس).
-- ============================================================================
create table public.shipment_events (
  id             uuid primary key default gen_random_uuid(),
  shipment_id    uuid not null references public.shipments (id) on delete restrict,
  status         text not null references public.shipment_status_catalog (code),
  location       text,
  description    text,
  event_timestamp timestamptz not null,
  created_by     uuid,     -- auth user id — بلا FK عمداً حتى يبقى الحدث إن حُذف حساب الموظف
  created_at     timestamptz not null default now()
);
-- فهرس فريد يحقق Idempotency: عمليات الإعادة لا تكرر الأحداث
create unique index shipment_events_idempotency
  on public.shipment_events (shipment_id, status, event_timestamp);
create index idx_shipment_events_shipment_id on public.shipment_events (shipment_id);
create index idx_shipment_events_event_timestamp on public.shipment_events (event_timestamp desc);

-- ============================================================================
-- 8) shipment_packages — الطرود في مستودع غوانغجو
--    shipment_id nullable + ON DELETE SET NULL: الطرد قد يُسجّل قبل ربطه بشحنة،
--    وحذف الشحنة لا يمسّ بيانات الطرد التشغيلية (المستودع يحتاجها).
--    customer_id nullable + SET NULL حتى لا يضيع الطرد إذا حُذف العميل.
--    photo_path: مسار داخل storage خاص (PRIVATE) وليس رابطاً عاماً.
-- ============================================================================
create table public.shipment_packages (
  id                      uuid primary key default gen_random_uuid(),
  shipment_id             uuid references public.shipments (id) on delete set null,
  package_reference       text not null unique check (package_reference ~ '^PKG-[0-9]{6}$'),
  carrier_tracking_number text,
  weight                  numeric(10,3),
  dimensions              jsonb,
  warehouse_location      text,
  photo_path              text,   -- private storage path — لا تضع روابط عامة هنا
  warehouse_received_at   timestamptz,
  package_status          text not null default 'received' check (package_status in (
                            'awaiting_identification','received','registered','assigned',
                            'consolidated','shipped','delivered')),
  customer_id             uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
comment on column public.shipment_packages.photo_path is
  'PRIVATE storage path only (accessed via signed URLs) / مسار تخزين خاص فقط — لا روابط عامة';
create index idx_shipment_packages_shipment_id on public.shipment_packages (shipment_id);
create index idx_shipment_packages_customer_id on public.shipment_packages (customer_id);
create index idx_shipment_packages_carrier_tracking on public.shipment_packages (carrier_tracking_number);
create index idx_shipment_packages_status on public.shipment_packages (package_status);

-- ============================================================================
-- 9) shipment_claim_requests — مطالبات "طردي عندكم ولم يُسجّل"
--    customer_id CASCADE: مطالبة تابعة لعميل محذوف تُحذف معه (لا قيمة لها بعده).
--    shipment_id SET NULL: إلغاء ربط المطالبة بشحنة لا يمحو المطالبة.
-- ============================================================================
create table public.shipment_claim_requests (
  id                      uuid primary key default gen_random_uuid(),
  customer_id             uuid not null references public.profiles (id) on delete cascade,
  carrier_tracking_number text not null,
  description             text,
  document_path           text,   -- مستند إثبات في storage خاص
  shipment_id             uuid references public.shipments (id) on delete set null,
  request_status          text not null default 'pending'
                            check (request_status in ('pending','approved','rejected','cancelled')),
  created_at              timestamptz not null default now(),
  reviewed_by             uuid,   -- auth user id (لا FK: قد يُحذف حساب المراجع)
  reviewed_at             timestamptz,
  review_note             text
);
comment on column public.shipment_claim_requests.document_path is
  'PRIVATE storage path / مسار تخزين خاص — يُتاح بروقعة موقّعة (signed URL)';
-- مانع تكرار المطالبات: مطالبة نشطة واحدة فقط لكل عميل على نفس رقم الناقل
create unique index claim_requests_one_active_per_carrier_ref
  on public.shipment_claim_requests (customer_id, carrier_tracking_number)
  where request_status in ('pending','approved');
create index idx_claim_requests_customer_id on public.shipment_claim_requests (customer_id);
create index idx_claim_requests_shipment_id on public.shipment_claim_requests (shipment_id);
create index idx_claim_requests_status on public.shipment_claim_requests (request_status);

-- ============================================================================
-- 10) shipment_payments — مدفوعات الشحنات
--     ON DELETE RESTRICT: المدفوعات سجل مالي ولا تُحذف مع الشحنة.
--     ⚠️ قاعدة غير قابلة للتفاوض / CRITICAL: لا نخزّن أرقام بطاقات ولا CVV أبداً.
--     لا تحفظ PAN/CVV/CVC في أي عمود أو metadata — الدفع عبر مزوّد خارجي (مثلاً
--     Moyasar/HyperPay) نحن نخزّن transaction_reference فقط.
-- ============================================================================
create table public.shipment_payments (
  id                    uuid primary key default gen_random_uuid(),
  shipment_id           uuid not null references public.shipments (id) on delete restrict,
  amount                numeric(12,2) not null check (amount >= 0),
  currency              text not null default 'SAR',
  payment_method        text check (payment_method in ('card','bank_transfer','cod','cash')),
  payment_status        text not null default 'pending'
                          check (payment_status in ('pending','verified','failed','refunded')),
  transaction_reference text,
  recorded_at           timestamptz,
  recorded_by           uuid,   -- auth user id
  created_at            timestamptz not null default now()
);
comment on table public.shipment_payments is
  'NEVER store card numbers (PAN) or CVV here / لا تخزّن أرقام البطاقات أو CVV إطلاقاً — المراجع فقط (transaction_reference)';
create index idx_shipment_payments_shipment_id on public.shipment_payments (shipment_id);
create index idx_shipment_payments_status on public.shipment_payments (payment_status);

-- ============================================================================
-- 11) notifications — إشعارات العميل (بيانات مملوكة → CASCADE)
-- ============================================================================
create table public.notifications (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.profiles (id) on delete cascade,
  title             text not null,
  message           text not null,
  notification_type text,
  link              text,
  read_at           timestamptz,
  created_at        timestamptz not null default now()
);
create index idx_notifications_customer_id on public.notifications (customer_id);
create index idx_notifications_unread on public.notifications (customer_id) where read_at is null;

-- ============================================================================
-- 12) support_tickets — تذاكر الدعم (CASCADE لأنها تابعة للعميل)
-- ============================================================================
create table public.support_tickets (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.profiles (id) on delete cascade,
  ticket_number text not null unique check (ticket_number ~ '^TKT-[0-9]{6}$'),
  subject      text not null,
  description  text not null,
  status       text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  priority     text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_support_tickets_customer_id on public.support_tickets (customer_id);
create index idx_support_tickets_status on public.support_tickets (status);
create index idx_support_tickets_priority on public.support_tickets (priority);

-- ============================================================================
-- 13) audit_logs — سجل تدقيق
--     actor_id بدون FK عمداً حتى لا يتكسّر السجل التدقيقي عند حذف حساب موظف.
--     ⚠️ لا تضع كلمات مرور أو tokens أو عناوين كاملة في metadata.
-- ============================================================================
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,   -- intentionally NO FK (retention) — لا FK عمداً لحماية الاحتفاظ بالسجل
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.audit_logs is
  'Audit trail. Keep passwords/tokens/full addresses OUT of metadata / سجل تدقيق — لا كلمات مرور أو tokens أو عناوين كاملة';
create index idx_audit_logs_actor_id on public.audit_logs (actor_id);
create index idx_audit_logs_entity on public.audit_logs (entity_type, entity_id);
create index idx_audit_logs_created_at on public.audit_logs (created_at desc);

-- ============================================================================
-- 14) shipment_status_transitions — آلة الحالات المسموح بها
-- ============================================================================
create table public.shipment_status_transitions (
  id            uuid primary key default gen_random_uuid(),
  from_status   text not null references public.shipment_status_catalog (code),
  to_status     text not null references public.shipment_status_catalog (code),
  is_active     boolean not null default true,
  requires_role text check (requires_role in (
                  'super_admin','operations_manager','warehouse_staff',
                  'customer_support','finance_staff')),
  created_at    timestamptz not null default now(),
  unique (from_status, to_status),
  constraint shipment_status_transitions_no_self check (from_status <> to_status)
);
comment on column public.shipment_status_transitions.requires_role is
  'Optional role gate on the transition / دور مطلوب اختيارياً لتنفيذ الانتقال';
create index idx_status_transitions_from on public.shipment_status_transitions (from_status);

-- ============================================================================
-- 15/16) consolidation_groups / consolidation_items — التجميع البحري
--     المجموعة مملوكة لعميل محدد → customer_id RESTRICT (لا حذف مجموعة بها شحنات).
--     العنصر: CASCADE مع المجموعة، RESTRICT مع الطرد (الطرد جزء من سجل المستودع).
--     UNIQUE(package_id): طرد ينضم لمجموعة واحدة فقط نشطة.
-- ============================================================================
create table public.consolidation_groups (
  id            uuid primary key default gen_random_uuid(),
  group_code    text not null unique,       -- مثل CG-2026-000001
  customer_id   uuid not null references public.profiles (id) on delete restrict,
  status        text not null default 'open' check (status in ('open','locked','shipped','cancelled')),
  total_weight  numeric(10,3),
  shipping_fee  numeric(12,2),
  currency      text not null default 'SAR',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_consolidation_groups_customer_id on public.consolidation_groups (customer_id);
create index idx_consolidation_groups_status on public.consolidation_groups (status);

create table public.consolidation_items (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.consolidation_groups (id) on delete cascade,
  package_id uuid not null unique references public.shipment_packages (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index idx_consolidation_items_group_id on public.consolidation_items (group_id);

-- ============================================================================
-- 17) documents — مستندات العميل (فاتورة، هوية، إلخ)
--     storage_path يشير إلى bucket خاص (PRIVATE) — الوصول عبر signed URLs فقط.
--     owner CASCADE: مستندات مملوكة للعميل تُحذف معه.
--     shipment SET NULL: يبقى المستند حتى لو أُلغي ربط الشحنة.
-- ============================================================================
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  shipment_id   uuid references public.shipments (id) on delete set null,
  kind          text not null,       -- 'invoice','packing_list','id_document','claim_proof', ...
  storage_path  text not null,       -- PRIVATE bucket path — ليس رابطاً عاماً
  original_name text,
  mime_type     text,
  size_bytes    integer check (size_bytes >= 0),
  created_at    timestamptz not null default now()
);
comment on column public.documents.storage_path is
  'PRIVATE bucket path only; expose via signed URLs / مسار في bucket خاص فقط — يُتاح بروقعة موقّعة';
create index idx_documents_owner_id on public.documents (owner_id);
create index idx_documents_shipment_id on public.documents (shipment_id);

-- ============================================================================
-- 18) site_settings — إعدادات الموقع (مفتاح/قيمة JSONB)
-- ============================================================================
create table public.site_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- END OF 0001_schema.sql — 18 جدولاً / 18 tables
-- ============================================================================


-- ============================================================================
-- PART 3 — FUNCTIONS + TRIGGERS (الدوال والمشغّلات)
-- ============================================================================
-- ============================================================================
-- 0002_functions.sql
-- World Associates Shipping CO — دوال الأمان والمنطق (SECURITY DEFINER)
--
-- ⚠️ قواعد أمان غير قابلة للتفاوض / Non-negotiable security rules:
--   1) كل دالة SECURITY DEFINER تحدد SET search_path = public (وأحياناً ''
--      صراحة) حتى لا يستطيع المهاجم حقن مسار بحث بديل (search_path hijacking).
--   2) REVOKE EXECUTE FROM PUBLIC على كل الدوال، ثم منح EXECUTE فقط للأدوار
--      التي تحتاجها فعلاً (authenticated / service_role).
--   3) كل دالة تتحقق من المستخدم المصادق داخلياً (auth.uid() + user_roles)
--      ولا تعتمد على أن المستدعي "مصرّح له" في الواجهة.
--   4) دوال has_role()/is_staff() هي SECURITY DEFINER حتى لا تسبب RLS تقييماً
--      تعاكسياً (recursive policy evaluation) على جدول user_roles.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) set_updated_at() — مشغّل موحّد لتحديث updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger fn: keeps updated_at fresh / دالة مشغّل موحدة لتحديث updated_at';

-- تثبيت المشغّل على كل الجداول التي تملك updated_at
drop trigger if exists trg_set_updated_at on public.profiles;
create trigger trg_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.customer_addresses;
create trigger trg_set_updated_at before update on public.customer_addresses
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.shipments;
create trigger trg_set_updated_at before update on public.shipments
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.shipment_packages;
create trigger trg_set_updated_at before update on public.shipment_packages
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.support_tickets;
create trigger trg_set_updated_at before update on public.support_tickets
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.consolidation_groups;
create trigger trg_set_updated_at before update on public.consolidation_groups
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.site_settings;
create trigger trg_set_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- B/C) has_role() / is_staff() — مساعدات RLS
-- SECURITY DEFINER + search_path مقيّد: تعبر RLS على user_roles دون تقييم
-- تعاكسي لأن صاحب الدالة (postgres) يتجاوز RLS.
-- ---------------------------------------------------------------------------
-- لغة plpgsql عمداً (لا SQL): دوال SQL قد تُضمَّن (inline) داخل الاستعلام، وتفقد
-- معها ضمان SECURITY DEFINER → قد ينشأ تقييم تعاكسي على user_roles. plpgsql لا يُضمَّن.
create or replace function public.has_role(p_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = p_role
  );
end;
$$;

create or replace function public.is_staff()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role in ('super_admin','operations_manager','warehouse_staff',
                   'customer_support','finance_staff')
  );
end;
$$;

comment on function public.has_role(text) is
  'RLS helper: does auth.uid() hold p_role? / هل يحمل المستخدم الحالي الدور المحدد؟';
comment on function public.is_staff() is
  'RLS helper: does auth.uid() hold ANY staff role? / هل يحمل المستخدم الحالي أي دور موظف؟';

-- ---------------------------------------------------------------------------
-- D) next_seq() — عدّاد تسلسلي آمن ضد التزامن
-- INSERT ... ON CONFLICT DO UPDATE ذرّي في PostgreSQL (row lock) → آمن مع
-- الطلبات المتزامنة. لا تعتمد على SEQUENCE العلني أو على تطبيقات العملاء.
-- p_year يسمح ببدء عدّاد جديد كل سنة (أرقام التتبع).
-- ---------------------------------------------------------------------------
create or replace function public.next_seq(p_name text, p_year int default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := coalesce(p_year, 0);
  v bigint;
begin
  insert into public.sequences (name, year, last_value)
  values (p_name, v_year, 1)
  on conflict (name, year)
    do update set last_value = sequences.last_value + 1   -- الاستشهاد بجدول الهدف بدون سكيما (النمط الموثّق)
  returning last_value into v;
  return v;
end;
$$;

comment on function public.next_seq(text, int) is
  'Concurrency-safe counter / عدّاد آمن ضد التزامن — للاستخدام الداخلي فقط (لا EXECUTE للعملاء)';

-- ---------------------------------------------------------------------------
-- E/F/G) مولّدات الأرقام البشرية
--   customer_number : WA-100001 (العدّاد يبدأ من 100000 — يُزرع في 0004)
--   tracking_number : WAS-<year>-000001 (يبدأ من 1 كل سنة)
--   package_reference: PKG-000001
--   ticket_number   : TKT-000001
-- ---------------------------------------------------------------------------
create or replace function public.gen_customer_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return 'WA-' || lpad(public.next_seq('customer_number')::text, 6, '0');
end;
$$;

create or replace function public.gen_tracking_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from now())::int;  -- Asia/Riyadh يضبطها التطبيق؛ السنة هنا UTC/DB
begin
  return 'WAS-' || v_year::text || '-' ||
         lpad(public.next_seq('tracking_number', v_year)::text, 6, '0');
end;
$$;

create or replace function public.gen_package_reference()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return 'PKG-' || lpad(public.next_seq('package_reference')::text, 6, '0');
end;
$$;

create or replace function public.gen_ticket_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return 'TKT-' || lpad(public.next_seq('ticket_number')::text, 6, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- H) handle_new_user() — تجهيز الحساب تلقائياً عند التسجيل
--    مشغّل AFTER INSERT على auth.users (الجدول موجود مسبقاً في كل مشروع Supabase).
--
--    ⚠️ المتوقع من التطبيق في signUp (Supabase JS):
--       supabase.auth.signUp({
--         email, password,
--         options: { data: { full_name: '...', phone: '+9665XXXXXXXX', city: 'Riyadh' } }
--       })
--       phone يجب أن يكون بصيغة +9665XXXXXXXX لأن CHECK في profiles يفرض ذلك.
--
--    التعامل مع الفشل: كشف استثناء متداخل → فشل تجهيز الملف لا يُرجِع تسجيل
--    المستخدم (لا يُبطّل إدراج auth.users)، بل يسجّل WARNING ويُصلح لاحقاً
--    عبر public.repair_missing_profiles().
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (
      id, customer_number, full_name, phone, email, city, account_status
    ) values (
      new.id,
      public.gen_customer_number(),
      coalesce(new.raw_user_meta_data->>'full_name', ''),
      new.raw_user_meta_data->>'phone',                      -- قد يكون NULL → violation → يُلتقط أدناه
      coalesce(new.email, new.raw_user_meta_data->>'email'),
      coalesce(new.raw_user_meta_data->>'city', ''),
      'active'
    )
    on conflict (id) do nothing;   -- idempotent: إعادة التشغيل/الإعادة لا تكرر الملف
  exception when others then
    -- لا نُفشل إنشاء الحساب؛ ننبه المشغّل ونعتمد على repair_missing_profiles()
    raise warning 'handle_new_user: profile provisioning failed for user %: %',
      new.id, sqlerrm;
  end;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'AFTER INSERT ON auth.users: provisions public.profiles idempotently / تجهيز الملف الشخصي تلقائياً';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- استرداد الحسابات الناقصة (profiles مفقودة) — يستدعيها المشغّل عند الحاجة
create or replace function public.repair_missing_profiles()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  r record;
begin
  -- لا يحق لأي مستخدم غير service_role تشغيل هذه الدالة (تُسحب أدناه)
  for r in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
  loop
    begin
      insert into public.profiles (
        id, customer_number, full_name, phone, email, city, account_status
      ) values (
        r.id,
        public.gen_customer_number(),
        coalesce(r.raw_user_meta_data->>'full_name', ''),
        -- إن غاب الهاتف أو كان غير صالح نولّد رقماً مؤقتاً فريداً متوافقاً مع
        -- CHECK (uniqueness على phone) ثم يُصلحه الموظف لاحقاً؛ الأهم ألّا نفقد الحساب.
        case when coalesce(r.raw_user_meta_data->>'phone','') ~ '^\+9665[0-9]{8}$'
             then r.raw_user_meta_data->>'phone'
             else '+9665' || lpad((abs(hashtext(r.id::text)) % 100000000)::text, 8, '0')
        end,
        coalesce(r.email, r.raw_user_meta_data->>'email'),
        coalesce(r.raw_user_meta_data->>'city', ''),
        'active'
      )
      on conflict (id) do nothing;
      v_count := v_count + 1;
    exception when others then
      raise warning 'repair_missing_profiles: failed for user %: %', r.id, sqlerrm;
    end;
  end loop;
  return v_count;
end;
$$;

comment on function public.repair_missing_profiles() is
  'Backfills profiles for auth.users lacking one / استرداد الملفات الناقصة بعد فشل التجهيز';

-- ---------------------------------------------------------------------------
-- I) transition_shipment() — انتقال حالة الشحنة (transaccional + idempotent)
--    • يتحقق أن المتصل موظف (is_staff()).
--    • يقفل صف الشحنة FOR UPDATE ضد سباقات التزامن.
--    • يتحقق أن الانتقال مسموح حسب shipment_status_transitions (is_active).
--    • p_expected_from = optimistic concurrency check (يمنع تجاوز تعديلات الآخرين).
--    • يدرج shipment_events مع ON CONFLICT → إعادة المحاولة لا تكرر الحدث.
-- ---------------------------------------------------------------------------
create or replace function public.transition_shipment(
  p_shipment_id   uuid,
  p_to_status     text,
  p_location      text default null,
  p_description   text default null,
  p_expected_from text default null
)
returns public.shipment_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_event   public.shipment_events;
begin
  if not public.is_staff() then
    raise exception 'not authorized';  -- / غير مصرّح
  end if;

  select s.current_status into v_current
  from public.shipments s
  where s.id = p_shipment_id
  for update;

  if not found then
    raise exception 'shipment not found: %', p_shipment_id;
  end if;

  if p_expected_from is not null and p_expected_from <> v_current then
    raise exception 'concurrent modification: expected status %, found %',
      p_expected_from, v_current;
  end if;

  if v_current = p_to_status then
    raise exception 'invalid transition: already in status %', v_current;
  end if;

  if not exists (
    select 1 from public.shipment_status_transitions t
    where t.from_status = v_current
      and t.to_status   = p_to_status
      and t.is_active
  ) then
    raise exception 'invalid transition: % -> %', v_current, p_to_status;
  end if;

  -- بوابة دور اختيارية على الانتقال نفسه
  if exists (
    select 1 from public.shipment_status_transitions t
    where t.from_status = v_current and t.to_status = p_to_status
      and t.is_active and t.requires_role is not null
  ) and not exists (
    select 1 from public.shipment_status_transitions t
    where t.from_status = v_current and t.to_status = p_to_status
      and t.is_active
      and (t.requires_role is null or public.has_role(t.requires_role))
  ) then
    raise exception 'role % required for transition % -> %',
      (select requires_role from public.shipment_status_transitions
        where from_status = v_current and to_status = p_to_status limit 1),
      v_current, p_to_status;
  end if;

  update public.shipments
     set current_status = p_to_status
   where id = p_shipment_id;

  insert into public.shipment_events (
    shipment_id, status, location, description, event_timestamp, created_by
  ) values (
    p_shipment_id, p_to_status, p_location, p_description, now(), auth.uid()
  )
  on conflict (shipment_id, status, event_timestamp) do nothing
  returning * into v_event;

  if v_event is null then
    -- الحدث موجود مسبقاً (إعادة محاولة) → نعيده كما هو (idempotent)
    select * into v_event
    from public.shipment_events
    where shipment_id = p_shipment_id and status = p_to_status
    order by event_timestamp desc
    limit 1;
  end if;

  return v_event;
end;
$$;

comment on function public.transition_shipment(uuid, text, text, text, text) is
  'Staff-only, locked, validated, idempotent status transition / انتقال حالة آمن ومتتابع';

-- ---------------------------------------------------------------------------
-- J) approve_claim() — اعتماد مطالبة "طردي عندكم"
--    صلاحيات: super_admin | operations_manager | customer_support
--    حماية تعدد المطالبات: لا شحنة لها مطالبتان معتمدتان.
--    التسليم: إن كانت الشحنة غير مُسندة → نسند للعميل صاحب المطالبة؛
--    وإن كانت مسندة لعميل آخر → رفض (لا نسرق شحنات الآخرين).
--    التدقيق والإشعار يحدثان داخل نفس المعاملة (transaccional).
-- ---------------------------------------------------------------------------
create or replace function public.approve_claim(
  p_claim_id   uuid,
  p_shipment_id uuid,
  p_note       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim        public.shipment_claim_requests;
  v_ship_customer uuid;
begin
  if not (public.has_role('super_admin')
       or public.has_role('operations_manager')
       or public.has_role('customer_support')) then
    raise exception 'not authorized';
  end if;

  select * into v_claim
  from public.shipment_claim_requests
  where id = p_claim_id
  for update;

  if not found then
    raise exception 'claim not found: %', p_claim_id;
  end if;
  if v_claim.request_status <> 'pending' then
    raise exception 'claim is not pending (current: %)', v_claim.request_status;
  end if;

  select customer_id into v_ship_customer
  from public.shipments
  where id = p_shipment_id
  for update;

  if not found then
    raise exception 'shipment not found: %', p_shipment_id;
  end if;

  if exists (
    select 1 from public.shipment_claim_requests c
    where c.shipment_id = p_shipment_id
      and c.request_status = 'approved'
      and c.id <> p_claim_id
  ) then
    raise exception 'shipment % already has an approved claim', p_shipment_id;
  end if;

  if v_ship_customer is not null and v_ship_customer <> v_claim.customer_id then
    raise exception 'shipment % already belongs to another customer', p_shipment_id;
  end if;

  -- إسناد الشحنة غير المُسندة فقط (unassigned)
  update public.shipments
     set customer_id = v_claim.customer_id
   where id = p_shipment_id and customer_id is null;

  update public.shipment_claim_requests
     set shipment_id    = p_shipment_id,
         request_status = 'approved',
         reviewed_by    = auth.uid(),
         reviewed_at    = now(),
         review_note    = p_note
   where id = p_claim_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'claim.approved', 'shipment_claim_requests', p_claim_id,
    jsonb_build_object('shipment_id', p_shipment_id, 'note', p_note)
  );

  insert into public.notifications (customer_id, title, message, notification_type, link)
  values (
    v_claim.customer_id,
    'تم اعتماد مطالبتك / Claim approved',
    coalesce('تم ربط طلبك بالشحنة ' || p_shipment_id::text ||
             coalesce('. ' || p_note, ''), 'تم اعتماد مطالبتك.'),
    'claim_approved',
    '/claims'
  );
end;
$$;

comment on function public.approve_claim(uuid, uuid, text) is
  'Approve a claim, assign shipment, audit + notify (one transaction) / اعتماد مطالبة مع التدقيق والإشعار';

-- ---------------------------------------------------------------------------
-- K) reject_claim() — رفض مطالبة
-- ---------------------------------------------------------------------------
create or replace function public.reject_claim(p_claim_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.shipment_claim_requests;
begin
  if not (public.has_role('super_admin')
       or public.has_role('operations_manager')
       or public.has_role('customer_support')) then
    raise exception 'not authorized';
  end if;

  select * into v_claim
  from public.shipment_claim_requests
  where id = p_claim_id
  for update;

  if not found then
    raise exception 'claim not found: %', p_claim_id;
  end if;
  if v_claim.request_status <> 'pending' then
    raise exception 'claim is not pending (current: %)', v_claim.request_status;
  end if;

  update public.shipment_claim_requests
     set request_status = 'rejected',
         reviewed_by    = auth.uid(),
         reviewed_at    = now(),
         review_note    = p_note
   where id = p_claim_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'claim.rejected', 'shipment_claim_requests', p_claim_id,
          jsonb_build_object('note', p_note));

  insert into public.notifications (customer_id, title, message, notification_type, link)
  values (
    v_claim.customer_id,
    'تم رفض مطالبتك / Claim rejected',
    coalesce(p_note, 'نعتذر، تم رفض المطالبة. تواصل مع الدعم للمزيد.'),
    'claim_rejected',
    '/claims'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- L) record_payment() — تسجيل دفعة مالية (تحقق من الدور ثم إعادة احتساب الحالة)
--    ⚠️ لا تستقبل ولا تخزّن رقم بطاقة أو CVV — الدفع عبر مزوّد خارجي،
--    نحن نسجّل transaction_reference فقط.
--    الحالة المالية للشحنة: paid إذا sum(verified) >= shipping_fee،
--    وإلا partially_paid إذا كان هناك ما تم التحقق منه، وإلا unpaid.
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(
  p_shipment_id uuid,
  p_amount       numeric,
  p_method       text,
  p_reference    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee     numeric(12,2);
  v_paid    numeric(12,2);
  v_status  text;
begin
  if not (public.has_role('super_admin')
       or public.has_role('finance_staff')
       or public.has_role('operations_manager')) then
    raise exception 'not authorized';
  end if;

  select shipping_fee into v_fee
  from public.shipments
  where id = p_shipment_id
  for update;

  if not found then
    raise exception 'shipment not found: %', p_shipment_id;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  insert into public.shipment_payments (
    shipment_id, amount, currency, payment_method, payment_status,
    transaction_reference, recorded_at, recorded_by
  ) values (
    p_shipment_id, p_amount, 'SAR', p_method, 'verified',   -- يسجّله موظف مالي موثّق
    p_reference, now(), auth.uid()
  );

  select coalesce(sum(amount), 0) into v_paid
  from public.shipment_payments
  where shipment_id = p_shipment_id and payment_status = 'verified';

  if v_fee is not null and v_paid >= v_fee then
    v_status := 'paid';
  elsif v_paid > 0 then
    v_status := 'partially_paid';
  else
    v_status := 'unpaid';
  end if;

  update public.shipments set payment_status = v_status where id = p_shipment_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'payment.recorded', 'shipments', p_shipment_id,
          jsonb_build_object('amount', p_amount, 'method', p_method,
                             'reference', p_reference, 'payment_status', v_status));
end;
$$;

comment on function public.record_payment(uuid, numeric, text, text) is
  'Finance-only payment recording; NEVER accepts card number or CVV / تسجيل دفعة — بدون بطاقات أو CVV';

-- ---------------------------------------------------------------------------
-- M) enforce_profile_self_update() — مشغّل BEFORE UPDATE على profiles
--    العميل لا يستطيع تغيير customer_number أو account_status أو created_at.
--    الموظفون (super_admin / operations_manager) مسموح لهم.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.has_role('super_admin') or public.has_role('operations_manager') then
    return new;  -- الإدارة تملك تعديل الحقول المحمية
  end if;

  if new.customer_number is distinct from old.customer_number then
    raise exception 'customer_number is read-only for customers';
  end if;
  if new.account_status is distinct from old.account_status then
    raise exception 'account_status is read-only for customers';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at is read-only';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_profile_self_update on public.profiles;
create trigger enforce_profile_self_update
  before update on public.profiles
  for each row execute function public.enforce_profile_self_update();

-- ---------------------------------------------------------------------------
-- N) enforce_shipment_ownership_update() — حماية ملكية الشحنة
--    RLS لا يقيّد الأعمدة، لذا نمنع عمودي customer_id و tracking_number من
--    التعديل إلا للإدارة/العمليات. warehouse_staff تملك UPDATE على الشحنات
--    (لتحديث الحالات والتفاصيل) لكنها لا تعيد توجيه شحنات الآخرين.
--    • auth.uid() is null → سياق خادم موثوق (service_role) → لا نعترض.
--    • customer_support لا تملك UPDATE مباشر على الشحنات في RLS، لكنها تعتمد
--      المطالبات عبر approve_claim() (definer) التي تستدعي هذا العمود — وسماحنا
--      لدورها هنا ضروري لذلك.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_shipment_ownership_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;   -- سياق خادم (service_role / SQL Editor) — موثوق
  end if;

  if new.customer_id is distinct from old.customer_id
     and not (public.has_role('super_admin')
           or public.has_role('operations_manager')
           or public.has_role('customer_support')) then
    raise exception 'shipment ownership can only be changed by operations';
  end if;

  if new.tracking_number is distinct from old.tracking_number
     and not (public.has_role('super_admin')
           or public.has_role('operations_manager')) then
    raise exception 'tracking_number is read-only for this role';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_shipment_ownership_update on public.shipments;
create trigger enforce_shipment_ownership_update
  before update on public.shipments
  for each row execute function public.enforce_shipment_ownership_update();

-- ===========================================================================
-- صلاحيات تنفيذ الدوال / EXECUTE privileges
-- القاعدة: لا شيء متاح لـ anon أو public. كل دالة SECURITY DEFINER تُسحب من
-- PUBLIC ثم تُمنح للأدوار التي تحتاجها فقط. دوال التوليد الداخلية تبقى
-- للاستخدام الداخلي (المشغّلات/الدوال) وservice_role فقط.
-- ===========================================================================

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.enforce_profile_self_update() from public, anon, authenticated;
revoke all on function public.enforce_shipment_ownership_update() from public, anon, authenticated;

revoke all on function public.has_role(text) from public, anon;
grant  execute on function public.has_role(text) to authenticated, service_role;

revoke all on function public.is_staff() from public, anon;
grant  execute on function public.is_staff() to authenticated, service_role;

revoke all on function public.next_seq(text, int) from public, anon, authenticated;
grant  execute on function public.next_seq(text, int) to service_role;

revoke all on function public.gen_customer_number() from public, anon, authenticated;
revoke all on function public.gen_tracking_number() from public, anon, authenticated;
revoke all on function public.gen_package_reference() from public, anon, authenticated;
revoke all on function public.gen_ticket_number() from public, anon, authenticated;
grant  execute on function public.gen_customer_number() to service_role;
grant  execute on function public.gen_tracking_number() to service_role;
grant  execute on function public.gen_package_reference() to service_role;
grant  execute on function public.gen_ticket_number() to service_role;

revoke all on function public.repair_missing_profiles() from public, anon, authenticated;
grant  execute on function public.repair_missing_profiles() to service_role;

-- دوال الموظفين: authenticated فقط (التحقق الداخلي يحدد الدور الدقيق)
revoke all on function public.transition_shipment(uuid, text, text, text, text) from public, anon;
grant  execute on function public.transition_shipment(uuid, text, text, text, text) to authenticated, service_role;

revoke all on function public.approve_claim(uuid, uuid, text) from public, anon;
grant  execute on function public.approve_claim(uuid, uuid, text) to authenticated, service_role;

revoke all on function public.reject_claim(uuid, text) from public, anon;
grant  execute on function public.reject_claim(uuid, text) to authenticated, service_role;

revoke all on function public.record_payment(uuid, numeric, text, text) from public, anon;
grant  execute on function public.record_payment(uuid, numeric, text, text) to authenticated, service_role;

-- handle_new_user() يُستدعى بواسطة مشغّل على auth.users — لا حاجة لمنحه لـ anon
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ============================================================================
-- END OF 0002_functions.sql — 16 دالة + 10 مشغّلات (triggers)
-- (الدالة السابعة عشرة public.promote_to_super_admin() تُزرع في 0004_seed.sql)
-- ============================================================================


-- ============================================================================
-- PART 4 — ROW LEVEL SECURITY (أمان على مستوى الصفوف)
-- ============================================================================
-- ============================================================================
-- 0003_rls.sql
-- World Associates Shipping CO — تفعيل RLS وجميع السياسات (Access Matrix)
--
-- ⚠️ نموذج الدفاع الافتراضي / Default-deny:
--    ENABLE ROW LEVEL SECURITY بدون أي سياسة = رفض كامل. كل سماح أدناه صريح.
--
-- مصفوفة الصلاحيات / Access matrix (ملخص):
--   • العميل (authenticated بدون صف في user_roles):
--       - profiles: قراءة/تحديث صفّه فقط (الحقول المحمية ممنوعة عبر مشغّل في 0002).
--       - customer_addresses: CRUD كامل على عناوينه.
--       - shipments: قراءة شحناته فقط (لا إنشاء/تعديل/حذف).
--       - shipment_events / shipment_payments: قراءة عبر الشحنة المملوكة.
--       - shipment_packages: قراءة طروده أو طرود شحناته.
--       - claims: إنشاء/قراءة مطالباته + إلغاء (cancelled) فقط.
--       - notifications: قراءة وإعلان كمقروء.
--       - support_tickets: إنشاء وقراءة تذاكره (لا تعديل الحالة).
--       - user_roles: قراءة أدواره فقط (لا إدراج → يمنع self-granting).
--       - status catalog/transitions/site_settings: قراءة فقط.
--       - documents/consolidation: قراءة/إدارة ما يملكه.
--       - audit_logs / sequences: لا وصول إطلاقاً.
--   • الموظفون (حسب الدور):
--       super_admin        : كل شيء.
--       operations_manager : قراءة واسعة + شحنات/مطالبات/تجميع/حالات.
--       warehouse_staff    : طرود + حالات مستودع + تسجيل الوصول.
--       customer_support   : قراءة عملاء/شحنات/مطالبات/تذاكر + مراجعة المطالبات.
--       finance_staff      : قراءة شحنات/عملاء + كتابة المدفوعات (لا يغيّر الملكية/الحالة).
--
-- لماذا has_role()/is_staff() آمنة؟ → SECURITY DEFINER في 0002 تتجاوز RLS على
-- user_roles فلا يحدث تقييم تعاكسي (recursive policy) عند فحص دور المستخدم.
-- ============================================================================

alter table public.profiles                enable row level security;
alter table public.customer_addresses      enable row level security;
alter table public.user_roles              enable row level security;
alter table public.shipments               enable row level security;
alter table public.shipment_events         enable row level security;
alter table public.shipment_packages       enable row level security;
alter table public.shipment_claim_requests enable row level security;
alter table public.shipment_payments       enable row level security;
alter table public.notifications           enable row level security;
alter table public.support_tickets         enable row level security;
alter table public.audit_logs              enable row level security;
alter table public.shipment_status_catalog enable row level security;
alter table public.shipment_status_transitions enable row level security;
alter table public.sequences               enable row level security;
alter table public.consolidation_groups    enable row level security;
alter table public.consolidation_items     enable row level security;
alter table public.documents               enable row level security;
alter table public.site_settings           enable row level security;

-- ملاحظة دفاعية: جدول sequences لا يملك أي سياسة → رفض كامل للجميع بما فيهم
-- authenticated (لا نستخدم FORCE حتى تبقى دوال next_seq() SECURITY DEFINER
-- — المالك postgres — قادرة على المرور؛ الافتراضي "لا سياسة = رفض" يكفي).

-- ============================================================================
-- profiles
-- ============================================================================
-- قراءة: مالي الصفّي أو أي موظف (للدعم/العمليات/المستودع/المالية).
create policy "profiles_select_own_or_staff"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

-- تحديث: العميل صفّه فقط (الحقول المحمية محمية إضافياً بـ
-- enforce_profile_self_update في 0002)، أو الإدارة.
create policy "profiles_update_own_or_management"
  on public.profiles for update to authenticated
  using (
    id = auth.uid()
    or public.has_role('super_admin')
    or public.has_role('operations_manager')
  )
  with check (
    id = auth.uid()
    or public.has_role('super_admin')
    or public.has_role('operations_manager')
  );

-- الإنشاء يتم عبر مشغّل handle_new_user (definer) — سياسة إدراج للإدارة فقط.
create policy "profiles_insert_super_admin"
  on public.profiles for insert to authenticated
  with check (public.has_role('super_admin'));

create policy "profiles_delete_super_admin"
  on public.profiles for delete to authenticated
  using (public.has_role('super_admin'));

-- ============================================================================
-- customer_addresses — العميل مالك كامل لعناوينه
-- ============================================================================
create policy "addresses_select_own_or_staff"
  on public.customer_addresses for select to authenticated
  using (customer_id = auth.uid() or public.is_staff());

create policy "addresses_insert_own"
  on public.customer_addresses for insert to authenticated
  with check (
    customer_id = auth.uid()
    or public.has_role('operations_manager')
    or public.has_role('customer_support')
    or public.has_role('warehouse_staff')
  );

create policy "addresses_update_own_or_ops"
  on public.customer_addresses for update to authenticated
  using (
    customer_id = auth.uid()
    or public.has_role('operations_manager')
    or public.has_role('customer_support')
    or public.has_role('warehouse_staff')
  )
  with check (
    customer_id = auth.uid()
    or public.has_role('operations_manager')
    or public.has_role('customer_support')
    or public.has_role('warehouse_staff')
  );

create policy "addresses_delete_own_or_ops"
  on public.customer_addresses for delete to authenticated
  using (
    customer_id = auth.uid() or public.has_role('operations_manager')
  );

-- ============================================================================
-- user_roles — لا يُسمح للعميل بإدراج أدوار لنفسه (منع تصعيد الصلاحيات)
-- ============================================================================
create policy "user_roles_select_own_or_super_admin"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role('super_admin'));

create policy "user_roles_insert_super_admin"
  on public.user_roles for insert to authenticated
  with check (public.has_role('super_admin'));

create policy "user_roles_delete_super_admin"
  on public.user_roles for delete to authenticated
  using (public.has_role('super_admin'));

-- ============================================================================
-- shipments
-- ============================================================================
-- قراءة: العميل شحناته، أو أي موظف (matrix: كل الأدوار تقرأ الشحنات).
create policy "shipments_select_own_or_staff"
  on public.shipments for select to authenticated
  using (customer_id = auth.uid() or public.is_staff());

-- الإنشاء والملكية: العمليات/الإدارة فقط (العميل لا ينشئ شحنة بنفسه).
create policy "shipments_insert_ops"
  on public.shipments for insert to authenticated
  with check (
    public.has_role('super_admin') or public.has_role('operations_manager')
  );

-- التحديث: العمليات/الإدارة (المالية تستخدم record_payment عبر دالة منفصلة
-- ولا تملك UPDATE مباشر حتى لا تغيّر ملكية/حالة الشحنة).
create policy "shipments_update_ops_or_warehouse"
  on public.shipments for update to authenticated
  using (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('warehouse_staff')
  )
  with check (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('warehouse_staff')
  );

-- الحذف: الإدارة العليا فقط (ON DELETE RESTRICT يحمي سجلات الأحداث/المدفوعات).
create policy "shipments_delete_super_admin"
  on public.shipments for delete to authenticated
  using (public.has_role('super_admin'));

-- ============================================================================
-- shipment_events — قراءة عبر الشحنة المملوكة؛ الإدراج للموظفين
-- ============================================================================
create policy "events_select_own_shipment_or_staff"
  on public.shipment_events for select to authenticated
  using (
    exists (
      select 1 from public.shipments s
      where s.id = shipment_events.shipment_id and s.customer_id = auth.uid()
    )
    or public.is_staff()
  );

create policy "events_insert_staff"
  on public.shipment_events for insert to authenticated
  with check (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('warehouse_staff')
  );

create policy "events_delete_super_admin"
  on public.shipment_events for delete to authenticated
  using (public.has_role('super_admin'));

-- ============================================================================
-- shipment_packages
-- ============================================================================
create policy "packages_select_own_or_staff"
  on public.shipment_packages for select to authenticated
  using (
    customer_id = auth.uid()
    or exists (
      select 1 from public.shipments s
      where s.id = shipment_packages.shipment_id and s.customer_id = auth.uid()
    )
    or public.is_staff()
  );

create policy "packages_insert_warehouse"
  on public.shipment_packages for insert to authenticated
  with check (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('warehouse_staff')
  );

create policy "packages_update_warehouse"
  on public.shipment_packages for update to authenticated
  using (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('warehouse_staff')
  )
  with check (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('warehouse_staff')
  );

create policy "packages_delete_super_admin"
  on public.shipment_packages for delete to authenticated
  using (public.has_role('super_admin'));

-- ============================================================================
-- shipment_claim_requests
-- ============================================================================
create policy "claims_select_own_or_staff"
  on public.shipment_claim_requests for select to authenticated
  using (customer_id = auth.uid() or public.is_staff());

create policy "claims_insert_own_or_staff"
  on public.shipment_claim_requests for insert to authenticated
  with check (customer_id = auth.uid() or public.is_staff());

-- العميل: إلغاء مطالبته فقط (pending → cancelled)؛ لا يلمس حقول المراجعة.
create policy "claims_update_customer_cancel_only"
  on public.shipment_claim_requests for update to authenticated
  using (customer_id = auth.uid() and request_status = 'pending')
  with check (customer_id = auth.uid() and request_status = 'cancelled');

-- المراجعة: أدوار المطالبات (approve_claim/reject_claim تتحقق داخلياً أيضاً).
create policy "claims_update_review_by_role"
  on public.shipment_claim_requests for update to authenticated
  using (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('customer_support')
  )
  with check (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('customer_support')
  );

-- ============================================================================
-- shipment_payments — قراءة عبر الشحنة؛ الكتابة للمالية/العمليات
-- ============================================================================
create policy "payments_select_own_shipment_or_finance"
  on public.shipment_payments for select to authenticated
  using (
    exists (
      select 1 from public.shipments s
      where s.id = shipment_payments.shipment_id and s.customer_id = auth.uid()
    )
    or public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('finance_staff')
  );

create policy "payments_insert_finance"
  on public.shipment_payments for insert to authenticated
  with check (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('finance_staff')
  );

create policy "payments_update_finance"
  on public.shipment_payments for update to authenticated
  using (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('finance_staff')
  )
  with check (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('finance_staff')
  );

create policy "payments_delete_super_admin"
  on public.shipment_payments for delete to authenticated
  using (public.has_role('super_admin'));

-- ============================================================================
-- notifications
-- ============================================================================
create policy "notifications_select_own_or_staff"
  on public.notifications for select to authenticated
  using (customer_id = auth.uid() or public.is_staff());

-- إشعار العميل: يحق له تعديل صفّه (الاستخدام المقصود: تعيين read_at عند القراءة).
create policy "notifications_update_own_read"
  on public.notifications for update to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

create policy "notifications_insert_staff"
  on public.notifications for insert to authenticated
  with check (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('customer_support')
  );

create policy "notifications_delete_own"
  on public.notifications for delete to authenticated
  using (customer_id = auth.uid() or public.has_role('super_admin'));

-- ============================================================================
-- support_tickets — العميل يفتح ويقرأ؛ الموظفون يردّون ويغيّرون الحالة
-- ============================================================================
create policy "tickets_select_own_or_staff"
  on public.support_tickets for select to authenticated
  using (customer_id = auth.uid() or public.is_staff());

create policy "tickets_insert_own"
  on public.support_tickets for insert to authenticated
  with check (customer_id = auth.uid());

create policy "tickets_update_staff"
  on public.support_tickets for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "tickets_delete_super_admin"
  on public.support_tickets for delete to authenticated
  using (public.has_role('super_admin'));

-- ============================================================================
-- audit_logs — لا وصول للعملاء إطلاقاً؛ قراءة للإدارة/العمليات، إدراج للموظفين
-- ============================================================================
create policy "audit_select_admin_or_ops"
  on public.audit_logs for select to authenticated
  using (public.has_role('super_admin') or public.has_role('operations_manager'));

create policy "audit_insert_staff"
  on public.audit_logs for insert to authenticated
  with check (public.is_staff());

-- ============================================================================
-- shipment_status_catalog / shipment_status_transitions — قراءة للجميع، كتابة للإدارة
-- ============================================================================
create policy "status_catalog_select_authenticated"
  on public.shipment_status_catalog for select to authenticated using (true);

create policy "status_catalog_insert_super_admin"
  on public.shipment_status_catalog for insert to authenticated
  with check (public.has_role('super_admin'));

create policy "status_catalog_update_super_admin"
  on public.shipment_status_catalog for update to authenticated
  using (public.has_role('super_admin')) with check (public.has_role('super_admin'));

create policy "status_catalog_delete_super_admin"
  on public.shipment_status_catalog for delete to authenticated
  using (public.has_role('super_admin'));

create policy "status_transitions_select_authenticated"
  on public.shipment_status_transitions for select to authenticated using (true);

create policy "status_transitions_insert_super_admin"
  on public.shipment_status_transitions for insert to authenticated
  with check (public.has_role('super_admin'));

create policy "status_transitions_update_super_admin"
  on public.shipment_status_transitions for update to authenticated
  using (public.has_role('super_admin')) with check (public.has_role('super_admin'));

create policy "status_transitions_delete_super_admin"
  on public.shipment_status_transitions for delete to authenticated
  using (public.has_role('super_admin'));

-- ============================================================================
-- sequences — لا سياسة إطلاقاً (رفض كامل). العدّاد يُستدعى فقط عبر
-- next_seq() SECURITY DEFINER — لا يمكن للعملاء القراءة أو التعديل.
-- ============================================================================

-- ============================================================================
-- consolidation_groups / consolidation_items
-- ============================================================================
create policy "consolidation_groups_select_own_or_staff"
  on public.consolidation_groups for select to authenticated
  using (customer_id = auth.uid() or public.is_staff());

create policy "consolidation_groups_insert_ops"
  on public.consolidation_groups for insert to authenticated
  with check (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('warehouse_staff')
  );

create policy "consolidation_groups_update_ops"
  on public.consolidation_groups for update to authenticated
  using (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('warehouse_staff')
  )
  with check (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('warehouse_staff')
  );

create policy "consolidation_groups_delete_super_admin"
  on public.consolidation_groups for delete to authenticated
  using (public.has_role('super_admin'));

create policy "consolidation_items_select_own_group_or_staff"
  on public.consolidation_items for select to authenticated
  using (
    exists (
      select 1 from public.consolidation_groups g
      where g.id = consolidation_items.group_id and g.customer_id = auth.uid()
    )
    or public.is_staff()
  );

create policy "consolidation_items_insert_ops"
  on public.consolidation_items for insert to authenticated
  with check (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('warehouse_staff')
  );

create policy "consolidation_items_delete_ops"
  on public.consolidation_items for delete to authenticated
  using (
    public.has_role('super_admin')
    or public.has_role('operations_manager')
    or public.has_role('warehouse_staff')
  );

-- ============================================================================
-- documents — ملكية العميل عبر owner_id؛ الوصول الفعلي للملف عبر signed URL
-- من bucket خاص (لا يخص RLS، لكننا لا نُظهر المسار إلا لأصحابه/الموظفين).
-- ============================================================================
create policy "documents_select_own_or_staff"
  on public.documents for select to authenticated
  using (owner_id = auth.uid() or public.is_staff());

create policy "documents_insert_own_or_staff"
  on public.documents for insert to authenticated
  with check (owner_id = auth.uid() or public.is_staff());

create policy "documents_delete_own_or_admin"
  on public.documents for delete to authenticated
  using (owner_id = auth.uid() or public.has_role('super_admin'));

-- ============================================================================
-- site_settings — قراءة للجميع المصادقين، تعديل للإدارة فقط
-- ============================================================================
create policy "site_settings_select_authenticated"
  on public.site_settings for select to authenticated using (true);

create policy "site_settings_update_super_admin"
  on public.site_settings for update to authenticated
  using (public.has_role('super_admin')) with check (public.has_role('super_admin'));

create policy "site_settings_insert_super_admin"
  on public.site_settings for insert to authenticated
  with check (public.has_role('super_admin'));

-- ============================================================================
-- END OF 0003_rls.sql — 18 جدولاً مفعّل RLS + 61 سياسة
-- ============================================================================


-- ============================================================================
-- PART 5 — SEED (الحالات والانتقالات والعدادات والإعدادات)
-- ============================================================================
-- ============================================================================
-- 0004_seed.sql
-- World Associates Shipping CO — بيانات مرجعية وتهيئة أولية (Seed / Reference)
--
-- • idempotent: كل الإدراجات ON CONFLICT DO NOTHING → يمكن تشغيل الملف مجدداً.
-- • لا بيانات وهمية: لا عملاء وهميون ولا شحنات ولا مدفوعات.
-- • الحالة الافتراضية: current_status تشير لكتالوج الحالات (18 حالة).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) كتالوج الحالات الـ18 (18 shipment statuses)
--    group_name: pending (ما قبل الشحن/المعالجة) | in_transit (بعد المغادرة)
--                | exception | completed
-- ---------------------------------------------------------------------------
insert into public.shipment_status_catalog
  (code, label_ar, label_en, group_name, sort_order, is_exception, is_terminal)
values
  ('created',                'تم الإنشاء',                 'Created',                'pending',     1,  false, false),
  ('awaiting_package',       'بانتظار الطرد',               'Awaiting package',       'pending',     2,  false, false),
  ('received_at_warehouse',  'تم استلام الطرد في المستودع', 'Received at warehouse',  'pending',     3,  false, false),
  ('registered',             'تم تسجيل الطرد',              'Registered',             'pending',     4,  false, false),
  ('ready_for_consolidation','جاهز للتجميع',               'Ready for consolidation','pending',     5,  false, false),
  ('consolidating',          'قيد التجميع',                 'Consolidating',          'pending',     6,  false, false),
  ('ready_to_ship',          'جاهز للشحن',                 'Ready to ship',          'pending',     7,  false, false),
  ('awaiting_payment',       'بانتظار الدفع',               'Awaiting payment',       'pending',     8,  false, false),
  ('paid',                   'تم الدفع',                    'Paid',                   'pending',     9,  false, false),
  ('shipped_from_china',     'تم الشحن من الصين',           'Shipped from China',     'in_transit', 10,  false, false),
  ('arrived_in_saudi_arabia','الوصول إلى السعودية',        'Arrived in Saudi Arabia','in_transit', 11,  false, false),
  ('customs_clearance',      'التخليص الجمركي',             'Customs clearance',      'in_transit', 12,  false, false),
  ('handed_to_local_carrier','تسليم لشركة الشحن المحلية',  'Handed to local carrier','in_transit', 13,  false, false),
  ('out_for_delivery',       'خرج للتوصيل',                 'Out for delivery',       'in_transit', 14,  false, false),
  ('delivered',              'تم التسليم',                  'Delivered',              'completed', 15,  false, true),
  ('delayed',                'تأخر',                       'Delayed',                'exception', 16,  true,  false),
  ('delivery_failed',        'فشل التوصيل',                 'Delivery failed',        'exception', 17,  true,  false),
  ('cancelled',              'تم الإلغاء',                  'Cancelled',              'exception', 18,  false, true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2) انتقالات الحالات المسموح بها (state machine)
--    • السلسلة الأساسية: created → … → delivered (14 انتقالاً).
--    • فروع الاستثناء: أي حالة غير نهائية → delayed؛ out_for_delivery →
--      delivery_failed؛ delivery_failed → handed_to_local_carrier (إعادة محاولة).
--    • الاستئناف من delayed إلى النقاط المنطقية في السلسلة.
--    • الإلغاء قبل المغادرة فقط (pre-dispatch فقط) — لا إلغاء بعد shipped_from_china
--      حفاظاً على سجل الشحن التاريخي واتفاقيات الناقل.
--    • ON CONFLICT (from_status,to_status) DO NOTHING → idempotent.
-- ---------------------------------------------------------------------------
insert into public.shipment_status_transitions (from_status, to_status) values
  -- السلسلة الأساسية / main happy path
  ('created',                 'awaiting_package'),
  ('awaiting_package',        'received_at_warehouse'),
  ('received_at_warehouse',   'registered'),
  ('registered',              'ready_for_consolidation'),
  ('ready_for_consolidation', 'consolidating'),
  ('consolidating',           'ready_to_ship'),
  ('ready_to_ship',           'awaiting_payment'),
  ('awaiting_payment',        'paid'),
  ('paid',                    'shipped_from_china'),
  ('shipped_from_china',      'arrived_in_saudi_arabia'),
  ('arrived_in_saudi_arabia', 'customs_clearance'),
  ('customs_clearance',       'handed_to_local_carrier'),
  ('handed_to_local_carrier', 'out_for_delivery'),
  ('out_for_delivery',        'delivered'),

  -- أي حالة غير نهائية (ما عدا delayed) → delayed
  ('created',                 'delayed'),
  ('awaiting_package',        'delayed'),
  ('received_at_warehouse',   'delayed'),
  ('registered',              'delayed'),
  ('ready_for_consolidation', 'delayed'),
  ('consolidating',           'delayed'),
  ('ready_to_ship',           'delayed'),
  ('awaiting_payment',        'delayed'),
  ('paid',                    'delayed'),
  ('shipped_from_china',      'delayed'),
  ('arrived_in_saudi_arabia', 'delayed'),
  ('customs_clearance',       'delayed'),
  ('handed_to_local_carrier', 'delayed'),
  ('out_for_delivery',        'delayed'),
  ('delivery_failed',         'delayed'),

  -- الاستئناف بعد التأخر / resume after delay
  ('delayed', 'shipped_from_china'),
  ('delayed', 'arrived_in_saudi_arabia'),
  ('delayed', 'customs_clearance'),
  ('delayed', 'handed_to_local_carrier'),
  ('delayed', 'out_for_delivery'),
  ('delayed', 'delivered'),

  -- فشل التوصيل وإعادة المحاولة
  ('out_for_delivery',        'delivery_failed'),
  ('delivery_failed',         'handed_to_local_carrier'),

  -- الإلغاء قبل المغادرة فقط / pre-dispatch cancellation only
  ('created',                 'cancelled'),
  ('awaiting_package',        'cancelled'),
  ('received_at_warehouse',   'cancelled'),
  ('registered',              'cancelled'),
  ('ready_for_consolidation', 'cancelled'),
  ('consolidating',           'cancelled'),
  ('ready_to_ship',           'cancelled'),
  ('awaiting_payment',        'cancelled'),
  ('paid',                    'cancelled')
on conflict (from_status, to_status) do nothing;

-- ---------------------------------------------------------------------------
-- 3) العدّاد: أول عميل يحصل على WA-100001 (last_value يبدأ من 100000)
--    ملاحظة: لا نزرع أرقام تتبع — gen_tracking_number() تبدأ من 1 تلقائياً
--    عند أول استخدام لكل سنة.
-- ---------------------------------------------------------------------------
insert into public.sequences (name, year, last_value, prefix)
values ('customer_number', 0, 100000, 'WA-')
on conflict (name, year) do nothing;

-- ---------------------------------------------------------------------------
-- 4) إعدادات الموقع (قيم مؤقتة placeholders — عدّلها من لوحة الإدارة)
-- ---------------------------------------------------------------------------
insert into public.site_settings (key, value) values
  ('transit_days_guangzhou_riyadh', '{"days": 18, "mode": "air", "note": "placeholder — placeholder value, adjust via site settings"}'),
  ('company_name', '{"ar": "شركاء العالم للشحن", "en": "World Associates Shipping CO"}'),
  ('support_email', '"support@example.com"')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 5) ترقية أول مدير (bootstrap admin)
--    ⚠️ لا نُنشئ صفوف auth.users وهمية هنا. الخطوات للمشغّل:
--       (1) أنشئ حساب الإدارة من Supabase Dashboard → Authentication → Users
--           (أو عبر التطبيق)، ببريد وكلمة مرور حقيقيين.
--       (2) انسخ uid الخاص بذلك المستخدم.
--       (3) نفّذ في SQL Editor (يشتغل بصلاحيات postgres):
--           select public.promote_to_super_admin('<AUTH_USER_UUID>');
--       (4) من هذا اللحظة له دور super_admin (ولو كان قبلها عميلاً عادياً).
--    الدالة محصورة على service_role/postgres فقط: سُحب EXECUTE من
--    anon و authenticated لمنع تصعيد الصلاحيات الذاتي (self-privilege escalation).
-- ---------------------------------------------------------------------------
create or replace function public.promote_to_super_admin(p_user_auth_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_auth_uid is null then
    raise exception 'p_user_auth_uid is required';
  end if;

  -- يجب أن يكون المستخدم موجوداً في auth.users
  if not exists (select 1 from auth.users where id = p_user_auth_uid) then
    raise exception 'user % not found in auth.users', p_user_auth_uid;
  end if;

  insert into public.user_roles (user_id, role)
  values (p_user_auth_uid, 'super_admin')
  on conflict (user_id, role) do nothing;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_user_auth_uid, 'user.promoted', 'user_roles', p_user_auth_uid,
          jsonb_build_object('role', 'super_admin'));
end;
$$;

comment on function public.promote_to_super_admin(uuid) is
  'Bootstrap helper: grant super_admin to an existing auth user / ترقية أول مدير — للتشغيل من SQL Editor فقط';

revoke all on function public.promote_to_super_admin(uuid) from public, anon, authenticated;
grant  execute on function public.promote_to_super_admin(uuid) to service_role;

-- ============================================================================
-- END OF 0004_seed.sql
-- ============================================================================


-- END OF SCRIPT — نهاية السكربت
