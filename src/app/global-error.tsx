"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-6 text-center">
          <Logo />
          <div className="space-y-2">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
              <AlertTriangle className="size-6" aria-hidden />
            </span>
            <h1 className="text-xl font-extrabold text-ink">حدث خطأ غير متوقع</h1>
            <p className="max-w-md text-sm leading-relaxed text-muted">
              تعذّر إكمال الطلب حالياً. بياناتك لم تتأثر، يمكنك إعادة المحاولة.
            </p>
          </div>
          <button type="button" onClick={reset} className={buttonVariants("primary", "md")}>
            <RotateCcw className="size-4" aria-hidden />
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
