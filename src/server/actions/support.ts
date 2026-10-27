"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { fieldErrors, ticketSchema } from "@/lib/validation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/server/audit";
import { requireCustomerAction } from "@/server/auth/guards";
import { nextTicketNumber } from "@/server/ids";
import { rateLimit } from "@/server/rate-limit";

function readForm(formData: FormData) {
  return {
    subject: String(formData.get("subject") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    priority: String(formData.get("priority") ?? "normal"),
  };
}

/** Create a support ticket from the help center. */
export async function createTicketAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCustomerAction();
  if (!session) return { ok: false, message: "انتهت الجلسة. سجّل الدخول مجدداً." };

  const limit = rateLimit(`ticket:${session.profileId}`, 5, 60 * 60 * 1000);
  if (!limit.ok) {
    return { ok: false, message: "عدد كبير من الطلبات. حاول مرة أخرى لاحقاً." };
  }

  const raw = readForm(formData);
  const parsed = ticketSchema.safeParse({
    ...raw,
    priority: ["low", "normal", "high", "urgent"].includes(raw.priority)
      ? raw.priority
      : "normal",
  });
  if (!parsed.success) {
    const echo: Record<string, string> = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, String(value)]),
    );
    return {
      ok: false,
      message: "راجع الحقول المحددة.",
      errors: fieldErrors(parsed.error),
      data: echo,
    };
  }

  const supabase = await createClient();
  try {
    const ticketNumber = await nextTicketNumber();
    const { data, error } = await supabase
      .from("support_tickets")
      .insert({
        customer_id: session.profileId,
        ticket_number: ticketNumber,
        subject: parsed.data.subject,
        description: parsed.data.description,
        status: "open",
        priority: parsed.data.priority,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await logAudit({
      actorId: session.profileId,
      actorLabel: session.fullName,
      action: "support.ticket.created",
      entityType: "support_ticket",
      entityId: data.id,
      metadata: { ticketNumber, priority: parsed.data.priority },
    });

    revalidatePath("/help");
    return {
      ok: true,
      message: `تم إنشاء التذكرة رقم ${ticketNumber}. سيتواصل معك فريق الدعم عبر الإشعارات.`,
    };
  } catch (error) {
    console.error("[support] create ticket failed", error);
    return { ok: false, message: "تعذّر إنشاء التذكرة. حاول مرة أخرى." };
  }
}

/** Mark a single notification as read (owner-scoped: IDOR protected). */
export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const session = await requireCustomerAction();
  if (!session) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("customer_id", session.profileId);

  revalidatePath("/notifications");
}

/** Mark every unread notification of the caller as read. */
export async function markAllNotificationsReadAction(): Promise<void> {
  const session = await requireCustomerAction();
  if (!session) return;

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("customer_id", session.profileId)
    .is("read_at", null);

  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}
