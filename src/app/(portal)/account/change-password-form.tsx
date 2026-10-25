"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { INITIAL_STATE } from "@/lib/action-state";
import { passwordStrength } from "@/lib/password-strength";
import { changePasswordAction } from "@/server/actions/auth";

const STRENGTH_COLORS = ["bg-danger", "bg-danger", "bg-warning", "bg-info", "bg-success"];
const STRENGTH_WIDTHS = ["w-1/5", "w-2/5", "w-3/5", "w-4/5", "w-full"];

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, INITIAL_STATE);
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [password, setPassword] = useState("");

  const errors = state?.errors ?? {};
  const strength = passwordStrength(password);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.message ? (
        <Alert variant={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <Field
        htmlFor="currentPassword"
        label="كلمة المرور الحالية"
        error={errors.currentPassword}
        required
      >
        <div className="relative">
          <Input
            id="currentPassword"
            name="currentPassword"
            type={show.current ? "text" : "password"}
            autoComplete="current-password"
            className="pe-10"
            invalid={Boolean(errors.currentPassword)}
            disabled={pending}
            required
          />
          <ToggleEye
            shown={show.current}
            onClick={() => setShow((value) => ({ ...value, current: !value.current }))}
            label="إظهار كلمة المرور الحالية"
          />
        </div>
      </Field>

      <Field
        htmlFor="password"
        label="كلمة المرور الجديدة"
        error={errors.password}
        hint="10 أحرف على الأقل، وتتضمن حرفاً ورقماً"
        required
      >
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={show.next ? "text" : "password"}
            autoComplete="new-password"
            className="pe-10"
            invalid={Boolean(errors.password)}
            disabled={pending}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <ToggleEye
            shown={show.next}
            onClick={() => setShow((value) => ({ ...value, next: !value.next }))}
            label="إظهار كلمة المرور الجديدة"
          />
        </div>
      </Field>

      {password ? (
        <div className="space-y-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className={`h-full rounded-full transition-all ${STRENGTH_COLORS[strength.score]} ${STRENGTH_WIDTHS[strength.score]}`}
            />
          </div>
          <p className="text-xs font-semibold text-muted">قوة كلمة المرور: {strength.label}</p>
        </div>
      ) : null}

      <Field
        htmlFor="confirmPassword"
        label="تأكيد كلمة المرور الجديدة"
        error={errors.confirmPassword}
        required
      >
        <div className="relative">
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type={show.confirm ? "text" : "password"}
            autoComplete="new-password"
            className="pe-10"
            invalid={Boolean(errors.confirmPassword)}
            disabled={pending}
            required
          />
          <ToggleEye
            shown={show.confirm}
            onClick={() => setShow((value) => ({ ...value, confirm: !value.confirm }))}
            label="إظهار تأكيد كلمة المرور"
          />
        </div>
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
        {pending ? "جارٍ التحديث..." : "تحديث كلمة المرور"}
      </Button>

      <p className="text-xs leading-relaxed text-subtle">
        بعد التغيير سيتم تسجيل الخروج من جميع الأجهزة الأخرى تلقائياً للأمان.
      </p>
    </form>
  );
}

function ToggleEye({
  shown,
  onClick,
  label,
}: {
  shown: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={shown ? "إخفاء" : label}
      className="absolute inset-y-0 end-0 grid w-10 place-items-center text-muted hover:text-ink"
    >
      {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
    </button>
  );
}
