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
