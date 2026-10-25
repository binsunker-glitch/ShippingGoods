"use client";

import Link from "next/link";
import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { INITIAL_STATE } from "@/lib/action-state";
import { requestPasswordResetAction } from "@/server/actions/auth";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    INITIAL_STATE,
  );
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.message ? (
        <Alert variant={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      {state?.data?.resetUrl ? (
        <Alert variant="warning" title="وضع التطوير — مزوّد البريد غير مهيأ">
          <span dir="ltr" className="block break-all">
            {state.data.resetUrl}
          </span>
          <Link
            href={state.data.resetUrl}
            className="mt-2 inline-flex font-bold text-brand-dark underline"
          >
            فتح رابط إعادة التعيين
          </Link>
        </Alert>
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
          dir="ltr"
          autoComplete="username"
          placeholder="WA-100001 أو 05xxxxxxxx"
          invalid={Boolean(errors.identifier)}
          required
        />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
        {pending ? "جارٍ الإنشاء..." : "إنشاء رابط إعادة التعيين"}
      </Button>

      <p className="text-center text-xs leading-relaxed text-subtle">
        يتم إلغاء الجلسات النشطة عند طلب إعادة التعيين لحماية حسابك.
      </p>
    </form>
  );
}
