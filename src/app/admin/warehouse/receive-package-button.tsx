"use client";

import { useTransition } from "react";
import { PackageCheck } from "lucide-react";

import { receivePackageAction } from "@/server/actions/admin";

/** Marks a registered package as physically received in the warehouse. */
export function ReceivePackageButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => startTransition(() => receivePackageAction(formData))}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
      >
        <PackageCheck className="size-3.5" aria-hidden />
        {pending ? "جارٍ التسجيل..." : "تسجيل الاستلام"}
      </button>
    </form>
  );
}
