import { Shield, Search } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/server/auth/guards";
import { listAuditLogs } from "@/server/queries/admin";

export const metadata = { title: "سجل التدقيق" };

/** Human labels for the most common audit actions; the raw code stays visible. */
const ACTION_LABELS: Record<string, string> = {
  "customer.registered": "تسجيل حساب جديد",
  "auth.login": "تسجيل دخول",
  "auth.login_denied_suspended": "منع دخول حساب موقوف",
  "auth.password_changed": "تغيير كلمة المرور",
  "auth.password_reset_requested": "طلب إعادة تعيين كلمة المرور",
  "auth.password_reset_completed": "إتمام إعادة تعيين كلمة المرور",
  "shipment.claim.submitted": "طلب ربط شحنة",
  "shipment.claim.rejected_owner_mismatch": "رفض طلب ربط (عدم تطابق الملكية)",
  "shipment.claim.approved": "اعتماد ربط شحنة",
  "shipment.claim.rejected": "رفض طلب ربط شحنة",
  "shipment.status_changed": "تغيير حالة شحنة",
  "payment.recorded": "تسجيل دفعة",
  "customer.suspended": "إيقاف حساب عميل",
  "customer.activated": "تفعيل حساب عميل",
  "package.registered": "تسجيل طرد في المستودع",
  "package.received": "استلام طرد",
  "support.ticket.created": "فتح تذكرة دعم",
  "support.ticket.replied": "الرد على تذكرة",
  "address.created": "إضافة عنوان",
  "address.updated": "تعديل عنوان",
  "address.deleted": "حذف عنوان",
  "address.set_default": "تعيين عنوان افتراضي",
  "status.transition_enabled": "تفعيل انتقال حالة",
  "status.transition_disabled": "إيقاف انتقال حالة",
  "status.transition_added": "إضافة انتقال حالة",
};

type Search = { q?: string; page?: string };

export default async function AdminAuditPage({
  searchParams,
}: PageProps<"/admin/audit">) {
  await requirePermission("audit.read");
  const sp = await searchParams;

  const search: Search = {
    q: typeof sp.q === "string" ? sp.q.trim() : "",
    page: typeof sp.page === "string" ? sp.page : "1",
  };

  const result = await listAuditLogs({
    q: search.q || undefined,
    page: Number(search.page) || 1,
    perPage: 20,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="سجل التدقيق"
        description="كل إجراء حسّاس منسوب به صاحبه ووقته: تغييرات الحالات، المدفوعات، إيقاف الحسابات، ربط الشحنات، وعمليات المستودع."
      />

      <Card>
        <CardContent className="space-y-4">
          <form className="relative max-w-xl" role="search">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              type="search"
              name="q"
              defaultValue={search.q}
              placeholder="ابحث بالإجراء أو اسم الموظف أو نوع السجل..."
              className="ps-9"
              aria-label="بحث في سجل التدقيق"
            />
          </form>

          <p className="text-[13px] text-muted">
            إجمالي <span className="tabular font-bold">{result.total}</span> حدث
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {result.rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Shield}
                title="لا توجد أحداث"
                description={
                  search.q
                    ? "جرّب عبارة بحث أخرى."
                    : "لم يُسجَّل أي حدث في سجل التدقيق بعد."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[900px]">
                <thead>
                  <tr>
                    <Th>الوقت</Th>
                    <Th>المنفّذ</Th>
                    <Th>الإجراء</Th>
                    <Th>السجل</Th>
                    <Th>التفاصيل</Th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((entry) => (
                    <Tr key={entry.id}>
                      <Td className="tabular whitespace-nowrap text-muted">
                        {formatDateTime(entry.createdAt)}
                      </Td>
                      <Td className="whitespace-nowrap font-bold">
                        {entry.actorLabel ?? "نظام"}
                      </Td>
                      <Td className="whitespace-nowrap">
                        <span className="text-[13px] font-bold text-ink">
                          {ACTION_LABELS[entry.action] ?? entry.action}
                        </span>
                        <span className="tabular block text-xs text-subtle">{entry.action}</span>
                      </Td>
                      <Td className="tabular whitespace-nowrap text-muted">
                        {entry.entityType}
                        <span className="block max-w-40 truncate text-xs text-subtle">
                          {entry.entityId ?? "—"}
                        </span>
                      </Td>
                      <Td className="max-w-72">
                        {entry.metadata ? (
                          <code className="line-clamp-3 block rounded-lg bg-surface-muted px-2.5 py-2 text-xs break-all text-muted">
                            {JSON.stringify(entry.metadata)}
                          </code>
                        ) : (
                          <span className="text-xs text-subtle">—</span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            basePath="/admin/audit"
            params={{ q: search.q || undefined }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
