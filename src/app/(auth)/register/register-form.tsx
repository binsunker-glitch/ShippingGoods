"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff, ShieldCheck, UserPlus } from "lucide-react";

import { INITIAL_STATE } from "@/lib/action-state";
import { SAUDI_CITIES } from "@/lib/constants";
import { passwordStrength } from "@/lib/password-strength";
import { registerAction } from "@/server/actions/auth";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Label, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";

const strengthTones = ["bg-danger", "bg-danger", "bg-warning", "bg-success", "bg-success"];

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, INITIAL_STATE);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const errors = state?.errors ?? {};
  const data = state?.data;
  const strength = passwordStrength(password);
  const hasFieldErrors = Object.keys(errors).length > 0;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state?.message && !hasFieldErrors ? (
        <Alert variant={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}
      {hasFieldErrors ? (
        <Alert variant="danger" title="تعذر إكمال التسجيل">
          راجع الحقول المحددة بالأسفل وصححها ثم أعد الإرسال.
        </Alert>
      ) : null}

      {/* ------------------------- account ------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>بيانات الحساب</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <Field
            htmlFor="fullName"
            label="الاسم الكامل"
            error={errors.fullName}
            required
            className="sm:col-span-2"
          >
            <Input
              id="fullName"
              name="fullName"
              autoComplete="name"
              defaultValue={data?.fullName}
              invalid={Boolean(errors.fullName)}
              required
            />
          </Field>

          <Field
            htmlFor="phone"
            label="رقم الجوال السعودي"
            hint="يُستخدم للتواصل عند التسليم، ويجب أن يبدأ بـ 05"
            error={errors.phone}
            required
          >
            <Input
              id="phone"
              name="phone"
              type="tel"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              placeholder="05xxxxxxxx"
              defaultValue={data?.phone}
              invalid={Boolean(errors.phone)}
              required
            />
          </Field>

          <Field
            htmlFor="email"
            label="البريد الإلكتروني"
            hint="اختياري — يُستخدم لاستعادة كلمة المرور"
            error={errors.email}
          >
            <Input
              id="email"
              name="email"
              type="email"
              dir="ltr"
              autoComplete="email"
              defaultValue={data?.email}
              invalid={Boolean(errors.email)}
            />
          </Field>

          <Field
            htmlFor="city"
            label="المدينة"
            hint="اكتب اسم المدينة أو اختر من الاقتراحات"
            error={errors.city}
            required
          >
            <Input
              id="city"
              name="city"
              list="saudi-cities"
              autoComplete="address-level2"
              defaultValue={data?.city}
              invalid={Boolean(errors.city)}
              required
            />
            <datalist id="saudi-cities">
              {SAUDI_CITIES.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
          </Field>

          <div className="grid gap-4">
            <Field htmlFor="password" label="كلمة المرور" error={errors.password} required>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="pe-10"
                  invalid={Boolean(errors.password)}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  className="absolute inset-y-0 end-0 grid w-10 place-items-center text-muted hover:text-ink"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            {password ? (
              <div className="-mt-2">
                <div className="flex gap-1" aria-hidden>
                  {strengthTones.map((tone, index) => (
                    <span
                      key={index}
                      className={cn(
                        "h-1.5 flex-1 rounded-full",
                        index < strength.score ? tone : "bg-line",
                      )}
                    />
                  ))}
                </div>
                <p className="mt-1.5 text-xs font-semibold text-muted">
                  قوة كلمة المرور: <span className="text-ink">{strength.label}</span>
                </p>
              </div>
            ) : null}
          </div>

          <Field
            htmlFor="confirmPassword"
            label="تأكيد كلمة المرور"
            error={errors.confirmPassword}
            required
          >
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              invalid={Boolean(errors.confirmPassword)}
              required
            />
          </Field>
        </CardContent>
      </Card>

      {/* ------------------------ address ------------------------- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>العنوان الوطني للتسليم</CardTitle>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              يُحفظ هذا العنوان كعنوان تسليمك الافتراضي. الرمز المختصر للعنوان الوطني
              اختياري بالكامل، ويمكنك تركه فارغاً إذا لم يتوفر لديك.
            </p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <Field htmlFor="district" label="الحي" error={errors.district} required>
            <Input
              id="district"
              name="district"
              autoComplete="address-level3"
              defaultValue={data?.district}
              invalid={Boolean(errors.district)}
              required
            />
          </Field>

          <Field htmlFor="street" label="الشارع" error={errors.street} required>
            <Input
              id="street"
              name="street"
              autoComplete="address-line1"
              defaultValue={data?.street}
              invalid={Boolean(errors.street)}
              required
            />
          </Field>

          <Field htmlFor="buildingNumber" label="رقم المبنى" error={errors.buildingNumber} required>
            <Input
              id="buildingNumber"
              name="buildingNumber"
              dir="ltr"
              defaultValue={data?.buildingNumber}
              invalid={Boolean(errors.buildingNumber)}
              required
            />
          </Field>

          <Field
            htmlFor="secondaryNumber"
            label="الرقم الثانوي"
            hint="اختياري"
            error={errors.secondaryNumber}
          >
            <Input
              id="secondaryNumber"
              name="secondaryNumber"
              dir="ltr"
              defaultValue={data?.secondaryNumber}
              invalid={Boolean(errors.secondaryNumber)}
            />
          </Field>

          <Field htmlFor="postalCode" label="الرمز البريدي" error={errors.postalCode} required>
            <Input
              id="postalCode"
              name="postalCode"
              dir="ltr"
              inputMode="numeric"
              maxLength={5}
              defaultValue={data?.postalCode}
              invalid={Boolean(errors.postalCode)}
              required
            />
          </Field>

          <Field
            htmlFor="nationalAddressShortCode"
            label="الرمز المختصر للعنوان الوطني"
            hint="اختياري — لا نطلبه إن لم يتوفر لديك"
            error={errors.nationalAddressShortCode}
          >
            <Input
              id="nationalAddressShortCode"
              name="nationalAddressShortCode"
              dir="ltr"
              defaultValue={data?.nationalAddressShortCode}
              invalid={Boolean(errors.nationalAddressShortCode)}
            />
          </Field>

          <Field
            htmlFor="addressDetails"
            label="تعليمات إضافية للتوصيل"
            hint="اختياري — مثل أوقات مناسبة لاستلام الطرد"
            error={errors.addressDetails}
            className="sm:col-span-2"
          >
            <Textarea
              id="addressDetails"
              name="addressDetails"
              defaultValue={data?.addressDetails}
              invalid={Boolean(errors.addressDetails)}
            />
          </Field>
        </CardContent>
      </Card>

      {/* ------------------------- consent ------------------------ */}
      <Card>
        <CardContent className="space-y-3 py-5">
          <div className="flex items-start gap-3">
            <Checkbox id="consent" name="consent" value="on" className="mt-1" />
            <Label htmlFor="consent" className="mb-0 cursor-pointer leading-relaxed">
              أوافق على جمع ومعالجة بياناتي بالقدر اللازم لتقديم خدمات الشحن وفق{" "}
              <Link href="/privacy" target="_blank" className="font-bold text-brand-dark underline">
                سياسة الخصوصية
              </Link>
              .
            </Label>
          </div>
          {errors.consent ? (
            <p className="text-xs font-semibold text-danger" role="alert">
              {errors.consent}
            </p>
          ) : null}

          <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-muted px-4 py-3 text-[13px] leading-relaxed text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <span>
              كلمة المرور تُخزَّن مشفّرة (bcrypt) ولا تُرسل إلا عبر اتصال مشفّر. رقم العميل
              يُولَّد على الخادم ويظل دائماً مرتبطاً بحسابك.
            </span>
          </div>
        </CardContent>
      </Card>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : <UserPlus className="size-4" aria-hidden />}
        {pending ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب"}
      </Button>
    </form>
  );
}
