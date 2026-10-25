"use client";

import { useActionState } from "react";
import { GitBranch, Loader2 } from "lucide-react";

import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { INITIAL_STATE } from "@/lib/action-state";
import { changeShipmentStatusAction } from "@/server/actions/admin";

export type StatusOption = {
  code: string;
  labelAr: string;
  restricted: boolean;
};

/**
 * Status change form. The dropdown only offers transitions the server allows
 * from the shipment's current status; the server re-validates anyway.
 */
export function StatusChangeForm({
  shipmentId,
  currentStatus,
  currentLabel,
  options,
  canUseRestricted,
}: {
  shipmentId: string;
  currentStatus: string;
  currentLabel: string;
  options: StatusOption[];
  canUseRestricted: boolean;
}) {
  const [state, formAction, pending] = useActionState(changeShipmentStatusAction, INITIAL_STATE);
  const errors = state?.errors ?? {};

  const visible = options.filter((option) => canUseRestricted || !option.restricted);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.message ? (
        <Alert variant={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <input type="hidden" name="shipmentId" value={shipmentId} />

      <div className="rounded-lg bg-surface-muted px-3.5 py-2.5 text-[13px] text-muted">
        الحالة الحالية: <span className="font-bold text-ink">{currentLabel}</span>
        <span className="tabular block text-xs text-subtle">{currentStatus}</span>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-line bg-white px-3.5 py-3 text-[13px] leading-relaxed text-muted">
          لا توجد حالات مسموح بها الانتقال إليها من الحالة الحالية. عدّل مصفوفة الانتقالات من
          صفحة «حالات الشحن».
        </p>
      ) : (
        <>
          <Field htmlFor="toStatus" label="الحالة الجديدة" error={errors.toStatus} required>
            <Select
              id="toStatus"
              name="toStatus"
              defaultValue=""
              invalid={Boolean(errors.toStatus)}
              disabled={pending}
              required
            >
              <option value="" disabled>
                اختر الحالة الجديدة
              </option>
              {visible.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.labelAr}
                  {option.restricted ? " (مقيّدة)" : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            htmlFor="location"
            label="الموقع (اختياري)"
            hint="مثال: مطار قوانغتشو، مركز التخليص، مقر التوصيل"
          >
            <Input id="location" name="location" disabled={pending} />
          </Field>

          <Field
            htmlFor="description"
            label="وصف الحدث"
            hint="يظهر للعميل في مسار الشحنة — اكتب وصفاً واضحاً ومحايداً"
            error={errors.description}
            required
          >
            <Textarea
              id="description"
              name="description"
              rows={3}
              placeholder="مثال: تم استلام الشحنة في مستودع قوانغتشو"
              invalid={Boolean(errors.description)}
              disabled={pending}
              required
            />
          </Field>

          <Field
            htmlFor="estimatedDeliveryDate"
            label="موعد تسليم متوقع (اختياري)"
            hint="أدخله فقط إذا كان لديك موعد مؤكد. بصيغة YYYY-MM-DD"
            error={errors.estimatedDeliveryDate}
          >
            <Input
              id="estimatedDeliveryDate"
              name="estimatedDeliveryDate"
              type="date"
              dir="ltr"
              disabled={pending}
            />
          </Field>

          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <GitBranch className="size-4" aria-hidden />}
            {pending ? "جارٍ التحديث..." : "تطبيق الحالة الجديدة"}
          </Button>

          <p className="text-xs leading-relaxed text-subtle">
            يُسجَّل كل تغيير في سجل التدقيق باسمك، ويُنبَّه العميل بإشعار فوري. لا تُدخل موعداً
            متوقعاً غير مؤكد.
          </p>
        </>
      )}
    </form>
  );
}
