import { KeyRound, Mail, MapPin, Phone, ShieldCheck, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataRow } from "@/components/ui/feedback";
import { formatDateTime, formatNationalAddress } from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import { getDefaultAddress } from "@/server/queries/addresses";
import { getProfile } from "@/server/queries/profile";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "حسابي" };

export default async function AccountPage() {
  const session = await requireCustomer();
  const [profile, defaultAddress] = await Promise.all([
    getProfile(session.profileId),
    getDefaultAddress(session.profileId),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink sm:text-2xl">حسابي</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
          بيانات حسابك المسجّلة لدى الشركة. لتغيير الاسم أو رقم الجوال، تواصل مع الدعم مع إثبات
          الهوية.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* ---------------- profile ---------------- */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="size-4 text-muted" aria-hidden />
                <CardTitle>البيانات الشخصية</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <DataRow label="الاسم الكامل" value={profile?.fullName ?? session.fullName} />
                <DataRow
                  label="رقم العميل"
                  value={
                    <span className="tabular inline-flex items-center gap-2">
                      {session.customerNumber}
                      <Badge variant="brand">معرّف دائم</Badge>
                    </span>
                  }
                />
                <DataRow
                  label="رقم الجوال"
                  value={
                    <span className="inline-flex items-center gap-1.5" dir="ltr">
                      <Phone className="size-3.5 text-muted" aria-hidden />
                      {profile?.phone ?? session.phone}
                    </span>
                  }
                />
                <DataRow
                  label="البريد الإلكتروني"
                  value={
                    profile?.email ? (
                      <span className="inline-flex items-center gap-1.5" dir="ltr">
                        <Mail className="size-3.5 text-muted" aria-hidden />
                        {profile.email}
                      </span>
                    ) : (
                      <span className="text-muted">غير مسجّل</span>
                    )
                  }
                />
                <DataRow label="المدينة" value={profile?.city ?? "—"} />
                <DataRow
                  label="تاريخ إنشاء الحساب"
                  value={
                    profile?.createdAt ? formatDateTime(profile.createdAt) : "—"
                  }
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-muted" aria-hidden />
                <CardTitle>تغيير كلمة المرور</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
        </div>

        {/* ---------------- default address ---------------- */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-muted" aria-hidden />
                <CardTitle>عنوان التوصيل الافتراضي</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {defaultAddress ? (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-ink">{defaultAddress.recipientName}</p>
                  <p className="text-[13px] leading-relaxed text-muted">
                    {formatNationalAddress(defaultAddress)}
                  </p>
                  <p className="tabular text-[13px] text-muted" dir="ltr">
                    {defaultAddress.phone}
                  </p>
                  <a
                    href="/addresses"
                    className="inline-block text-[13px] font-bold text-brand-dark hover:underline"
                  >
                    إدارة العناوين
                  </a>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[13px] leading-relaxed text-muted">
                    لم تُضِف عنوان توصيل بعد.
                  </p>
                  <a
                    href="/addresses"
                    className="inline-block text-[13px] font-bold text-brand-dark hover:underline"
                  >
                    إضافة عنوان
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand" aria-hidden />
                <span className="text-sm font-bold text-ink">أمان الحساب</span>
              </div>
              <ul className="space-y-2 text-[13px] leading-relaxed text-muted">
                <li>رقم العميل (WA-...) هو معرّف للتصريف فقط وليس كلمة مرور.</li>
                <li>لا نطلب منك كلمة المرور عبر الهاتف أو الواتساب أبداً.</li>
                <li>كل محاولات الدخول والتغييرات مسجّلة في سجل التدقيق.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
