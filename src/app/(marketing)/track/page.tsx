import { Search, ShieldCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { TrackForm } from "../track-form";

export const metadata = {
  title: "تتبع الشحنة",
  description: "تابع حالة شحنتك من مستودعنا في قوانغتشو حتى عنوانك في المملكة العربية السعودية.",
};

export default function TrackPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand-dark">
          <Search className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold text-ink sm:text-3xl">تتبع الشحنة</h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
          أدخل رقم التتبع الخاص بشحنتك لعرض آخر التحديثات المسجّلة رسمياً من فريقنا.
        </p>
      </div>

      <Card className="mt-8">
        <CardContent className="p-6">
          <TrackForm />
        </CardContent>
      </Card>

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-line bg-surface-muted px-4 py-3.5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
        <div className="text-[13px] leading-relaxed text-muted">
          <p className="font-bold text-ink">خصوصيتك محمية</p>
          <p className="mt-1">
            التتبّع العام لا يعرض اسم العميل أو رقم الجوال أو العنوان التفصيلي أو محتوى الشحنة.
            لعرض تفاصيل شحناتك كاملة، سجّل دخولك إلى حسابك.
          </p>
        </div>
      </div>
    </div>
  );
}
