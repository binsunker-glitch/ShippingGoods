"use client";

import { useActionState } from "react";
import { Link2, Loader2 } from "lucide-react";

import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { INITIAL_STATE } from "@/lib/action-state";
import { submitClaimAction } from "@/server/actions/claims";

export function ClaimForm() {
  const [state, formAction, pending] = useActionState(submitClaimAction, INITIAL_STATE);
  const errors = state?.errors ?? {};
  const verified = state?.ok && state.data?.status === "verified";

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.message ? (
        <Alert variant={state.ok ? "success" : "danger"} title={state.ok ? undefined : "تعذّر إتمام الطلب"}>
          {state.message}
        </Alert>
      ) : null}

      {verified ? (
        <Alert variant="success" title="تم التحقق تلقائياً">
          طابقنا رقم جوال الشحنة مع رقم جوال حسابك، لذلك ربطنا الشحنة بحسابك مباشرة. ستجدها في
          صفحة شحناتي الآن.
        </Alert>
      ) : null}

      <div className="rounded-xl border border-line bg-surface-muted p-4">
        <p className="text-[13px] leading-relaxed text-muted">
          معرفة رقم التتبع وحدها لا تكفي لربط الشحنة بحسابك. نتحقق من ملكية الشحنة أولاً، وإذا لم
          نتمكن من التحقق آلياً سيصل طلبك إلى فريقنا للمراجعة.
        </p>
      </div>

      <Field
        htmlFor="shipmentTrackingNumber"
        label="رقم تتبع الشحنة (رقمنا)"
        hint="يبدأ بـ WAS- مثلاً WAS-2026-000123"
        error={errors.shipmentTrackingNumber}
      >
        <Input
          id="shipmentTrackingNumber"
          name="shipmentTrackingNumber"
          dir="ltr"
          placeholder="WAS-2026-000123"
          defaultValue={state?.data?.shipmentTrackingNumber ?? ""}
          invalid={Boolean(errors.shipmentTrackingNumber)}
          disabled={pending}
        />
      </Field>

      <Field
        htmlFor="carrierTrackingNumber"
        label="رقم تتبّع الناقل (اختياري)"
        hint="رقم التتبع من متجرك أو شركة الشحن في الصين"
        error={errors.carrierTrackingNumber}
      >
        <Input
          id="carrierTrackingNumber"
          name="carrierTrackingNumber"
          dir="ltr"
          placeholder="SF1234567890"
          defaultValue={state?.data?.carrierTrackingNumber ?? ""}
          disabled={pending}
        />
      </Field>

      <Field
        htmlFor="description"
        label="وصف محتوى الشحنة (اختياري)"
        hint="كلما كان الوصف أدق، تسارع التحقق من الملكية"
        error={errors.description}
      >
        <Textarea
          id="description"
          name="description"
          rows={3}
          placeholder="مثال: قطعة ملابس من متجر كذا"
          defaultValue={state?.data?.description ?? ""}
          disabled={pending}
        />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
        {pending ? "جارٍ إرسال الطلب..." : "إرسال طلب الربط"}
      </Button>

      <p className="text-xs leading-relaxed text-subtle">
        بإرسال هذا الطلب أنت تؤكد أن الشحنة تخصك. قد نطلب إثبات الشراء في حالات معينة قبل فتح
        الشحنة لحسابك.
      </p>
    </form>
  );
}
