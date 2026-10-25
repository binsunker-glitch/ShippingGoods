import { Suspense } from "react";
import { connection } from "next/server";
import { ShieldCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { getSiteSetting } from "@/server/queries/settings";

export const metadata = {
  title: "سياسة الخصوصية",
  description: "كيف نجمع بيانات عملائنا ونستخدمها ونحميها وفقاً لأنظمة المملكة العربية السعودية.",
};

type PolicyContent = {
  updatedAt?: string;
  sections?: Array<{ title: string; body: string }>;
};

const DEFAULT_SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: "البيانات التي نجمعها",
    body: "نجمع البيانات التي تقدّمها عند التسجيل: الاسم الكامل، رقم الجوال السعودي، البريد الإلكتروني (اختياري)، المدينة، والعنوان الوطني. كما نسجّل بيانات تشغيلية مرتبطة بشحناتك مثل أوزان الطرود وتواريخ الاستلام وحالات الشحن وسجل المدفوعات.",
  },
  {
    title: "كيف نستخدم بياناتك",
    body: "نستخدم بياناتك لتنفيذ خدمة الشحن: إنشاء حسابك، ربط طرودك، إصدار الفواتير، إرسال إشعارات حالة الشحنة، والتحقق من هويتك عند طلب ربط شحنة. لا نستخدم بياناتك لأغراض تسويقية دون موافقتك.",
  },
  {
    title: "مشاركة البيانات",
    body: "لا نبيع بياناتك الشخصية. قد نشارك الحد الأدنى الضروري مع شركات الشحن والجهات الجمركية لتنفيذ التسليم ومتطلبات النظام فقط.",
  },
  {
    title: "حماية البيانات",
    body: "يُخزَّن النظام داخل بيئة مؤمَّنة، وكلمات المرور مشفّرة ولا تُخزَّن كنص صريح. الجلسات محمية بكوكيز غير قابلة للوصول من جهة أخرى (httpOnly)، وكل عمليات الدخول والتغييرات الحساسة مسجّلة في سجل تدقيق.",
  },
  {
    title: "الاحتفاظ بالبيانات",
    body: "نحتفظ ببيانات الشحن والمدفوعات للمدة اللازمة لتقديم الخدمة ومتطلبات الأنظمة، ثم نحذفها أو نُخفي هويتها وفقاً لسياسة الاحتفاظ المعتمدة داخل النظام.",
  },
  {
    title: "حقوقك",
    body: "يمكنك طلب الاطلاع على بياناتك أو تصحيحها أو حذف حسابك عبر التواصل مع الدعم. تُعالج الطلبات مع التحقق من الهوية.",
  },
  {
    title: "العنوان الوطني",
    body: "يتكوّن العنوان الوطني السعودي من رقم المبنى والشارع والحي والمدينة والرمز البريدي، ويُضاف إليه أحياناً Short Code المكوّن من خمسة أرقام وثلاثة أحرف. نستخدم هذه البيانات لتنفيذ التسليم داخل المملكة فقط.",
  },
  {
    title: "بيانات الدفع",
    body: "لا نخزّن أرقام البطاقات أو رموز CVV داخل النظام. عمليات الدفع الإلكتروني تتم عبر بوابة خارجية معتمدة، ويُسجَّل في النظام المرجع والمبلغ والحالة فقط.",
  },
];

/**
 * Header and footer of the page are static; the policy text itself comes from
 * site settings and streams in behind a <Suspense> boundary.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand-dark">
          <ShieldCheck className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold text-ink sm:text-3xl">سياسة الخصوصية</h1>
        <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
          كيف نجمع بياناتك ونستخدمها ونحميها. صُمّمت هذه السياسة لتتوافق مع أنظمة حماية البيانات
          الشخصية في المملكة العربية السعودية.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="mt-8 space-y-4" aria-hidden>
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="skeleton-fill h-24 rounded-card" />
            ))}
            <span className="sr-only">جارٍ تحميل نص السياسة...</span>
          </div>
        }
      >
        <PolicyContent />
      </Suspense>

      <p className="mt-6 text-center text-xs leading-relaxed text-subtle">
        هذا النص مثال افتراضي لأغراض العرض. راجعه مع مستشارك القانوني قبل النشر، ويمكن تعديله
        بالكامل من لوحة الإدارة.
      </p>
    </div>
  );
}

async function PolicyContent() {
  // Date.now() inside the database driver is unstable at prerender time.
  await connection();
  const policy = await getSiteSetting<PolicyContent>("privacy");
  const sections =
    policy?.sections && policy.sections.length > 0 ? policy.sections : DEFAULT_SECTIONS;

  return (
    <>
      {policy?.updatedAt ? (
        <p className="mt-3 text-center text-xs text-subtle">آخر تحديث: {policy.updatedAt}</p>
      ) : null}

      <div className="mt-8 space-y-4">
        {sections.map((section, index) => (
          <Card key={index}>
            <CardContent className="space-y-2">
              <h2 className="text-[15px] font-bold text-ink">{section.title}</h2>
              <p className="text-[13.5px] leading-relaxed text-muted">{section.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
