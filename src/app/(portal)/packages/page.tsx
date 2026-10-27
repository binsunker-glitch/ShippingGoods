import Link from "next/link";
import { Package, Scale } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Select } from "@/components/ui/form";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { PACKAGE_STATUS_LABELS, PACKAGE_STATUS_VARIANTS } from "@/lib/constants";
import { formatDate, formatRelative, formatWeight } from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import { listCustomerPackages } from "@/server/queries/customer";

export const metadata = { title: "طرودي" };

const PACKAGE_TABS = [
  { label: "كل الطرود", value: "all" },
  { label: "مسجّل", value: "registered" },
  { label: "في المستودع", value: "received" },
  { label: "جاهز للتجميع", value: "assigned" },
  { label: "مُجمّع", value: "consolidated" },
  { label: "قيد الشحن", value: "shipped" },
  { label: "تم التسليم", value: "delivered" },
];

function buildHref(
  base: { status?: string; page?: number },
  patch: { status?: string; page?: number },
) {
  const merged = { ...base, ...patch };
  const params = new URLSearchParams();
  if (merged.status && merged.status !== "all") params.set("status", merged.status);
  const pageNum = Number(merged.page ?? 1);
  if (pageNum > 1) params.set("page", String(pageNum));
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

export default async function PackagesPage({
  searchParams,
}: PageProps<"/packages">) {
  const session = await requireCustomer();
  const sp = await searchParams;

  const status = typeof sp.status === "string" ? sp.status : "all";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const result = await listCustomerPackages(session.profileId, { status, page, perPage: 12 });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink sm:text-2xl">طرودي</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
          كل طرد وصل إلى مستودعنا في قوانغتشو باسمك، مع حالته ووزنه وتاريخ استلامه.
        </p>
      </div>

      {/* ---------------- filters ---------------- */}
      <Card>
        <CardContent className="space-y-4">
          <nav aria-label="تصفية حسب الحالة" className="flex flex-wrap gap-2">
            {PACKAGE_TABS.map((tab) => {
              const active = status === tab.value;
              const count = result.counts[tab.value] ?? 0;
              return (
                <Link
                  key={tab.value}
                  href={buildHref({ status }, { status: tab.value })}
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

          <form className="max-w-xs">
            <Select name="status" defaultValue={status} aria-label="تصفية حسب الحالة">
              {PACKAGE_TABS.map((tab) => (
                <option key={tab.value} value={tab.value}>
                  {tab.label}
                </option>
              ))}
            </Select>
          </form>
        </CardContent>
      </Card>

      {/* ---------------- list ---------------- */}
      <Card>
        <CardContent className="p-0">
          {result.rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Package}
                title={status !== "all" ? "لا توجد طرود مطابقة" : "لا توجد طرود بعد"}
                description={
                  status !== "all"
                    ? "جرّب تغيير التصفية لعرض طرود أخرى."
                    : "ستظهر طرودك هنا فور وصولها إلى مستودعنا في قوانغتشو."
                }
                action={
                  <Link href="/link-shipment" className={buttonVariants("primary", "sm")}>
                    ربط طرد
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[880px]">
                <thead>
                  <tr>
                    <Th>رقم الطرد</Th>
                    <Th>رقم الناقل</Th>
                    <Th>الوصف</Th>
                    <Th>الوزن</Th>
                    <Th>الحالة</Th>
                    <Th>الشحنة المرتبطة</Th>
                    <Th>تاريخ الاستلام</Th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((pkg) => (
                    <Tr key={pkg.id}>
                      <Td>
                        <span className="tabular font-bold">{pkg.packageReference}</span>
                      </Td>
                      <Td className="tabular text-muted">
                        {pkg.carrierTrackingNumber ?? "—"}
                      </Td>
                      <Td className="max-w-56">
                        <span className="line-clamp-2 text-muted">{pkg.description ?? "—"}</span>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 tabular text-muted">
                          <Scale className="size-3.5" aria-hidden />
                          {formatWeight(pkg.weight)}
                        </span>
                      </Td>
                      <Td>
                        <Badge variant={PACKAGE_STATUS_VARIANTS[pkg.packageStatus] ?? "neutral"}>
                          {PACKAGE_STATUS_LABELS[pkg.packageStatus] ?? pkg.packageStatus}
                        </Badge>
                      </Td>
                      <Td>
                        {pkg.shipmentId ? (
                          <Link
                            href={`/shipments/${pkg.shipmentId}`}
                            className="tabular text-[13px] font-bold text-brand-dark hover:underline"
                          >
                            {pkg.shipmentTrackingNumber}
                          </Link>
                        ) : pkg.consolidationGroupReference ? (
                          <span className="text-[13px] text-muted">
                            مجموعة {pkg.consolidationGroupReference}
                          </span>
                        ) : (
                          <span className="text-[13px] text-subtle">غير مرتبط بعد</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {pkg.warehouseReceivedAt ? (
                          <span title={formatDate(pkg.warehouseReceivedAt)}>
                            {formatRelative(pkg.warehouseReceivedAt)}
                          </span>
                        ) : (
                          "لم يصل بعد"
                        )}
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
            <span className="tabular font-bold">{result.total}</span> طرد
          </p>
          <div className="flex items-center gap-2">
            {result.page > 1 ? (
              <Link href={buildHref({ status }, { page: result.page - 1 })} className={buttonVariants("outline", "sm")}>
                السابقة
              </Link>
            ) : null}
            {result.page < result.totalPages ? (
              <Link href={buildHref({ status }, { page: result.page + 1 })} className={buttonVariants("outline", "sm")}>
                التالية
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
