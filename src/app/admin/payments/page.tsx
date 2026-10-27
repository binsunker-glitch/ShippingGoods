import Link from "next/link";
import { CreditCard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { BadgeVariant } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { requirePermission } from "@/server/auth/guards";
import { listAllPayments } from "@/server/queries/admin";

export const metadata = { title: "المدفوعات" };

/** Payment-row states (schema PAYMENT_ROWS_STATUSES) — not the shipment's state. */
const RECORD_STATUS_LABELS: Record<string, string> = {
  pending: "بانتظار التحقق",
  completed: "مكتملة",
  failed: "فشل",
  refunded: "مستردة",
};

const RECORD_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  pending: "warning",
  completed: "success",
  failed: "danger",
  refunded: "neutral",
};

const TABS = [
  { label: "الكل", value: "all" },
  { label: "مكتملة", value: "verified" },
  { label: "بانتظار التحقق", value: "pending" },
  { label: "فشلت", value: "failed" },
  { label: "مستردة", value: "refunded" },
];

type Search = { status?: string; page?: string };

function buildHref(base: Search, patch: Partial<Search>) {
  const merged = { ...base, ...patch };
  const params = new URLSearchParams();
  if (merged.status && merged.status !== "all") params.set("status", merged.status);
  const pageNum = Number(merged.page ?? 1);
  if (pageNum > 1) params.set("page", String(pageNum));
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

export default async function AdminPaymentsPage({
  searchParams,
}: PageProps<"/admin/payments">) {
  await requirePermission("payments.read");
  const sp = await searchParams;

  const search: Search = {
    status: typeof sp.status === "string" ? sp.status : "all",
    page: typeof sp.page === "string" ? sp.page : "1",
  };

  const result = await listAllPayments({
    status: search.status,
    page: Number(search.page) || 1,
    perPage: 15,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="المدفوعات"
        description="كل دفعة مسجّلة مقابل شحنة، مع مصدر التسجيل. تُسجَّل الدفعات اليدوية من صفحة الشحنة، ولا يحتفظ النظام بأي بيانات بطاقات."
      />

      <Card>
        <CardContent className="space-y-4">
          <nav aria-label="تصفية حسب حالة الدفعة" className="flex flex-wrap gap-2">
            {TABS.map((tab) => {
              const active = search.status === tab.value;
              return (
                <Link
                  key={tab.value}
                  href={buildHref(search, { status: tab.value, page: "1" })}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
                    active
                      ? "border-navy bg-navy text-white"
                      : "border-line-strong bg-white text-muted hover:bg-surface-muted hover:text-ink",
                  ].join(" ")}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <p className="text-[13px] text-muted">
            إجمالي <span className="tabular font-bold">{result.total}</span> دفعة
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {result.rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={CreditCard}
                title="لا توجد مدفوعات"
                description={
                  search.status !== "all"
                    ? "جرّب تغيير التصفية لعرض دفعات أخرى."
                    : "لم تُسجَّل أي دفعة في النظام بعد."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[980px]">
                <thead>
                  <tr>
                    <Th>المبلغ</Th>
                    <Th>الطريقة</Th>
                    <Th>الحالة</Th>
                    <Th>المرجع</Th>
                    <Th>الشحنة</Th>
                    <Th>العميل</Th>
                    <Th>تاريخ التسجيل</Th>
                    <Th className="text-end"> </Th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((payment) => (
                    <Tr key={payment.id}>
                      <Td className="tabular whitespace-nowrap font-bold">
                        {formatCurrency(payment.amount, payment.currency)}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{payment.paymentMethod}</Td>
                      <Td>
                        <Badge
                          variant={RECORD_STATUS_VARIANTS[payment.paymentStatus] ?? "neutral"}
                        >
                          {RECORD_STATUS_LABELS[payment.paymentStatus] ?? payment.paymentStatus}
                        </Badge>
                      </Td>
                      <Td className="tabular max-w-44 truncate text-muted">
                        {payment.transactionReference ?? "—"}
                      </Td>
                      <Td className="tabular whitespace-nowrap">
                        <Link
                          href={`/admin/shipments/${payment.shipmentId}`}
                          className="font-bold text-brand-dark hover:underline"
                        >
                          {payment.trackingNumber}
                        </Link>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {payment.customerId ? (
                          <Link
                            href={`/admin/customers/${payment.customerId}`}
                            className="text-[13px] font-bold text-brand-dark hover:underline"
                          >
                            {payment.customerName}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {payment.customerNumber ? (
                          <span className="tabular block text-xs text-muted">
                            {payment.customerNumber}
                          </span>
                        ) : null}
                      </Td>
                      <Td className="tabular whitespace-nowrap text-muted">
                        {formatDateTime(payment.recordedAt)}
                      </Td>
                      <Td className="text-end">
                        <Link
                          href={`/admin/shipments/${payment.shipmentId}`}
                          className={buttonVariants("outline", "sm")}
                        >
                          الشحنة
                        </Link>
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
            basePath="/admin/payments"
            params={{ status: search.status === "all" ? undefined : search.status }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
