"use client";

import { useActionState } from "react";
import { Banknote, Loader2 } from "lucide-react";

import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { INITIAL_STATE } from "@/lib/action-state";
import { recordPaymentAction } from "@/server/actions/admin";

/**
 * Records an offline / manually verified payment. The gateway path is separate
 * and only available once a provider is configured; this form never touches
 * card data.
 */
export function PaymentForm({
  shipmentId,
  trackingNumber,
  shippingFee,
}: {
  shipmentId: string;
  trackingNumber: string;
  shippingFee: string | null;
  canSetFees?: boolean;
}) {
  const [state, formAction, pending] = useActionState(recordPaymentAction, INITIAL_STATE);
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.message ? (
        <Alert variant={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <input type="hidden" name="shipmentId" value={shipmentId} />

      <div className="rounded-lg bg-surface-muted px-3.5 py-2.5 text-[13px] text-muted">
        الشحنة: <span className="tabular font-bold text-ink">{trackingNumber}</span>
        {shippingFee ? (
          <span className="tabular mt-1 block">
            الرسوم المحددة: {Number(shippingFee).toLocaleString("en-US")} ر.س
          </span>
        ) : (
          <span className="mt-1 block">لم تُحدَّد رسوم لهذه الشحنة بعد.</span>
        )}
      </div>

      <Field htmlFor="amount" label="المبلغ المستلم (ر.س)" error={errors.amount} required>
        <Input
          id="amount"
          name="amount"
          inputMode="decimal"
          dir="ltr"
          placeholder="250.00"
          invalid={Boolean(errors.amount)}
          disabled={pending}
          required
        />
      </Field>

      <Field htmlFor="paymentMethod" label="طريقة الدفع" error={errors.paymentMethod} required>
        <Select
          id="paymentMethod"
          name="paymentMethod"
          defaultValue="bank_transfer"
          invalid={Boolean(errors.paymentMethod)}
          disabled={pending}
          required
        >
          <option value="bank_transfer">تحويل بنكي</option>
          <option value="cash">نقداً في المقر</option>
          <option value="mada">مدى</option>
          <option value="apple_pay">Apple Pay</option>
          <option value="other">أخرى (يُذكر في الملاحظات)</option>
        </Select>
      </Field>

      <Field
        htmlFor="transactionReference"
        label="مرجع العملية (اختياري)"
        hint="رقم الحوالة أو رقم المرجع من الإيصال"
      >
        <Input id="transactionReference" name="transactionReference" dir="ltr" disabled={pending} />
      </Field>

      <Field htmlFor="notes" label="ملاحظات (اختيارية)">
        <Textarea id="notes" name="notes" rows={2} disabled={pending} />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Banknote className="size-4" aria-hidden />}
        {pending ? "جارٍ التسجيل..." : "تسجيل الدفعة"}
      </Button>

      <p className="text-xs leading-relaxed text-subtle">
        يُسجَّل هذا الدفعة يدوياً بعد تحقق الموظف المالي منها. لا تُخزَّن أي بيانات بطاقات في
        النظام، ويُسجَّل الإجراء في سجل التدقيق.
      </p>
    </form>
  );
}
