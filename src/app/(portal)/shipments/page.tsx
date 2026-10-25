import Link from "next/link";
import { Search, Truck } from "lucide-react";

import { StatusBadge } from "@/components/shipment/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { SHIPMENT_TABS } from "@/lib/constants";
import { formatDateTime, formatRelative, formatWeight } from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import { listCustomerShipments } from "@/server/queries/shipments";

export const metadata = { title: "شحناتي" };

type SearchParams = { q?: string; status?: string; sort?: string; page?: string };

function buildHref(base: SearchParams, patch: Partial<SearchParams>) {
  const merged = { ...base, ...patch };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (!value) continue;
    if (key === "page" && value === "1") continue;
    if (key === "status" && value === "all") continue;
    params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

export default async function ShipmentsPage({
  searchParams,
}: PageProps<"/shipments">) {
  const session = await requireCustomer();
  const sp = await searchParams;

  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" ? sp.status : "all";
  const sortParam = typeof sp.sort === "string" ? sp.sort : "newest";
  const sort = sortParam === "oldest" || sortParam === "updated" ? sortParam : "newest";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const result = await listCustomerShipments(session.profileId, {
    q: q || undefined,
    status,
    sort,
    page,
    perPage: 10,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink sm:text-2xl">شحناتي</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          كل الشحنات المسجّلة باسمك، من لحظة وصولها إلى مستودعنا في قوانغتشو حتى التسليم.
        </p>
      </div>

      {/* ---------------- filters ---------------- */}
      <Card>
        <CardContent className="space-y-4">
          <nav aria-label="تصفية حسب الحالة" className="flex flex-wrap gap-2">
            {SHIPMENT_TABS.map((tab) => {
              const active = status === tab.value;
              const count = result.counts[tab.value] ?? 0;
              return (
                <Link
                  key={tab.value}
                  href={buildHref({ q, sort }, { status: tab.value })}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
                    active
                      ? "border-navy bg-navy text-white"
                      : "border-line-strong bg-white text-muted hover:bg-surface-muted hover:text-ink",
                  ].join(" ")}
                >
                  {tab.label}
                  <span
                    className={[
                      "tabular rounded-full px-1.5 text-[11px]",
                      active ? "bg-white/15 text-white" : "bg-surface-muted text-muted",
                    ].join(" ")}
                  >
                    {count}
                  </span>
                </Link>
              );
            })}
          </nav>

          <form className="grid gap-3 sm:grid-cols-[1fr_190px]" role="search">
            <div className="relative">
              <Search
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="ابحث برقم التتبع أو وصف الشحنة..."
                className="ps-9"
                aria-label="بحث في الشحنات"
              />
            </div>
            <Select name="sort" defaultValue={sort} aria-label="ترتيب النتائج">
              <option value="newest">الأحدث أولاً</option>
              <option value="oldest">الأقدم أولاً</option>
              <option value="updated">آخر تحديث</option>
            </Select>
          </form>
        </CardContent>
      </Card>

      {/* ---------------- results ---------------- */}
      <Card>
        <CardContent className="p-0">
          {result.rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Truck}
                title={q || status !== "all" ? "لا توجد شحنات مطابقة" : "لا توجد شحنات حتى الآن"}
                description={
                  q || status !== "all"
                    ? "جرّب تعديل البحث أو التصفية للعثور على شحنتك."
                    : "ستظهر شحناتك هنا عند استلامها في مستودعنا."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[900px]">
                <thead>
                  <tr>
                    <Th>رقم التتبع</Th>
                    <Th>وصف الشحنة</Th>
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
                      <Td className="max-w-56">
                        <span className="line-clamp-2 text-muted">{shipment.description}</span>
                      </Td>
                      <Td>
                        <StatusBadge
                          status={shipment.currentStatus}
                          group={shipment.statusGroup}
                        />
                      </Td>
                      <Td className="tabular whitespace-nowrap text-muted">
                        {formatWeight(shipment.weight)}
                      </Td>
                      <Td className="tabular whitespace-nowrap text-muted">
                        {shipment.shippingFee
                          ? `${Number(shipment.shippingFee).toLocaleString("en-US")} ر.س`
                          : "لم تُحدَّد"}
                      </Td>
                      <Td>
                        <span
                          className={[
                            "text-[13px] font-semibold",
                            shipment.paymentStatus === "paid"
                              ? "text-success"
                              : shipment.paymentStatus === "unpaid"
                                ? "text-warning"
                                : "text-muted",
                          ].join(" ")}
                        >
                          {shipment.paymentStatus === "paid"
                            ? "مدفوعة"
                            : shipment.paymentStatus === "pending_verification"
                              ? "بانتظار التحقق"
                              : shipment.paymentStatus === "refunded"
                                ? "مستردة"
                                : "غير مدفوعة"}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {shipment.destinationCity ?? "—"}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        <span title={formatDateTime(shipment.updatedAt)}>
                          {formatRelative(shipment.updatedAt)}
                        </span>
                      </Td>
                      <Td className="text-end">
                        <Link
                          href={`/shipments/${shipment.id}`}
                          className={buttonVariants("outline", "sm")}
                        >
                          التفاصيل
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

      {/* ---------------- pagination ---------------- */}
      {result.totalPages > 1 ? (
        <nav
          aria-label="التنقل بين الصفحات"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-[13px] text-muted">
            صفحة <span className="tabular font-bold">{result.page}</span> من{" "}
            <span className="tabular font-bold">{result.totalPages}</span> — إجمالي{" "}
            <span className="tabular font-bold">{result.total}</span> شحنة
          </p>
          <div className="flex items-center gap-2">
            {result.page > 1 ? (
              <Link
                href={buildHref({ q, status, sort }, { page: String(result.page - 1) })}
                className={buttonVariants("outline", "sm")}
              >
                السابقة
              </Link>
            ) : null}
            {result.page < result.totalPages ? (
              <Link
                href={buildHref({ q, status, sort }, { page: String(result.page + 1) })}
                className={buttonVariants("outline", "sm")}
              >
                التالية
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
