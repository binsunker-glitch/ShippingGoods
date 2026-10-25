import Link from "next/link";
import { Package, Search } from "lucide-react";

import { StatusBadge } from "@/components/shipment/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_VARIANTS,
  SHIPMENT_TABS,
} from "@/lib/constants";
import { formatRelative, formatWeight } from "@/lib/format";
import { requirePermission } from "@/server/auth/guards";
import { listAllShipments } from "@/server/queries/admin";

export const metadata = { title: "إدارة الشحنات" };

type Search = { q?: string; group?: string; page?: string };

function buildHref(base: Search, patch: Partial<Search>) {
  const merged = { ...base, ...patch };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.group && merged.group !== "all") params.set("group", merged.group);
  const pageNum = Number(merged.page ?? 1);
  if (pageNum > 1) params.set("page", String(pageNum));
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

export default async function AdminShipmentsPage({
  searchParams,
}: PageProps<"/admin/shipments">) {
  await requirePermission("shipments.read");
  const sp = await searchParams;

  const search: Search = {
    q: typeof sp.q === "string" ? sp.q.trim() : "",
    group: typeof sp.group === "string" ? sp.group : "all",
    page: typeof sp.page === "string" ? sp.page : "1",
  };

  const result = await listAllShipments({
    q: search.q || undefined,
    group: search.group,
    page: Number(search.page) || 1,
    perPage: 15,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="إدارة الشحنات"
        description="ابحث في كل شحنات الشركة وافتح أي شحنة لتغيير حالتها أو تسجيل رسوم أو دفعات."
      />

      <Card>
        <CardContent className="space-y-4">
          <nav aria-label="تصفية حسب المجموعة" className="flex flex-wrap gap-2">
            {SHIPMENT_TABS.map((tab) => {
              const active = search.group === tab.value;
              return (
                <Link
                  key={tab.value}
                  href={buildHref(search, { group: tab.value, page: "1" })}
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

          <form className="relative max-w-xl" role="search">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              type="search"
              name="q"
              defaultValue={search.q}
              placeholder="ابحث برقم التتبع أو الوصف أو رقم العميل أو اسمه..."
              className="ps-9"
              aria-label="بحث في الشحنات"
            />
          </form>

          <p className="text-[13px] text-muted">
            إجمالي <span className="tabular font-bold">{result.total}</span> شحنة
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {result.rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Package}
                title="لا توجد شحنات"
                description={
                  search.q || search.group !== "all"
                    ? "جرّب تعديل البحث أو التصفية."
                    : "لم تُسجَّل أي شحنة في النظام بعد."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1080px]">
                <thead>
                  <tr>
                    <Th>رقم التتبع</Th>
                    <Th>العميل</Th>
                    <Th>الوصف</Th>
                    <Th>الحالة</Th>
                    <Th>الوزن</Th>
                    <Th>الرسوم</Th>
                    <Th>الدفع</Th>
                    <Th>الوجهة</Th>
                    <Th>آخر تحديث</Th>
                    <Th className="text-end"> </Th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((shipment) => (
                    <Tr key={shipment.id}>
                      <Td>
                        <span className="tabular font-bold">{shipment.trackingNumber}</span>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {shipment.customerId ? (
                          <Link
                            href={`/admin/customers/${shipment.customerId}`}
                            className="text-[13px] font-bold text-brand-dark hover:underline"
                          >
                            {shipment.customerName}
                          </Link>
                        ) : (
                          <Badge variant="warning">غير مرتبط</Badge>
                        )}
                        {shipment.customerNumber ? (
                          <span className="tabular block text-xs text-muted">
                            {shipment.customerNumber}
                          </span>
                        ) : null}
                      </Td>
                      <Td className="max-w-56">
                        <span className="line-clamp-2 text-muted">{shipment.description}</span>
                      </Td>
                      <Td>
                        <StatusBadge status={shipment.currentStatus} group={shipment.statusGroup} />
                      </Td>
                      <Td className="tabular whitespace-nowrap text-muted">
                        {formatWeight(shipment.weight)}
                      </Td>
                      <Td className="tabular whitespace-nowrap text-muted">
                        {shipment.shippingFee
                          ? `${Number(shipment.shippingFee).toLocaleString("en-US")} ${shipment.currency}`
                          : "—"}
                      </Td>
                      <Td>
                        <Badge variant={PAYMENT_STATUS_VARIANTS[shipment.paymentStatus] ?? "neutral"}>
                          {PAYMENT_STATUS_LABELS[shipment.paymentStatus] ?? shipment.paymentStatus}
                        </Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {shipment.destinationCity ?? "—"}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {formatRelative(shipment.updatedAt)}
                      </Td>
                      <Td className="text-end">
                        <Link
                          href={`/admin/shipments/${shipment.id}`}
                          className={buttonVariants("outline", "sm")}
                        >
                          إدارة
                        </Link>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
              <Link href={buildHref(search, { page: String(result.page - 1) })} className={buttonVariants("outline", "sm")}>
                السابقة
              </Link>
            ) : null}
            {result.page < result.totalPages ? (
              <Link href={buildHref(search, { page: String(result.page + 1) })} className={buttonVariants("outline", "sm")}>
                التالية
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
