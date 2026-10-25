"use client";

import { Check, CheckCheck } from "lucide-react";

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/server/actions/support";

/**
 * Marking a notification read is a mutation, so it goes through a server
 * action form — never a client-side state flip.
 */
export function MarkReadButton({ id }: { id: string }) {
  return (
    <form action={markNotificationReadAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-muted transition-colors hover:bg-surface-muted hover:text-ink"
      >
        <Check className="size-3" aria-hidden />
        تعليم كمقروء
      </button>
    </form>
  );
}

export function MarkAllReadButton() {
  return (
    <form action={markAllNotificationsReadAction}>
      <button
        type="submit"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-white px-4 text-[13px] font-bold text-ink transition-colors hover:bg-surface-muted"
      >
        <CheckCheck className="size-4" aria-hidden />
        تعليم الكل كمقروء
      </button>
    </form>
  );
}
