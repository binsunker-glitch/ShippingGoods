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
