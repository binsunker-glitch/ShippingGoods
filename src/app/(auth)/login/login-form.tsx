"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";

import { INITIAL_STATE } from "@/lib/action-state";
import { loginAction } from "@/server/actions/auth";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export function LoginForm({ resetDone }: { resetDone: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_STATE);
  const [showPassword, setShowPassword] = useState(false);

  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {resetDone ? (
        <Alert variant="success" title="تم إعادة تعيين كلمة المرور">
          يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.
        </Alert>
      ) : null}

      {state?.message ? (
        <Alert variant={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <Field
        htmlFor="identifier"
        label="البريد الإلكتروني أو رقم الجوال أو رقم العميل"
        error={errors.identifier}
        required
      >
        <Input
          id="identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          dir="ltr"
          placeholder="WA-100001 أو 05xxxxxxxx"
          defaultValue={state?.data?.identifier}
          invalid={Boolean(errors.identifier)}
          required
        />
      </Field>

      <Field htmlFor="password" label="كلمة المرور" error={errors.password} required>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="pe-10"
            invalid={Boolean(errors.password)}
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

      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="text-xs text-subtle">الجلسة صالحة لمدة 30 يوماً</span>
        <Link href="/forgot-password" className="font-bold text-brand-dark hover:underline">
          نسيت كلمة المرور؟
        </Link>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : <LogIn className="size-4" aria-hidden />}
        {pending ? "جارٍ الدخول..." : "تسجيل الدخول"}
      </Button>

      <p className="text-center text-xs leading-relaxed text-subtle">
        هذا الحساب محمي بجلسات آمنة ومشفرة. لا تشارك كلمة المرور مع أي جهة.
      </p>
    </form>
  );
}
