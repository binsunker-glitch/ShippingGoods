import Link from "next/link";
import {
  ArrowLeft,
  Boxes,
  CreditCard,
  Link2,
  Package,
  Plus,
  Truck,
} from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/shipment/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import {
  getCustomerStats,
  getWarehouseArrivalDates,
} from "@/server/queries/dashboard";
import { listCustomerShipments } from "@/server/queries/shipments";

export const metadata = { title: "الرئيسية" };

export default async function DashboardPage() {
  const session = await requireCustomer();

  const [stats, recent] = await Promise.all([
    getCustomerStats(session.profileId),
    listCustomerShipments(session.profileId, { page: 1, perPage: 5, sort: "updated" }),
  ]);

  const arrivalDates = await getWarehouseArrivalDates(
    session.profileId,
    recent.rows.map((row) => row.id),
  );

  return (
    <div className="space-y-6">
      {/* ---------------- welcome ---------------- */}
      <section className="overflow-hidden rounded-card border border-navy-line bg-navy text-white">
        <div className="flex flex-wrap items-start justify-between gap-6 p-6 sm:p-7">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand">مرحباً، {session.fullName}</p>
            <h1 className="mt-2 text-2xl leading-snug font-extrabold sm:text-[27px]">
              تابع طرودك وشحناتك من الصين إلى السعودية من مكان واحد.
            </h1>
            <div className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-3 py-2">
              <span className="text-[11px] font-semibold text-white/70">رقم العميل الخاص بك</span>
              <span className="tabular text-sm font-extrabold text-brand">
                {session.customerNumber}
              </span>
              <CopyButton value={session.customerNumber} label="نسخ" variant="light" />
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <Link href="/link-shipment" className={buttonVariants("primary", "md")}>
              <Link2 className="size-4" aria-hidden />
              ربط طرد
            </Link>
            <Link href="/shipments" className={buttonVariants("outline", "md")}>
              عرض شحناتي
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------- statistics ---------------- */}
      <section aria-label="إحصاءات الحساب" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="طرودي في المستودع"
          value={stats.packagesInWarehouse}
          hint="طرود وصلت قوانغتشو ولم تُشحن بعد"
          icon={Package}
          tone="info"
        />
        <StatCard
          label="جاهزة للتجميع"
          value={stats.readyForConsolidation}
          hint="طرود يمكن دمجها في شحنة واحدة"
          icon={Boxes}
          tone="violet"
        />
        <StatCard
          label="بانتظار الدفع"
          value={stats.awaitingPayment}
          hint="شحنات عليها رسوم غير مدفوعة"
          icon={CreditCard}
          tone="warning"
        />
        <StatCard
          label="الشحنات النشطة"
          value={stats.activeShipments}
          hint="شحنات قيد المعالجة حالياً"
          icon={Truck}
          tone="brand"
        />
      </section>

      {/* ---------------- latest shipments ---------------- */}
      <section aria-labelledby="latest-shipments">
        <Card>
          <CardHeader>
            <div>
              <CardTitle id="latest-shipments">آخر الشحنات</CardTitle>
              <p className="mt-1 text-[13px] text-muted">
                آخر التحديثات التشغيلية المسجّلة على شحناتك.
              </p>
            </div>
            <Link
              href="/shipments"
              className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand-dark hover:underline"
            >
              عرض كل الشحنات
              <ArrowLeft className="size-3.5" aria-hidden />
            </Link>
          </CardHeader>

          <CardContent className="p-0">
            {recent.rows.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={Truck}
                  title="لا توجد شحنات حتى الآن"
                  description="ستظهر شحناتك هنا عند استلامها في مستودعنا."
                  action={
                    <Link href="/link-shipment" className={buttonVariants("primary", "sm")}>
                      <Link2 className="size-4" aria-hidden />
                      ربط طرد
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[860px]">
                  <thead>
                    <tr>
                      <Th>رقم الشحنة</Th>
                      <Th>وصف الشحنة</Th>
                      <Th>الحالة</Th>
                      <Th>وصول المستودع</Th>
                      <Th>مدينة الوجهة</Th>
                      <Th>آخر تحديث</Th>
                      <Th className="text-end"> </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.rows.map((shipment) => {
                      const arrival = arrivalDates.get(shipment.id);
                      return (
                        <Tr key={shipment.id}>
                          <Td>
                            <span className="tabular font-bold">{shipment.trackingNumber}</span>
                          </Td>
                          <Td className="max-w-56">
                            <span className="line-clamp-2 text-muted">{shipment.description}</span>
                          </Td>
                          <Td>
                            <StatusBadge status={shipment.currentStatus} group={shipment.statusGroup} />
                          </Td>
                          <Td className="tabular whitespace-nowrap text-muted">
                            {arrival ? formatDate(arrival) : "—"}
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
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <p className="text-xs leading-relaxed text-subtle">
        <Plus className="inline size-3" aria-hidden /> أرقام العملاء تبدأ بـ{" "}
        <span className="tabular font-bold text-muted">WA-</span> بينما تبدأ أرقام الشحنات بـ{" "}
        <span className="tabular font-bold text-muted">WAS-</span>؛ المعرّفان مختلفان تمامًا.
      </p>
    </div>
  );
}
