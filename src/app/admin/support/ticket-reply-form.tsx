"use client";

import { useActionState } from "react";
import { Loader2, Send } from "lucide-react";

import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { INITIAL_STATE } from "@/lib/action-state";
import { replyTicketAction } from "@/server/actions/admin";

/** Staff reply box for one support ticket. Sets the ticket to "answered". */
export function TicketReplyForm({
  ticketId,
  existingReply,
}: {
  ticketId: string;
  existingReply: string | null;
}) {
  const [state, formAction, pending] = useActionState(replyTicketAction, INITIAL_STATE);
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {state?.message ? (
        <Alert variant={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <input type="hidden" name="ticketId" value={ticketId} />

      <Field
        htmlFor="reply"
        label="الرد على العميل"
        hint="يظهر الرد للعميل في صفحة المساعدة مع إشعار فوري"
        error={errors.reply}
        required
      >
        <Textarea
          id="reply"
          name="reply"
          rows={4}
          defaultValue={existingReply ?? ""}
          placeholder="اكتب رداً واضحاً ومفيداً..."
          invalid={Boolean(errors.reply)}
          disabled={pending}
          required
        />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Send className="size-4" aria-hidden />
        )}
        {pending ? "جارٍ الإرسال..." : "إرسال الرد"}
      </Button>
    </form>
  );
}
