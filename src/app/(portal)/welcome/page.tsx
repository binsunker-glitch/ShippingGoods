import Link from "next/link";
import { ArrowLeft, Copy, Link2, MapPin, PackageCheck, Truck } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireCustomer } from "@/server/auth/guards";
import { getSiteSetting } from "@/server/queries/settings";

export const metadata = { title: "مرحباً بك" };

const STEPS = [
  {
    icon: Copy,
    title: "احفظ رقم العميل",
    text: "استخدم رقمك الدائم عند الشراء من المتاجر الصينية كاسم مستلم أو كمرجع داخل الطلب.",
  },
  {
    icon: PackageCheck,
    title: "وصول الطرد للمستودع",
    text: "بعد وصول طردك إلى قوانغتشو يسجّله فريق المستودع، فتظهر حالته داخل حسابك.",
  },
  {
    icon: Link2,
    title: "اربط الطرد بحسابك",
    text: "أدخل رقم التتبع من صفحة «ربط طرد». يتم التحقق من الملكية قبل الربط.",
  },
  {
    icon: Truck,
    title: "تابع الشحنة حتى بابك",
    text: "شاهد خط سير الشحنة لحظة بلحظة حتى التسليم داخل المملكة.",
  },
];

export default async function WelcomePage() {
  const session = await requireCustomer();
  const warehouse = await getSiteSetting<{
    city?: string;
    country?: string;
    address?: string;
    recipientGuidance?: string;
    notes?: string;
  }>("warehouse");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="overflow-hidden border-navy-line bg-navy text-white">
        <CardContent className="space-y-5 py-8 text-center">
          <div className="flex justify-center">
            <Logo variant="light" size="lg" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold sm:text-3xl">
              مرحباً بك في World Associates Shipping CO
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              تم إنشاء حسابك بنجاح. احتفظ برقم العميل الخاص بك واستخدمه في مستودع قوانغتشو.
            </p>
          </div>

          <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.07] px-5 py-4">
            <span className="text-[11px] font-semibold text-white/70">رقم العميل الخاص بك</span>
            <span className="tabular text-3xl font-extrabold tracking-wide text-brand">
              {session.customerNumber}
            </span>
            <CopyButton value={session.customerNumber} label="نسخ رقم العميل" variant="light" />
          </div>

          <p className="mx-auto max-w-xl text-xs leading-relaxed text-white/70">
            هذا الرقم هو معرّفك الدائم لدى الشركة، <strong className="text-white">وليس رقم
            تتبع شحنة</strong>. أرقام الشحنات تبدأ بـ{" "}
            <span className="tabular font-bold text-brand">WAS-</span> وتظهر لكل شحنة على
            حدة.
          </p>

          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Link href="/dashboard" className={buttonVariants("primary", "md")}>
              الانتقال إلى لوحة التحكم
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <Link href="/link-shipment" className={buttonVariants("outline", "md")}>
              <Link2 className="size-4" aria-hidden />
              ربط طرد
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-6">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand-dark">
              <MapPin className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-ink">تعليمات المستودع</h2>
              <p className="text-xs text-muted">
                {warehouse?.city ?? "Guangzhou"}
                {warehouse?.country ? `, ${warehouse.country}` : ", China"}
              </p>
            </div>
          </div>

          {warehouse?.recipientGuidance ? (
            <p className="rounded-xl border border-line bg-surface-muted px-4 py-3 text-[13.5px] leading-relaxed text-ink">
              {warehouse.recipientGuidance}
            </p>
          ) : null}

          {warehouse?.address ? (
            <p className="mt-3 text-sm font-semibold text-ink" dir="ltr">
              {warehouse.address}
            </p>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-warning/40 bg-warning-soft px-4 py-3 text-[13px] leading-relaxed text-warning">
              عنوان المستودع الدقيق لم يُسجَّل بعد في النظام. سيتم نشره من قبل الإدارة داخل هذه
              الصفحة ومركز المساعدة.
            </p>
          )}

          {warehouse?.notes ? (
            <p className="mt-3 text-xs leading-relaxed text-muted">{warehouse.notes}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {STEPS.map((step, index) => (
          <Card key={step.title} className="p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-navy text-sm font-extrabold text-white">
                {index + 1}
              </span>
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-ink">
                  <step.icon className="size-4 text-brand-dark" aria-hidden />
                  {step.title}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{step.text}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
