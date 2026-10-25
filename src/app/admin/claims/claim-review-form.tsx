"use client";

import { useActionState } from "react";
import { Check, Loader2, X } from "lucide-react";

import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { INITIAL_STATE } from "@/lib/action-state";
import { reviewClaimAction } from "@/server/actions/admin";

export function ClaimReviewForm({
  claimId,
  trackingNumber,
}: {
  claimId: string;
  trackingNumber: string | null;
}) {
  const [state, formAction, pending] = useActionState(reviewClaimAction, INITIAL_STATE);
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {state?.message ? <Alert variant={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}

      <Field
        htmlFor="reviewNote"
        label="ملاحظة المراجعة (اختيارية)"
        hint="تظهر للعميل مع قرار الربط"
        error={errors.reviewNote}
      >
        <Textarea
          id="reviewNote"
          name="reviewNote"
          rows={2}
          placeholder="مثال: تم التحقق من إثبات الشراء"
          disabled={pending}
        />
      </Field>

      <input type="hidden" name="claimId" value={claimId} />
      {trackingNumber ? (
        <input type="hidden" name="shipmentTrackingNumber" value={trackingNumber} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approve" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
          اعتماد وربط
        </Button>
        <Button type="submit" name="decision" value="reject" variant="danger" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <X className="size-4" aria-hidden />}
          رفض
        </Button>
      </div>
    </form>
  );
}
