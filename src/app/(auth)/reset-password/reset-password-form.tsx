"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";

import { INITIAL_STATE } from "@/lib/action-state";
import { resetPasswordAction } from "@/server/actions/auth";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, INITIAL_STATE);
  const [show, setShow] = useState(false);
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />

      {state?.message ? <Alert variant="danger">{state.message}</Alert> : null}

      <Field htmlFor="password" label="كلمة المرور الجديدة" error={errors.password} required>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            className="pe-10"
            invalid={Boolean(errors.password)}
            required
          />
          <button
            type="button"
            onClick={() => setShow((value) => !value)}
            aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            className="absolute inset-y-0 end-0 grid w-10 place-items-center text-muted hover:text-ink"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>

      <Field
        htmlFor="confirmPassword"
        label="تأكيد كلمة المرور الجديدة"
        error={errors.confirmPassword}
        required
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          invalid={Boolean(errors.confirmPassword)}
          required
        />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : <KeyRound className="size-4" aria-hidden />}
        {pending ? "جارٍ الحفظ..." : "تعيين كلمة المرور"}
      </Button>
    </form>
  );
}
