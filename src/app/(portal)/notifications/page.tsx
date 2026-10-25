import Link from "next/link";
import { Bell, CheckCheck, Info, PackageCheck, TriangleAlert } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { formatRelative } from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import { listNotifications } from "@/server/queries/customer";
import { MarkAllReadButton, MarkReadButton } from "./notification-actions";

export const metadata = { title: "الإشعارات" };

const TYPE_STYLES: Record<string, string> = {
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

const TYPE_ICONS: Record<string, typeof Info> = {
  info: Info,
  success: PackageCheck,
  warning: TriangleAlert,
  danger: TriangleAlert,
};

export default async function NotificationsPage({
  searchParams,
}: PageProps<"/notifications">) {
  const session = await requireCustomer();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const result = await listNotifications(session.profileId, { page, perPage: 20 });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-ink sm:text-2xl">الإشعارات</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            تحديثات حالة شحناتك وطلباتك، {" "}
            {result.unreadCount > 0 ? (
              <span className="font-bold text-ink">
                لديك {result.unreadCount} إشعار غير مقروء.
              </span>
            ) : (
              <span>لا توجد إشعارات غير مقروءة.</span>
            )}
          </p>
        </div>
        {result.unreadCount > 0 ? <MarkAllReadButton /> : null}
      </div>

      {result.rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="لا توجد إشعارات بعد"
          description="ستصلك هنا إشعارات عند تحديث حالة شحناتك أو الرد على طلباتك."
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-line p-0">
            {result.rows.map((notification) => {
              const Icon = TYPE_ICONS[notification.notificationType] ?? Info;
              const unread = notification.readAt === null;
              return (
                <div
                  key={notification.id}
                  className={`flex items-start gap-3 px-5 py-4 ${unread ? "bg-brand-soft/30" : ""}`}
                >
                  <span
                    className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${
                      TYPE_STYLES[notification.notificationType] ?? TYPE_STYLES.info
                    }`}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-sm ${unread ? "font-extrabold text-ink" : "font-bold text-ink"}`}>
                        {notification.title}
                      </p>
                      {unread ? (
                        <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden />
                      ) : null}
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">
                      {notification.message}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <span className="text-xs text-subtle">
                        {formatRelative(notification.createdAt)}
                      </span>
                      {notification.link ? (
                        <Link
                          href={notification.link}
                          className="text-xs font-bold text-brand-dark hover:underline"
                        >
                          عرض التفاصيل
                        </Link>
                      ) : null}
                      {unread ? <MarkReadButton id={notification.id} /> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {result.totalPages > 1 ? (
        <nav
          aria-label="التنقل بين الصفحات"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-[13px] text-muted">
            صفحة <span className="tabular font-bold">{result.page}</span> من{" "}
            <span className="tabular font-bold">{result.totalPages}</span>
          </p>
          <div className="flex items-center gap-2">
            {result.page > 1 ? (
              <Link
                href={result.page > 2 ? `?page=${result.page - 1}` : "?"}
                className={buttonVariants("outline", "sm")}
              >
                السابقة
              </Link>
            ) : null}
            {result.page < result.totalPages ? (
              <Link href={`?page=${result.page + 1}`} className={buttonVariants("outline", "sm")}>
                التالية
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}

      {result.rows.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-subtle">
          <CheckCheck className="size-3.5" aria-hidden />
          يتم الاحتفاظ بالإشعارات ضمن سياسة الاحتفاظ ببيانات العملاء، ويمكن حذفها من قبل
          الإدارة وفقاً للأنظمة.
        </p>
      ) : null}
    </div>
  );
}
