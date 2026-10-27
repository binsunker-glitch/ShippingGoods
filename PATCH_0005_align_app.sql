-- ============================================================================
-- PATCH_0005_align_app.sql
-- World Associates Shipping CO — مواءمة القاعدة مع طبقة التطبيق (App alignment)
--
-- هذا الملف يُصوّب فجوات الأعمدة بين الهيكل الذي أنشأه RESET_AND_SETUP.sql
-- وما تحتاجه واجهة/منطق التطبيق (التي كانت مكتوبة على مخطط Drizzle أغنى).
--
-- قرارات التوافق / Alignment decisions:
--   • status_group مشتق في التطبيق (TypeScript) عبر STATUS_GROUP_BY_CODE —
--     لا نضيفه للقاعدة ولا نضع مشغّلات؛ الكتالوج هو مصدر الحقيقة الوحيد.
--   • نضيف فقط الأعمدة التي يقرأها/يكتبها التطبيق فعلاً.
--   • نوسّع قيود ENUM القليلة ليتّسع التطبيق والدوال معاً.
--
-- Idempotent: كل عبارة add column if not exists / drop+add constraint آمنة
-- لإعادة التشغيل. لا يحذف هذا الملف أي عمود ولا أي بيانات.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) shipment_status_catalog — يضيف is_active وrestricted (يستخدمهما getStatusCatalog
--    وأزرار الحالة للإدارة). "group" يشتق في TS لذا لا نضيفه.
-- ---------------------------------------------------------------------------
alter table public.shipment_status_catalog
  add column if not exists is_active  boolean not null default true;
alter table public.shipment_status_catalog
  add column if not exists restricted  boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2) customer_addresses — يضيف label (تسمية العنوان: المنزل/العمل/...)
-- ---------------------------------------------------------------------------
alter table public.customer_addresses
  add column if not exists label text;

-- ---------------------------------------------------------------------------
-- 3) shipments — أعمدة يقرأها/يكتبها التطبيق:
--    address_id, recipient_phone, estimated_delivery, consolidation_group_id, notes
--    + توسيع payment_status ليستوعب pending_verification وpartially_paid معاً.
-- ---------------------------------------------------------------------------
alter table public.shipments
  add column if not exists address_id uuid
    references public.customer_addresses (id) on delete set null;
alter table public.shipments
  add column if not exists recipient_phone text;
alter table public.shipments
  add column if not exists estimated_delivery boolean not null default false;
alter table public.shipments
  add column if not exists consolidation_group_id uuid;
alter table public.shipments
  add column if not exists notes text;

-- payment_status: الدالة record_payment() تنتج 'partially_paid'، والتطبيق
-- القديم يستخدم 'pending_verification'. نسمح بالقيمتين (و'paid'/'refunded'/'unpaid').
alter table public.shipments
  drop constraint if exists shipments_payment_status_check;
alter table public.shipments
  add constraint shipments_payment_status_check
  check (payment_status in ('unpaid','pending_verification','partially_paid','paid','refunded'));

-- ---------------------------------------------------------------------------
-- 4) shipment_events — يضيف source (.staff/system/customer)؛ status_group مشتق في TS.
-- ---------------------------------------------------------------------------
alter table public.shipment_events
  add column if not exists source text not null default 'staff';

-- ---------------------------------------------------------------------------
-- 5) shipment_packages — أعمدة المستودع التي كانت على جدول packages القديم:
--    description, received_by, notes.
-- ---------------------------------------------------------------------------
alter table public.shipment_packages
  add column if not exists description text;
alter table public.shipment_packages
  add column if not exists received_by uuid
    references public.profiles (id) on delete set null;
alter table public.shipment_packages
  add column if not exists notes text;

-- ---------------------------------------------------------------------------
-- 6) shipment_claim_requests — يضيف shipment_tracking_number (رقم الشحنة المُدخل
--    في نموذج المطالبة قبل ربطها فعلياً).
-- ---------------------------------------------------------------------------
alter table public.shipment_claim_requests
  add column if not exists shipment_tracking_number text;

-- ---------------------------------------------------------------------------
-- 7) shipment_payments — يضيف notes (ملاحظة موظف المالية).
-- ---------------------------------------------------------------------------
alter table public.shipment_payments
  add column if not exists notes text;

-- ---------------------------------------------------------------------------
-- 8) support_tickets — يضيف assigned_to, reply, replied_at (رد الدعم).
-- ---------------------------------------------------------------------------
alter table public.support_tickets
  add column if not exists assigned_to uuid
    references public.profiles (id) on delete set null;
alter table public.support_tickets
  add column if not exists reply text;
alter table public.support_tickets
  add column if not exists replied_at timestamptz;

-- ---------------------------------------------------------------------------
-- 9) audit_logs — يضيف actor_label (اسم الموظف المقروء؛ actor_id قد ينمح).
-- ---------------------------------------------------------------------------
alter table public.audit_logs
  add column if not exists actor_label text;

-- ---------------------------------------------------------------------------
-- 10) consolidation_groups — يضيف notes و shipment_id (المجموعة تتحول لشحنة).
-- ---------------------------------------------------------------------------
alter table public.consolidation_groups
  add column if not exists notes text;
alter table public.consolidation_groups
  add column if not exists shipment_id uuid
    references public.shipments (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 11) منح مولّدات الأرقام للمصادقين (تُستخدم في إجراءات التطبيق).
--    هذه الدوال مجرد عدّادات تُرجع رقماً منسّقاً؛ الحماية الحقيقية هي RLS على
--    جداول الإدراج. سماحها لـ authenticated ضروري ليُنشئ الموظف شحنة/طرداً
--    وتُنشئ خدمة الدعم تذكرة برقم صحيح.
-- ---------------------------------------------------------------------------
grant execute on function public.gen_tracking_number()   to authenticated;
grant execute on function public.gen_package_reference() to authenticated;
grant execute on function public.gen_ticket_number()     to authenticated;

-- ---------------------------------------------------------------------------
-- 12) الدوال المطلوبة من طبقة التطبيق (SECURITY DEFINER) — لم تكن موجودة.
-- ---------------------------------------------------------------------------

-- 12a) check_signup_conflicts — فحص تكرار الجوال/البريد قبل إنشاء الحساب.
--      يُستدعى من زائر (anon) قبل signUp؛ يقرأ فقط ولا يعدّل شيئاً.
create or replace function public.check_signup_conflicts(p_phone text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone boolean := false;
  v_email boolean := false;
begin
  if p_phone is not null and p_phone <> '' then
    select exists(select 1 from public.profiles where phone = p_phone) into v_phone;
  end if;
  if p_email is not null and p_email <> '' then
    select exists(select 1 from public.profiles where email = p_email::citext) into v_email;
    if not v_email then
      select exists(select 1 from auth.users where email = p_email::citext) into v_email;
    end if;
  end if;
  return jsonb_build_object('phone_taken', v_phone, 'email_taken', v_email);
end;
$$;
revoke all on function public.check_signup_conflicts(text, text) from public;
grant  execute on function public.check_signup_conflicts(text, text) to anon, authenticated;

-- 12b) lookup_login_email — تحويل (جوال | رقم عميل | بريد) إلى بريد الحساب
--      لتسجيل الدخول متعدد المعرّفات. محمي بتحديد محاولات في التطبيق.
create or replace function public.lookup_login_email(p_identifier text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if p_identifier is null or p_identifier = '' then
    return null;
  end if;
  if position('@' in p_identifier) > 0 then
    select email into v_email from auth.users where email = p_identifier::citext limit 1;
    return v_email;
  end if;
  select email into v_email from public.profiles where phone = p_identifier limit 1;
  if v_email is not null then return v_email; end if;
  select email into v_email from public.profiles where customer_number = p_identifier limit 1;
  return v_email;
end;
$$;
revoke all on function public.lookup_login_email(text) from public;
grant  execute on function public.lookup_login_email(text) to anon, authenticated;

-- 12c) log_audit — تدقيق؛ المالك دائماً auth.uid() (لا انتحال). الموظفون والعملاء
--      يتدقّقون أفعالهم؛ سجل التدقيق للإدارة فقط للقراءة.
create or replace function public.log_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, actor_label, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    (select full_name from public.profiles where id = auth.uid()),
    p_action, p_entity_type, p_entity_id, p_metadata
  );
end;
$$;
revoke all on function public.log_audit(text, text, uuid, jsonb) from public, anon;
grant  execute on function public.log_audit(text, text, uuid, jsonb) to authenticated;

-- 12d) create_notification — إشعار عميل؛ العميل يُشعر نفسه أو الموظف يُشعر أي عميل.
create or replace function public.create_notification(
  p_customer_id uuid,
  p_title text,
  p_message text,
  p_type text default 'info',
  p_link text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is distinct from p_customer_id and not public.is_staff() then
    raise exception 'not authorized';
  end if;
  insert into public.notifications (customer_id, title, message, notification_type, link)
  values (p_customer_id, p_title, p_message, coalesce(p_type, 'info'), p_link)
  returning id into v_id;
  return v_id::text;
end;
$$;
revoke all on function public.create_notification(uuid, text, text, text, text) from public, anon;
grant  execute on function public.create_notification(uuid, text, text, text, text) to authenticated;

-- 12e) handle_new_user — يُجهّز الملف + العنوان الافتراضي الأول من بيانات التسجيل.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full text := coalesce(new.raw_user_meta_data->>'full_name', '');
  v_phone text := new.raw_user_meta_data->>'phone';
  v_city  text := coalesce(new.raw_user_meta_data->>'city', '');
begin
  begin
    insert into public.profiles (
      id, customer_number, full_name, phone, email, city, account_status
    ) values (
      new.id, public.gen_customer_number(), v_full, v_phone,
      coalesce(new.email, new.raw_user_meta_data->>'email'), v_city, 'active'
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'handle_new_user: profile provisioning failed for user %: %', new.id, sqlerrm;
  end;

  -- عنوان افتراضي أول إن قدّم النموذج شارعاً.
  if coalesce(new.raw_user_meta_data->>'street', '') <> '' then
    begin
      insert into public.customer_addresses (
        customer_id, recipient_name, phone, city, district, street,
        building_number, secondary_number, postal_code,
        national_address_short_code, address_details, is_default
      ) values (
        new.id, v_full, v_phone, v_city,
        nullif(new.raw_user_meta_data->>'district', ''),
        nullif(new.raw_user_meta_data->>'street', ''),
        nullif(new.raw_user_meta_data->>'building_number', ''),
        nullif(new.raw_user_meta_data->>'secondary_number', ''),
        nullif(new.raw_user_meta_data->>'postal_code', ''),
        nullif(new.raw_user_meta_data->>'national_address_short_code', ''),
        nullif(new.raw_user_meta_data->>'address_details', ''),
        true
      )
      on conflict do nothing;
    exception when others then
      raise warning 'handle_new_user: default address provisioning failed for user %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$$;

-- 12f) track_shipment_public — التتبع العام (زائر غير مصادق). يُرجع الحقول
--      الآمنة فقط (لا أسماء ولا عناوين ولا رسوم) مع تسميات عربية من الكتالوج.
--      بديل آمن لقراءة RLS التي تمنع الزائر من جدول shipments.
create or replace function public.track_shipment_public(p_tracking text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_ship public.shipments%rowtype;
  v_events jsonb;
  v_label text;
begin
  select * into v_ship
    from public.shipments
   where tracking_number = upper(trim(p_tracking));
  if not found then
    return null;
  end if;

  select label_ar into v_label
    from public.shipment_status_catalog where code = v_ship.current_status;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'status', e.status,
             'label_ar', (select c.label_ar from public.shipment_status_catalog c
                           where c.code = e.status),
             'is_exception', coalesce((select c.is_exception from public.shipment_status_catalog c
                           where c.code = e.status), false),
             'location', e.location,
             'description', e.description,
             'event_timestamp', e.event_timestamp
           ) order by e.event_timestamp asc), '[]'::jsonb)
    into v_events
    from public.shipment_events e
   where e.shipment_id = v_ship.id;

  return jsonb_build_object(
    'tracking_number', v_ship.tracking_number,
    'current_status', v_ship.current_status,
    'current_status_label', coalesce(v_label, v_ship.current_status),
    'estimated_delivery_date', v_ship.estimated_delivery_date,
    'estimated_delivery', v_ship.estimated_delivery,
    'destination_city', v_ship.destination_city,
    'events', v_events
  );
end;
$$;
revoke all on function public.track_shipment_public(text) from public;
grant  execute on function public.track_shipment_public(text) to anon, authenticated;

-- 12h) record_payment — نسخة موسّعة تستقبل p_notes (عمود notes أُضيف أعلاه).
--      منطق إعادة احتساب الحالة المالية مطابق للأصل.
create or replace function public.record_payment(
  p_shipment_id uuid,
  p_amount       numeric,
  p_method       text,
  p_reference    text,
  p_notes        text default null
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
    transaction_reference, notes, recorded_at, recorded_by
  ) values (
    p_shipment_id, p_amount, 'SAR', p_method, 'verified',
    p_reference, nullif(coalesce(p_notes, ''), ''), now(), auth.uid()
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

  insert into public.audit_logs (actor_id, actor_label, action, entity_type, entity_id, metadata)
  values (auth.uid(),
          (select full_name from public.profiles where id = auth.uid()),
          'payment.recorded', 'shipments', p_shipment_id,
          jsonb_build_object('amount', p_amount, 'method', p_method,
                             'reference', p_reference, 'payment_status', v_status));
end;
$$;

-- 12g) site_settings قراءة عامة — الصفحة الرئيسية (زائر) تعرض معلومات التواصل
--      والسياسات؛ القيم إعدادات معلنة عمداً وليست بيانات شخصية.
drop policy if exists "site_settings_select_authenticated" on public.site_settings;
create policy "site_settings_select_public"
  on public.site_settings for select
  to anon, authenticated
  using (true);

commit;

-- ---------------------------------------------------------------------------
-- تقرير sanity: عدد الأعمدة بعد الإضافة لكل جدول مُصوّب (يجب ألا يرجع أخطاء)
-- ---------------------------------------------------------------------------
select 'shipment_status_catalog' as tbl, count(*) as columns
  from information_schema.columns
  where table_schema='public' and table_name='shipment_status_catalog'
union all select 'customer_addresses', count(*)
  from information_schema.columns
  where table_schema='public' and table_name='customer_addresses'
union all select 'shipments', count(*)
  from information_schema.columns
  where table_schema='public' and table_name='shipments'
union all select 'shipment_events', count(*)
  from information_schema.columns
  where table_schema='public' and table_name='shipment_events'
union all select 'shipment_packages', count(*)
  from information_schema.columns
  where table_schema='public' and table_name='shipment_packages'
union all select 'shipment_claim_requests', count(*)
  from information_schema.columns
  where table_schema='public' and table_name='shipment_claim_requests'
union all select 'shipment_payments', count(*)
  from information_schema.columns
  where table_schema='public' and table_name='shipment_payments'
union all select 'support_tickets', count(*)
  from information_schema.columns
  where table_schema='public' and table_name='support_tickets'
union all select 'audit_logs', count(*)
  from information_schema.columns
  where table_schema='public' and table_name='audit_logs'
union all select 'consolidation_groups', count(*)
  from information_schema.columns
  where table_schema='public' and table_name='consolidation_groups'
order by tbl;
