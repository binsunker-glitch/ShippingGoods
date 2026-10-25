"use client";

import { useActionState, useState } from "react";
import { PackagePlus, Loader2, X } from "lucide-react";

import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { INITIAL_STATE } from "@/lib/action-state";
import { registerPackageAction } from "@/server/actions/admin";

export function RegisterPackageForm() {
  const [state, formAction, pending] = useActionState(registerPackageAction, INITIAL_STATE);
  const [open, setOpen] = useState(false);
  const errors = state?.errors ?? {};

  return (
    <div className="space-y-3">
      {open ? (
        <form action={formAction} className="space-y-4 rounded-card border border-line bg-white p-4">
          {state?.message ? (
            <Alert variant={state.ok ? "success" : "danger"}>{state.message}</Alert>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-bold text-ink">تسجيل طرد جديد</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="إغلاق"
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-muted hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              htmlFor="customerNumber"
              label="رقم العميل"
              hint="مثال: WA-100001"
              error={errors.customerNumber}
              required
            >
              <Input
                id="customerNumber"
                name="customerNumber"
                dir="ltr"
                placeholder="WA-100001"
                invalid={Boolean(errors.customerNumber)}
                disabled={pending}
                required
              />
            </Field>

            <Field
              htmlFor="carrierTrackingNumber"
              label="رقم تتبّع الناقل (اختياري)"
              hint="رقم التتبع من المتجر في الصين"
            >
              <Input id="carrierTrackingNumber" name="carrierTrackingNumber" dir="ltr" disabled={pending} />
            </Field>

            <Field htmlFor="weight" label="الوزن بالكيلوجرام (اختياري)" error={errors.weight}>
              <Input
                id="weight"
                name="weight"
                inputMode="decimal"
                dir="ltr"
                placeholder="1.250"
                invalid={Boolean(errors.weight)}
                disabled={pending}
              />
            </Field>

            <Field htmlFor="dimensions" label="الأبعاد (اختياري)">
              <Input id="dimensions" name="dimensions" placeholder="30x20x10 سم" disabled={pending} />
            </Field>
          </div>

          <Field htmlFor="description" label="وصف المحتوى (اختياري)">
            <Textarea id="description" name="description" rows={2} disabled={pending} />
          </Field>

          <Field htmlFor="notes" label="ملاحظات داخلية (اختيارية)">
            <Textarea id="notes" name="notes" rows={2} disabled={pending} />
          </Field>

          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PackagePlus className="size-4" aria-hidden />}
            {pending ? "جارٍ التسجيل..." : "تسجيل الطرد"}
          </Button>
        </form>
      ) : (
        <Button type="button" onClick={() => setOpen(true)}>
          <PackagePlus className="size-4" aria-hidden />
          تسجيل طرد جديد
        </Button>
      )}
    </div>
  );
}
