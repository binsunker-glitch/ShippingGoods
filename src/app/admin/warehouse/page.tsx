import Link from "next/link";
import { Search, Warehouse } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { PACKAGE_STATUS_LABELS, PACKAGE_STATUS_VARIANTS } from "@/lib/constants";
import { formatDate, formatRelative, formatWeight } from "@/lib/format";
import { requirePermission } from "@/server/auth/guards";
import { listWarehousePackages } from "@/server/queries/admin";
import { ReceivePackageButton } from "./receive-package-button";
import { RegisterPackageForm } from "./register-package-form";

export const metadata = { title: "عمليات المستودع" };

const STATUS_TABS = [
  { label: "الكل", value: "all" },
  { label: "مسجّل", value: "registered" },
  { label: "مستلم", value: "received" },
  { label: "جاهز للتجميع", value: "ready" },
  { label: "مُجمّع", value: "consolidated" },
  { label: "قيد الشحن", value: "in_transit" },
  { label: "تم التسليم", value: "delivered" },
  { label: "استثناء", value: "exception" },
];

type Search = { q?: string; status?: string; page?: string };

function buildHref(base: Search, patch: Partial<Search>) {
  const merged = { ...base, ...patch };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.status && merged.status !== "all") params.set("status", merged.status);
  const pageNum = Number(merged.page ?? 1);
  if (pageNum > 1) params.set("page", String(pageNum));
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

export default async function AdminWarehousePage({
  searchParams,
}: PageProps<"/admin/warehouse">) {
  await requirePermission("warehouse.read");
  const sp = await searchParams;

  const search: Search = {
    q: typeof sp.q === "string" ? sp.q.trim() : "",
    status: typeof sp.status === "string" ? sp.status : "all",
    page: typeof sp.page === "string" ? sp.page : "1",
  };

  const result = await listWarehousePackages({
    q: search.q || undefined,
    status: search.status,
    page: Number(search.page) || 1,
    perPage: 15,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="عمليات المستودع"
        description="تسجيل الطرود الواردة إلى مستودع قوانغتشو، تسجيل استلامها، ومتابعة حالتها قبل التجميع والشحن."
        actions={<RegisterPackageForm />}
      />

      <Card>
        <CardContent className="space-y-4">
          <nav aria-label="تصفية حسب الحالة" className="flex flex-wrap gap-2">
            {STATUS_TABS.map((tab) => {
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

          <form className="grid gap-3 sm:grid-cols-[1fr_200px]" role="search">
            <div className="relative">
              <Search
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                type="search"
                name="q"
                defaultValue={search.q}
                placeholder="ابحث برقم الطرد أو رقم الناقل أو رقم العميل..."
                className="ps-9"
                aria-label="بحث في الطرود"
              />
            </div>
            <Select name="status" defaultValue={search.status} aria-label="تصفية حسب الحالة">
              {STATUS_TABS.map((tab) => (
                <option key={tab.value} value={tab.value}>
                  {tab.label}
                </option>
              ))}
            </Select>
          </form>

          <p className="text-[13px] text-muted">
            إجمالي <span className="tabular font-bold">{result.total}</span> طرد
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {result.rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Warehouse}
                title="لا توجد طرود"
                description={
                  search.q || search.status !== "all"
                    ? "جرّب تعديل البحث أو التصفية."
                    : "سجّل أول طرد وارد إلى المستودع للبدء."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1020px]">
                <thead>
                  <tr>
                    <Th>رقم الطرد</Th>
                    <Th>العميل</Th>
                    <Th>رقم الناقل</Th>
                    <Th>الوصف</Th>
                    <Th>الوزن</Th>
                    <Th>الحالة</Th>
                    <Th>تاريخ الاستلام</Th>
                    <Th>الإجراءات</Th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((pkg) => (
                    <Tr key={pkg.id}>
                      <Td>
                        <span className="tabular font-bold">{pkg.packageReference}</span>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {pkg.customerId ? (
                          <>
                            <span className="text-[13px] font-semibold">{pkg.customerName}</span>
                            <span className="tabular block text-xs text-muted">
                              {pkg.customerNumber}
                            </span>
                          </>
                        ) : (
                          <Badge variant="warning">غير معيّن</Badge>
                        )}
                      </Td>
                      <Td className="tabular text-muted">
                        {pkg.carrierTrackingNumber ?? "—"}
                      </Td>
                      <Td className="max-w-52">
                        <span className="line-clamp-2 text-muted">{pkg.description ?? "—"}</span>
                      </Td>
                      <Td className="tabular whitespace-nowrap text-muted">
                        {formatWeight(pkg.weight)}
                      </Td>
                      <Td>
                        <Badge variant={PACKAGE_STATUS_VARIANTS[pkg.packageStatus] ?? "neutral"}>
                          {PACKAGE_STATUS_LABELS[pkg.packageStatus] ?? pkg.packageStatus}
                        </Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {pkg.warehouseReceivedAt ? (
                          <span title={formatDate(pkg.warehouseReceivedAt)}>
                            {formatRelative(pkg.warehouseReceivedAt)}
                          </span>
                        ) : (
                          "لم يُسجَّل"
                        )}
                      </Td>
                      <Td>
                        {pkg.packageStatus === "registered" ? (
                          <ReceivePackageButton id={pkg.id} />
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
