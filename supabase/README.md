# Supabase Migrations — منصة «شركاء العالم للشحن»

**World Associates Shipping CO** — Guangzhou → Kingdom of Saudi Arabia ·
Currency **SAR** · Timezone **Asia/Riyadh** · UI language **Arabic (RTL)**.

يحتوي هذا المجلد على بنية قاعدة البيانات الكاملة للمنصة / This directory contains
the full PostgreSQL schema for the platform.

---

## 📁 الملفات / Files (بالترتيب — run in this exact order)

| # | File | المحتوى / Contents |
|---|------|--------------------|
| 1 | `migrations/0001_schema.sql` | الامتدادات، **18 جدولاً**، قيود (CHECK/FK)، الفهارس — extensions, 18 tables, constraints, indexes |
| 2 | `migrations/0002_functions.sql` | **16 دالة** (`SECURITY DEFINER` + `search_path` مقيّد) و**10 مشغّلات** — functions + triggers |
| 3 | `migrations/0003_rls.sql` | تفعيل RLS على كل الجداول + **61 سياسة** — enable RLS + 61 policies |
| 4 | `migrations/0004_seed.sql` | كتالوج الحالات (18)، الانتقالات، العدّادات، إعدادات الموقع، دالة ترقية المدير — seeds |

> جدول `auth.users` **غير موجود هنا** — هو موجود مسبقاً في كل مشروع Supabase
> (Supabase Auth). نحن نربط به فقط (`profiles.id → auth.users.id`).

---

## 🚀 طريقة التطبيق / How to apply

### الخيار أ — Supabase CLI (موصى به / recommended)

```bash
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>   # من Dashboard → Project Settings → General
supabase db push                                 # يرفع ملفات supabase/migrations/ بالترتيب
```

- `<YOUR_PROJECT_REF>` هو الجزء الأول من رابط مشروعك في Supabase Dashboard
  (كلمة المشروع Project ref) — **لا تخترق رابطاً وهمياً، خذه من لوحة التحكم**.
- عند التطوير المحلي: `supabase start` ثم `supabase db reset` (يطبّق الملفات الأربعة محلياً).

### الخيار ب — لصق الملفات في SQL Editor (بدون CLI)

1. افتح Supabase Dashboard → **SQL Editor**.
2. افتح كل ملف نصياً و**انسخ محتواه بالكامل** ثم **Run**، بالترتيب حصراً:
   `0001` ← `0002` ← `0003` ← `0004`.
3. لا تُشغّل ملفين في نفس جلسة واحدة، ولا تُردّ ترتيبها.

> ⚠️ كل الملفات idempotent بدرجة كبيرة (`IF NOT EXISTS`, `ON CONFLICT DO
> NOTHING`, `CREATE OR REPLACE`)، لكن الترتيب **إلزامي**: 0003 تعتمد على 0002،
> و0004 تعتمد على كل ما قبلها.

---

## 🔐 قرارات الأمان / Security decisions (مختصر)

- كل دالة `SECURITY DEFINER` تحدد `SET search_path = public` (منع search_path hijacking)
  وتُسحب منها `EXECUTE` من `PUBLIC`/`anon` وتُمنح لمن يحتاجها فقط.
- `has_role()` / `is_staff()` هما `SECURITY DEFINER` → يمنعان التقييم التعاكسي
  (recursive RLS) على جدول `user_roles`.
- **default-deny**: تفعيل RLS بلا سياسة = رفض؛ كل سماح صريح ومعلّق بمصفوفة الصلاحيات.
- منع تصعيد الصلاحيات: العميل **لا يستطيع** الإدراج في `user_roles`
  (لا توجد سياسة إدراج إلا لـ `super_admin`)، ولا تعديل `customer_number` /
  `account_status` (مشغّل `enforce_profile_self_update`)، ولا للعمالاء تعديل
  شحناتهم إطلاقاً (لا توجد سياسة UPDATE للعملاء على `shipments`) — كما يمنع
  `enforce_shipment_ownership_update` إعادة توجيه ملكية الشحنة من طرف
  `warehouse_staff`.
- **🛡️ لا تُخزَّن أرقام بطاقات (PAN) أو CVV/CVC أبداً** — الدفع عبر مزوّد خارجي
  ونحن نحفظ `transaction_reference` فقط.
- الحفاظ على تاريخ الشحن: `ON DELETE RESTRICT` بين `shipments` ↔
  `shipment_events` / `shipment_payments` / `consolidation_items`، و`CASCADE`
  فقط لبيانات مملوكة فعلاً (عناوين، إشعارات، تذاكر، مستندات).
- المسارات في `photo_path` / `document_path` / `storage_path` هي مسارات **bucket خاص**
  — تُتاح الملفات بروقعة موقّعة (signed URL) عبر التطبيق، لا روابط عامة.

---

## ⚙️ متغيّرات البيئة المطلوبة / Required env vars

أضفها إلى ملف `.env` المحلي (التطبيق يقرأها من `src/lib/supabase/env.ts`؛
إن لم تكن موجودة في `.env.example` أضفها بنفس الأسماء):

```bash
NEXT_PUBLIC_SUPABASE_URL="https://<your-project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<anon/publishable key>"   # Dashboard → API Keys
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

- القيم من: Dashboard → **Project Settings → API** (النسخة 2 تسمّي المفتاح
  *Publishable key* بدل *anon key*).
- **مفتاح service_role/secret لا يوضع في أي متغيّر يبدأ بـ `NEXT_PUBLIC_`**
  ولا يصل إلى الكود العميل إطلاقاً (RLS هو خط الدفاع، والمفتاح السري يُستخدم
  في الخادم فقط إن لزم).

للـ CLI أيضاً (اختياري): `SUPABASE_ACCESS_TOKEN` (من `supabase login`).

---

## 👑 تهيئة أول مدير / Bootstrap the first admin

لا تُنشأ أي حسابات وهمية في SQL. الخطوات:

1. أنشئ حساب الإدارة الحقيقي من **Dashboard → Authentication → Users → Add user**
   (بريد + كلمة مرور)، أو سجّل الدخول عبر التطبيق أول مرة.
2. انسخ `User UID` ذلك الحساب.
3. نفّذ في **SQL Editor**:

```sql
select public.promote_to_super_admin('<AUTH_USER_UUID>');
```

4. سيحصل على دور `super_admin` (يُسجَّل في `user_roles` مع سطر تدقيق).
   الدالة مسحوبة من `anon`/`authenticated` لمنع الترقية الذاتية.

**الأدوار الخمسة المتاحة** (صفر صف في `user_roles` = عميل عادي):

`super_admin` · `operations_manager` · `warehouse_staff` ·
`customer_support` · `finance_staff`

للتوسعة: `insert into public.user_roles (user_id, role) values ('<uuid>',
'warehouse_staff') on conflict do nothing;` (يُنفّذ كـ super_admin).

---

## 🧾 ملاحظات تشغيلية / Operational notes

- **التسجيل (signUp)**: يجب أن يمرر التطبيق بيانات `options.data` بهذا الشكل
  لأن trigger `handle_new_user` يقرأها:

```ts
supabase.auth.signUp({
  email, password,
  options: { data: { full_name: "محمد العتيبي", phone: "+966512345678", city: "Riyadh" } },
});
```

  رقم الجوال **إلزامي** بصيغة `+9665XXXXXXXX` (قابل لفحص CHECK). إن فشل تجهيز
  الملف، يسجّل trigger تحذيراً ولا يُفشل التسجيل — ثم استدعِ:

```sql
select public.repair_missing_profiles();   -- service_role / SQL Editor فقط
```

- **توليد الأرقام**: `WA-100001` للعملاء، `WAS-2026-000001` للشحنات
  (يبدأ من 1 كل سنة)، `PKG-000001` للطرود، `TKT-000001` للتذاكر — كلها عبر
  عدّاد `sequences` آمن ضد التزامن (`next_seq`)، وليس عبر تطبيقات متزامنة.
- **انتقال الحالات**: لا يُغيَّر `current_status` مباشرة؛ استخدم
  `public.transition_shipment(...)` الذي يتحقق من آلة الانتقالات، يقفل الصف
  (`FOR UPDATE`)، ويدوّن الحدث بشكل idempotent.
- **المطالبات**: `public.approve_claim(...)` / `reject_claim(...)` — تتحقق من
  الدور، تمنع تعدد المطالبات المعتمدة على الشحنة، وتدوّن audit + إشعار
  في نفس المعاملة.
- **المدفوعات**: `public.record_payment(...)` — للمالية/الإدارة فقط، وتعيد
  احتساب `payment_status` من مجموع المدفوعات الموثّقة مقابل `shipping_fee`.
- تُعدَّل قيم `site_settings` من لوحة الإدارة (super_admin فقط يكتبها).

---

## 📊 الأرقام / Counts

- **18** جدولاً · **16** دالة في `0002` (+1 `promote_to_super_admin` في `0004`) ·
  **10** مشغّلات · **61** سياسة RLS · **18** حالة شحن · **46** انتقال حالة.
