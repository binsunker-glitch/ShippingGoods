"use client";

import { useActionState } from "react";
import { Loader2, Send } from "lucide-react";

import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { INITIAL_STATE } from "@/lib/action-state";
import { createTicketAction } from "@/server/actions/support";

export function TicketForm() {
  const [state, formAction, pending] = useActionState(createTicketAction, INITIAL_STATE);
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.message ? (
        <Alert variant={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <Field htmlFor="subject" label="الموضوع" error={errors.subject} required>
        <Input
          id="subject"
          name="subject"
          placeholder="مثال: استفسار عن رسوم شحنة"
          defaultValue={state?.data?.subject ?? ""}
          invalid={Boolean(errors.subject)}
          disabled={pending}
          required
        />
      </Field>

      <Field htmlFor="priority" label="الأولوية" error={errors.priority}>
        <Select
          id="priority"
          name="priority"
          defaultValue={state?.data?.priority ?? "normal"}
          disabled={pending}
        >
          <option value="low">منخفضة</option>
          <option value="normal">عادية</option>
          <option value="high">عالية</option>
          <option value="urgent">عاجلة</option>
        </Select>
      </Field>

      <Field
        htmlFor="description"
        label="تفاصيل الطلب"
        hint="اذكر رقم الشحنة إن وُجد، واشرح طلبك بالتفصيل"
        error={errors.description}
        required
      >
        <Textarea
          id="description"
          name="description"
          rows={5}
          placeholder="اشرح طلبك هنا..."
          defaultValue={state?.data?.description ?? ""}
          invalid={Boolean(errors.description)}
          disabled={pending}
          required
        />
      </Field>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
        {pending ? "جارٍ الإرسال..." : "إرسال الطلب"}
      </Button>
    </form>
  );
}
