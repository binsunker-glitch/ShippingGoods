import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  ArrowLeft,
  BadgeCheck,
  Boxes,
  ClipboardList,
  Headphones,
  PackageCheck,
  Search,
  ShieldCheck,
  Truck,
  Warehouse,
  Wallet,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { APP_NAME_AR, WAREHOUSE_CITY } from "@/lib/constants";
import { getSiteSetting } from "@/server/queries/settings";
import { TrackForm } from "./track-form";

export const metadata = {
  title: "شحن مشترياتك من الصين إلى السعودية بكل سهولة",
  description:
    "استلم طرودك في مستودعنا بقوانغتشو، جمّعها في شحنة واحدة، وتابعها خطوة بخطوة حتى باب منزلك في السعودية.",
};

type FaqItem = { question: string; answer: string };
type ContactSettings = { phone?: string; email?: string; whatsapp?: string; hours?: string };

const STEPS = [
  {
    icon: ClipboardList,
    title: "1. أنشئ حسابك",
    text: "سجّل بياناتك واحصل على رقم عميل دائم يبدأ بـ WA- تستخدمه في كل تعاملاتك معنا.",
  },
  {
    icon: Warehouse,
    title: "2. أرسل طرودك إلى مستودعنا",
    text: `اشترِ من متاجر الصين وأرسل الطرد إلى عنوان مستودعنا في ${WAREHOUSE_CITY}.`,
  },
  {
    icon: PackageCheck,
    title: "3. استلم وسجّل الطرد",
    text: "يصلك إشعار فور وصول الطرد إلى المستودع مع وزنه وصوره وحالته.",
  },
  {
    icon: Boxes,
    title: "4. جمّع طرودك",
    text: "ادمج عدة طرود في شحنة واحدة لتوفير تكلفة الشحن، أو أشحن كل طرد على حدة.",
  },
  {
    icon: Wallet,
    title: "5. ادفع الرسوم",
    text: "تظهر لك الرسوم بوضوح قبل الشحن، ولا نضيف أي رسوم غير معلنة.",
  },
  {
    icon: Truck,
    title: "6. تابع حتى باب منزلك",
    text: "تابع الشحنة خطوة بخطوة حتى التسليم على عنوانك في السعودية.",
  },
];

const SERVICES = [
  {
    icon: Boxes,
    title: "تجميع الطرود",
    text: "دمج عدة طرود من متاجر مختلفة في شحنة واحدة لتقليل تكلفة الشحن لكل كيلو.",
  },
  {
    icon: Warehouse,
    title: "تخزين مؤقت في المستودع",
    text: "نستقبل طرودك ونخزنها بأمان في قوانغتشو حتى تجهز للإرسال في شحنة واحدة.",
  },
  {
    icon: Truck,
    title: "شحن جوي وبري",
    text: "خيارات شحن متعددة حسب الوزن والمدة المطلوبة، مع توضيح التكلفة قبل التأكيد.",
  },
  {
    icon: PackageCheck,
    title: "التوصيل داخل السعودية",
    text: "تسليم إلى العنوان الوطني المسجّل لديك داخل المملكة بعد اكتمال التخليص.",
  },
];

const REASONS = [
  {
    icon: Search,
    title: "تتبّع واضح وشفاف",
    text: "كل تحديث مسجّل بتاريخه ومكانه ووصفه من فريقنا، ولا نعرض معلومات غير مؤكدة.",
  },
  {
    icon: ShieldCheck,
    title: "أمان حسابك أولاً",
    text: "ربط الشحنات يتطلّب التحقق من الملكية، ولا يمكن لأحد الوصول إلى شحناتك دون تسجيل دخول.",
  },
  {
    icon: BadgeCheck,
    title: "أرقام واضحة",
    text: "رقم عميل دائم لحسابك ورقم تتبع مستقل لكل شحنة، فلا تختلط عليك الأرقام.",
  },
  {
    icon: Headphones,
    title: "دعم موثّق",
    text: "كل طلب دعم يحصل على رقم تذكرة، وتصلك الإجابات داخل حسابك.",
  },
];

const DEFAULT_FAQ: FaqItem[] = [
  {
    question: "كم يستغرق الشحن من الصين إلى السعودية؟",
    answer:
      "يعتمد المدة على طريقة الشحن (جو أو بري) وعلى حالة التخليص. يظهر الموعد المتوقع داخل صفحة الشحنة بعد إنشاءها، وهو موعد تقديري لا التزام نهائي.",
  },
  {
    question: "كيف أربط طردي بحسابي؟",
    answer:
      "من صفحة «ربط طرد» أدخل رقم تتبع الشحنة. إذا طابق رقم جوال الشحنة رقم جوال حسابك يتم الربط تلقائياً، وإلا يذهب الطلب إلى فريقنا للمراجعة قبل فتح الشحنة لحسابك.",
  },
  {
    question: "هل يمكنني دمج عدة طرود في شحنة واحدة؟",
    answer:
      "نعم، خدمة التجميع تقلّل تكلفة الشحن. تظهر مجموعات التجميع في حسابك عندما تصل طرودك إلى المستودع وتأهل للدمج.",
  },
  {
    question: "متى تُحتسب الرسوم؟",
    answer:
      "تُحتسب الرسوم بعد قياس الوزن الفعلي في المستودع أو بعد الدمج. لا نعرض رسوماً أو جمارك غير موثقة داخل النظام.",
  },
  {
    question: "هل رقم العميل هو كلمة المرور؟",
    answer:
      "لا. رقم العميل (مثل WA-100001) معرّف للتصريف فقط، ولا يُستخدم لتسجيل الدخول أو لتأكيد أي طلب.",
  },
];

/**
 * The page shell (hero, steps, services, why-us, tracking) is fully static.
 * FAQ and contact content comes from site settings, so each renders behind a
 * <Suspense> boundary and streams in without blocking the prerender.
 */
export default function HomePage() {
  return (
    <>
      {/* ================= hero ================= */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #f97316 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
          aria-hidden
        />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs font-bold text-brand">
                <span className="size-1.5 rounded-full bg-brand" aria-hidden />
                {WAREHOUSE_CITY} ← المملكة العربية السعودية
              </span>

              <h1 className="mt-5 text-3xl leading-[1.25] font-extrabold sm:text-[42px] sm:leading-[1.2]">
                شحن مشترياتك من الصين إلى السعودية بكل سهولة
              </h1>

              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/70">
                أنشئ حسابك، أرسل طرودك إلى مستودعنا في قوانغتشو، جمّعها في شحنة واحدة، وتابعها
                خطوة بخطوة حتى باب منزلك في المملكة.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/register" className={buttonVariants("primary", "lg")}>
                  إنشاء حساب مجاني
                  <ArrowLeft className="size-4" aria-hidden />
                </Link>
                <Link
                  href="/track"
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-white/20 bg-white/[0.06] px-6 text-[15px] font-bold text-white transition-colors hover:bg-white/[0.12]"
                >
                  تتبع شحنتك
                </Link>
              </div>

              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-white/10 pt-6">
                <div>
                  <dt className="text-xs font-semibold text-white/55">المصدر</dt>
                  <dd className="mt-1 text-sm font-bold text-white">{WAREHOUSE_CITY}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-white/55">الوجهة</dt>
                  <dd className="mt-1 text-sm font-bold text-white">المملكة العربية السعودية</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-white/55">العملة</dt>
                  <dd className="mt-1 text-sm font-bold text-white">ريال سعودي (SAR)</dd>
                </div>
              </dl>
            </div>

            {/* tracking card */}
            <Card className="border-0 shadow-pop">
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-10 place-items-center rounded-full bg-brand-soft text-brand-dark">
                    <Search className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="text-[15px] font-bold text-ink">تتبع شحنتك</h2>
                    <p className="text-xs text-muted">أدخل رقم التتبع الخاص بالشحنة</p>
                  </div>
                </div>
                <TrackForm />
                <p className="flex items-start gap-2 rounded-lg bg-surface-muted px-3 py-2.5 text-xs leading-relaxed text-muted">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden />
                  <span>
                    التتبّع العام يعرض بيانات محدودة. سجّل الدخول لعرض تفاصيل شحناتك كاملة.
                  </span>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ================= how it works ================= */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-extrabold text-ink sm:text-3xl">كيف نعمل؟</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            ست خطوات واضحة من الشراء في الصين حتى استلام الطرد عند بابك.
          </p>
        </div>

        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.title}>
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col gap-3">
                    <span className="grid size-11 place-items-center rounded-xl bg-navy text-white">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="text-[15px] font-bold text-ink">{step.title}</h3>
                    <p className="text-[13px] leading-relaxed text-muted">{step.text}</p>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ================= services ================= */}
      <section id="services" className="scroll-mt-24 bg-surface-muted">
        <div className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-extrabold text-ink sm:text-3xl">خدمات الشحن</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              خدمات مصمّمة لتقليل تكلفة الشحن وزيادة وضوح المتابعة.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {SERVICES.map((service) => {
              const Icon = service.icon;
              return (
                <Card key={service.title} className="h-full">
                  <CardContent className="flex gap-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-dark">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-bold text-ink">{service.title}</h3>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{service.text}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= why us ================= */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-extrabold text-ink sm:text-3xl">لماذا تختارنا؟</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            نركز على الوضوح والأمان بدل الوعود غير القابلة للقياس.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {REASONS.map((reason) => {
            const Icon = reason.icon;
            return (
              <Card key={reason.title} className="h-full">
                <CardContent className="flex flex-col gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-info-soft text-info">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="text-[15px] font-bold text-ink">{reason.title}</h3>
                  <p className="text-[13px] leading-relaxed text-muted">{reason.text}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ================= tracking ================= */}
      <section className="bg-navy text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-extrabold sm:text-3xl">تتبّع شحنتك لحظة بلحظة</h2>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/70">
                يعرض النظام المسار المسجّل الرسمي للشحنة فقط، مع توقيت كل حدث ومكانه. المواعيد
                المعروضة تقديرية وقابلة للتغيير حسب حالة الشحن والتخليص الفعلية.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "15 مرحلة محددة من الاستلام حتى التسليم",
                  "حالات استثنائية معلَنة بوضوح عند وجود تأخير أو مشكلة",
                  "كل تحديث مصدره فريقنا ومسجّل رسمياً",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[14px] text-white/75">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <Card className="border-0 shadow-pop">
              <CardContent className="space-y-4 p-6">
                <h3 className="text-[15px] font-bold text-ink">ابدأ التتبّع الآن</h3>
                <TrackForm />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ================= faq ================= */}
      <section id="faq" className="mx-auto w-full max-w-4xl scroll-mt-24 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-extrabold text-ink sm:text-3xl">الأسئلة الشائعة</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            إجابات مختصرة عن أكثر الأسئلة تكراراً.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <Suspense
            fallback={
              <>
                {DEFAULT_FAQ.slice(0, 3).map((item, index) => (
                  <div
                    key={index}
                    className="rounded-card border border-line bg-surface px-5 py-4 shadow-card"
                  >
                    <p className="skeleton-fill h-4 w-2/3 rounded" aria-hidden />
                  </div>
                ))}
                <span className="sr-only">جارٍ تحميل الأسئلة الشائعة...</span>
              </>
            }
          >
            <FaqList />
          </Suspense>
        </div>
      </section>

      {/* ================= contact ================= */}
      <section id="contact" className="scroll-mt-24 bg-surface-muted">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-extrabold text-ink sm:text-3xl">تواصل معنا</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              فريقنا جاهز لمساعدتك. للأسئلة العاجلة، سجّل دخولك وأرسل طلب دعم لتحصل على رقم تذكرة
              للمتابعة.
            </p>
          </div>

          <Card className="mx-auto mt-8 max-w-2xl">
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Suspense
                fallback={
                  <>
                    <span className="skeleton-fill h-14 rounded-xl" aria-hidden />
                    <span className="skeleton-fill h-14 rounded-xl" aria-hidden />
                    <span className="sr-only">جارٍ تحميل بيانات التواصل...</span>
                  </>
                }
              >
                <ContactCard />
              </Suspense>
            </CardContent>
          </Card>

          <div className="mt-8 text-center">
            <Link href="/register" className={buttonVariants("primary", "lg")}>
              إنشاء حساب والبدء
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* ================= brand strip ================= */}
      <section className="border-t border-line bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6">
          <Logo size="lg" />
          <p className="max-w-md text-[13px] leading-relaxed text-muted">
            {APP_NAME_AR} — شحن مشترياتك من {WAREHOUSE_CITY} إلى المملكة العربية السعودية.
          </p>
          <Link href="/privacy" className="text-[13px] font-bold text-brand-dark hover:underline">
            سياسة الخصوصية
          </Link>
        </div>
      </section>
    </>
  );
}

/** FAQ list read from site settings; falls back to the built-in questions. */
async function FaqList() {
  // Date.now() inside the database driver is unstable at prerender time.
  await connection();
  const faq = await getSiteSetting<FaqItem[]>("faq");
  const faqItems = faq && faq.length > 0 ? faq : DEFAULT_FAQ;

  return (
    <>
      {faqItems.map((item, index) => (
        <Card key={index}>
          <details className="group">
            <summary className="cursor-pointer list-none px-5 py-4 text-[15px] font-bold text-ink">
              {item.question}
            </summary>
            <p className="border-t border-line px-5 py-4 text-[13.5px] leading-relaxed text-muted">
              {item.answer}
            </p>
          </details>
        </Card>
      ))}
    </>
  );
}

/** Contact details read from site settings, with a static location line. */
async function ContactCard() {
  await connection();
  const contact = await getSiteSetting<ContactSettings>("contact");

  return (
    <>
      {contact?.phone ? (
        <ContactLine label="الهاتف" value={contact.phone} ltr />
      ) : null}
      {contact?.email ? (
        <ContactLine label="البريد الإلكتروني" value={contact.email} ltr />
      ) : null}
      {contact?.whatsapp ? (
        <ContactLine label="واتساب" value={contact.whatsapp} ltr />
      ) : null}
      {contact?.hours ? <ContactLine label="ساعات العمل" value={contact.hours} /> : null}
      <ContactLine label="الموقع" value={WAREHOUSE_CITY} ltr />
      {!contact?.phone && !contact?.email && !contact?.whatsapp ? (
        <p className="text-[13px] leading-relaxed text-muted sm:col-span-2">
          بيانات التواصل تُضبط من لوحة الإدارة. يمكنك إنشاء حساب وإرسال طلب دعم لتحصل على
          رقم تذكرة موثّق.
        </p>
      ) : null}
    </>
  );
}

function ContactLine({
  label,
  value,
  ltr,
}: {
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p
        className={`mt-1 text-sm font-bold text-ink ${ltr ? "tabular" : ""}`}
        dir={ltr ? "ltr" : undefined}
      >
        {value}
      </p>
    </div>
  );
}
