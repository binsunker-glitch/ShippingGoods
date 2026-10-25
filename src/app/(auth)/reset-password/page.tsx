import Link from "next/link";
import { Suspense } from "react";
import { ShieldAlert } from "lucide-react";

import { ResetPasswordForm } from "./reset-password-form";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "إعادة تعيين كلمة المرور" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold text-ink">تعيين كلمة مرور جديدة</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          اختر كلمة مرور جديدة قوية لحسابك.
        </p>
      </div>

      <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-7">
        {/* searchParams is request-time data; the card frame stays prerendered. */}
        <Suspense
          fallback={<div className="skeleton-fill h-56 rounded-lg" aria-hidden />}
        >
          <ResetTokenPanel searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function ResetTokenPanel({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-warning-soft text-warning">
          <ShieldAlert className="size-6" aria-hidden />
        </span>
        <p className="text-sm leading-relaxed text-muted">
          رابط إعادة التعيين غير موجود. اطلب رابطاً جديداً من صفحة استعادة كلمة المرور.
        </p>
        <Link href="/forgot-password" className={buttonVariants("primary", "md")}>
          طلب رابط جديد
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
