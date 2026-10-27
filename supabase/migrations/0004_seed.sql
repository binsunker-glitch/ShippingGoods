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
