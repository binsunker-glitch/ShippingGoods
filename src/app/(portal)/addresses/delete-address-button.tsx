"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";

import { deleteAddressAction } from "@/server/actions/addresses";

/**
 * Delete is blocked by the server when the address is locked to an active
 * shipment, so the button stays enabled and surfaces the returned message.
 */
export function DeleteAddressButton({
  id,
  recipientName,
  disabled,
}: {
  id: string;
  recipientName: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(deleteAddressAction, null);

  return (
    <div className="flex flex-col items-end gap-1">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (!window.confirm(`هل تريد حذف عنوان "${recipientName}"؟`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={disabled || pending}
          aria-label="حذف العنوان"
          title={
            disabled
              ? "لا يمكن حذف عنوان مرتبط بشحنة نشطة"
              : "حذف العنوان"
          }
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </form>
      {state && !state.ok && state.message ? (
        <p className="max-w-48 text-end text-[11px] leading-tight font-semibold text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
