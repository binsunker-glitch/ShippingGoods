import Link from "next/link";
import { Suspense } from "react";

import { LoginForm } from "./login-form";

export const metadata = { title: "تسجيل الدخول" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold text-ink">تسجيل الدخول</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          ادخل إلى حسابك لمتابعة طرودك وشحناتك.
        </p>
      </div>

      <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-7">
        {/* searchParams is request-time data; the card frame stays prerendered. */}
        <Suspense
          fallback={<div className="skeleton-fill h-64 rounded-lg" aria-hidden />}
        >
          <LoginPanel searchParams={searchParams} />
        </Suspense>
      </div>

      <p className="mt-5 text-center text-sm text-muted">
        ليس لديك حساب؟{" "}
        <Link href="/register" className="font-bold text-brand-dark hover:underline">
          إنشاء حساب جديد
        </Link>
      </p>
    </div>
  );
}

async function LoginPanel({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const resetDone = params.reset === "1";
  return <LoginForm resetDone={resetDone} />;
}
