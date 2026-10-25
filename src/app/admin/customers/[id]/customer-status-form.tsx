"use client";

import { useActionState, useState } from "react";
import { Ban, Loader2, PlayCircle } from "lucide-react";

import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { INITIAL_STATE } from "@/lib/action-state";
import { setCustomerStatusAction } from "@/server/actions/admin";

export function CustomerStatusForm({
  profileId,
  fullName,
  currentStatus,
}: {
  profileId: string;
  fullName: string;
  currentStatus: string;
}) {
  const [state, formAction, pending] = useActionState(setCustomerStatusAction, INITIAL_STATE);
  const [confirming, setConfirming] = useState(false);

  const suspended = currentStatus === "suspended";
  const errors = state?.errors ?? {};

  return (
    <div className="space-y-3">
      {state?.message ? (
        <Alert variant={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      {suspended ? (
        <form action={formAction}>
          <input type="hidden" name="profileId" value={profileId} />
          <input type="hidden" name="action" value="activate" />
          <Button type="submit" variant="success" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PlayCircle className="size-4" aria-hidden />}
            تفعيل الحساب
          </Button>
        </form>
      ) : (
        <>
          {confirming ? (
            <form action={formAction} className="space-y-3">
              <input type="hidden" name="profileId" value={profileId} />
              <input type="hidden" name="action" value="suspend" />
              <Field
                htmlFor="reason"
                label="سبب الإيقاف"
                hint="يُسجَّل السبب في سجل التدقيق ولا يُعرض للعميل"
                error={errors.reason}
                required
              >
                <Textarea
                  id="reason"
                  name="reason"
                  rows={3}
                  placeholder="مثال: مخالفة شروط الاستخدام"
                  invalid={Boolean(errors.reason)}
                  disabled={pending}
                  required
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="danger" disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Ban className="size-4" aria-hidden />}
                  تأكيد الإيقاف
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
                  إلغاء
                </Button>
              </div>
            </form>
          ) : (
            <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
              <Ban className="size-4" aria-hidden />
              إيقاف حساب {fullName}
            </Button>
          )}
        </>
      )}

      <p className="text-xs leading-relaxed text-subtle">
        إيقاف الحساب يُلغي كل الجلسات النشطة فوراً ويمنع تسجيل الدخول حتى إعادة التفعيل. سُجّل
        الإجراء في سجل التدقيق باسمك.
      </p>
    </div>
  );
}
