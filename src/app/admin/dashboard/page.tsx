import Link from "next/link";
import {
  AlertTriangle,
  CreditCard,
  Link2,
  MessageSquare,
  Package,
  Truck,
  Users,
} from "lucide-react";

import { StatusBadge } from "@/components/shipment/status-badge";
import { StatCard } from "@/components/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { requireAdmin } from "@/server/auth/guards";
import { getAdminStats, getRecentShipmentEvents } from "@/server/queries/admin";

export const metadata = { title: "لوحة التحكم" };

export default async function AdminDashboardPage() {
  await requireAdmin();
  const [stats, events] = await Promise.all([getAdminStats(), getRecentShipmentEvents(8)]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة التحكم"
        description="نظرة عامة على العمليات الحالية. كل الأرقام محسوبة من البيانات الفعلية داخل النظام."
      />

      {/* ---------------- key metrics ---------------- */}
      <section aria-label="المؤشرات الرئيسية" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="إجمالي العملاء"
          value={formatNumber(stats.totalCustomers)}
          hint={`+${formatNumber(stats.newCustomers30d)} خلال 30 يوماً`}
          icon={Users}
          tone="navy"
        />
        <StatCard
          label="الشحنات النشطة"
          value={formatNumber(stats.activeShipments)}
          hint={`${formatNumber(stats.totalShipments)} إجمالي الشحنات`}
          icon={Truck}
          tone="brand"
        />
        <StatCard
          label="طرود في المستودع"
          value={formatNumber(stats.packagesInWarehouse)}
          hint="مسجّلة أو مستلمة أو جاهزة للتجميع"
          icon={Package}
          tone="info"
        />
        <StatCard
          label="الرسوم المحصّلة"
          value={`${formatNumber(Number(stats.collectedPayments))} ر.س`}
          hint="مدفوعات مسجّلة كمكتملة"
          icon={CreditCard}
          tone="success"
        />
      </section>

      {/* ---------------- secondary metrics ---------------- */}
      <section aria-label="مؤشرات تشغيلية" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="طلبات ربط معلّقة"
          value={formatNumber(stats.pendingClaims)}
          icon={Link2}
          tone="warning"
        />
        <StatCard
          label="تذاكر دعم مفتوحة"
          value={formatNumber(stats.openTickets)}
          icon={MessageSquare}
          tone="violet"
        />
        <StatCard
          label="شحنات بانتظار الدفع"
          value={formatNumber(stats.awaitingPayment)}
          icon={AlertTriangle}
          tone="warning"
        />
        <StatCard
          label="شحنات تم تسليمها"
          value={formatNumber(stats.deliveredShipments)}
          icon={Truck}
          tone="success"
        />
      </section>

      {/* ---------------- attention queue ---------------- */}
      <section className="grid gap-4 lg:grid-cols-3">
        <QuickAction
          href="/admin/claims"
          title="طلبات ربط الطرود"
          text={stats.pendingClaims > 0 ? `لديك ${stats.pendingClaims} طلب بانتظار المراجعة.` : "لا توجد طلبات معلّقة."}
          icon={Link2}
        />
        <QuickAction
          href="/admin/support"
          title="تذاكر الدعم"
          text={stats.openTickets > 0 ? `لديك ${stats.openTickets} تذكرة مفتوحة.` : "لا توجد تذاكر مفتوحة."}
          icon={MessageSquare}
        />
        <QuickAction
          href="/admin/warehouse"
          title="عمليات المستودع"
          text={`${formatNumber(stats.packagesInWarehouse)} طرد تحت المعالجة في قوانغتشو.`}
          icon={Package}
        />
      </section>

      {/* ---------------- recent shipment events ---------------- */}
      <section aria-labelledby="recent-events">
        <Card>
          <CardHeader>
            <div>
              <CardTitle id="recent-events">آخر تحديثات الشحنات</CardTitle>
              <p className="mt-1 text-[13px] text-muted">
                الأحداث المسجّلة من فريق العمليات والمستودع.
              </p>
            </div>
            <Link href="/admin/shipments" className={buttonVariants("outline", "sm")}>
              عرض كل الشحنات
            </Link>
          </CardHeader>

          <CardContent className="p-0">
            {events.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={Truck}
                  title="لا توجد تحديثات بعد"
                  description="ستظهر هنا أحداث الشحنات فور تسجيلها من فريق العمليات."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[820px]">
                  <thead>
                    <tr>
                      <Th>رقم التتبع</Th>
                      <Th>الحالة</Th>
                      <Th>الوصف</Th>
                      <Th>الموقع</Th>
                      <Th>الوقت</Th>
                      <Th className="text-end"> </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <Tr key={event.id}>
                        <Td>
                          <span className="tabular font-bold">{event.trackingNumber}</span>
                        </Td>
                        <Td>
                          <StatusBadge status={event.status} group={event.statusGroup} />
                        </Td>
                        <Td className="max-w-64">
                          <span className="line-clamp-2 text-muted">{event.description}</span>
                        </Td>
                        <Td className="whitespace-nowrap text-muted">{event.location ?? "—"}</Td>
                        <Td className="whitespace-nowrap text-muted">
                          <span title={formatDateTime(event.eventTimestamp)}>
                            {formatRelative(event.eventTimestamp)}
                          </span>
                        </Td>
                        <Td className="text-end">
                          <Link
                            href={`/admin/shipments/${event.shipmentId}`}
                            className={buttonVariants("ghost", "sm")}
                          >
                            فتح
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
      </section>
    </div>
  );
}

function QuickAction({
  href,
  title,
  text,
  icon: Icon,
}: {
  href: string;
  title: string;
  text: string;
  icon: typeof Link2;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="h-full transition-colors group-hover:border-brand/40">
        <CardContent className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-dark">
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-ink">{title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{text}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
