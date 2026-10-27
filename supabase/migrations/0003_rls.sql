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
