import Link from "next/link";
import { Compass } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-6 text-center">
      <Logo />
      <div className="space-y-2">
        <p className="text-sm font-bold text-brand-dark">404</p>
        <h1 className="text-2xl font-extrabold text-ink">الصفحة غير موجودة</h1>
        <p className="max-w-md text-sm leading-relaxed text-muted">
          الرابط الذي طلبته غير متاح أو تم نقله. يمكنك العودة إلى الرئيسية أو استخدام صفحة
          تتبع الشحنة.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className={buttonVariants("primary", "md")}>
          <Compass className="size-4" aria-hidden />
          الرئيسية
        </Link>
        <Link href="/track" className={buttonVariants("outline", "md")}>
          تتبع شحنتك
        </Link>
      </div>
    </div>
  );
}
