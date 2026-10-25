import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireSession } from "@/server/auth/guards";

export const metadata = { title: "لا تملك صلاحية" };

export default async function AdminUnauthorizedPage() {
  await requireSession();

  return (
    <div className="mx-auto max-w-xl py-10">
      <Card>
        <CardContent className="space-y-5 p-8 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-danger-soft text-danger">
            <ShieldAlert className="size-7" aria-hidden />
          </span>

          <div className="space-y-2">
            <h1 className="text-xl font-extrabold text-ink">لا تملك صلاحية الوصول</h1>
            <p className="text-sm leading-relaxed text-muted">
              دورك الحالي لا يشمل هذا القسم. إن كنت تحتاج إليه لإنجاز عملك، تواصل مع مدير النظام
              لتعديل صلاحياتك.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/admin" className={buttonVariants("primary")}>
              العودة إلى لوحة الإدارة
            </Link>
            <Link href="/dashboard" className={buttonVariants("outline")}>
              بوابة العميل
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
