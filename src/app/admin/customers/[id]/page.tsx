import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Mail, MapPin, Package, Phone, Ticket, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataRow, PageHeader } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ROLE_LABELS, STATUS_GROUP_LABELS, STATUS_GROUP_VARIANTS } from "@/lib/constants";
import { formatDate, formatRelative } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/guards";
import { getCustomerById, getCustomerCounters } from "@/server/queries/admin";
import { listCustomerShipments } from "@/server/queries/shipments";
import { CustomerStatusForm } from "./customer-status-form";

export const metadata = { title: "تفاصيل العميل" };

export default async function AdminCustomerDetailPage({
  params,
}: PageProps<"/admin/customers/[id]">) {
  const session = await requirePermission("customers.read");
  const { id } = await params;

  const customer = await getCustomerById(id);
  if (!customer || customer.role !== "customer") notFound();

  const [counters, shipments] = await Promise.all([
    getCustomerCounters(customer.id),
    listCustomerShipments(customer.id, { page: 1, perPage: 8, sort: "updated" }),
  ]);

  const canSuspend = can(session.role, "customers.suspend");

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/customers"
          className="inline-flex items-center gap-1.5 text-[13px] font-bold text-muted transition-colors hover:text-ink"
        >
          <ArrowRight className="size-3.5" aria-hidden />
          العودة إلى العملاء
        </Link>
        <PageHeader
          title={customer.fullName}
          description={`رقم العميل ${customer.customerNumber} · ${ROLE_LABELS[customer.role] ?? customer.role}`}
          actions={
            customer.accountStatus === "active" ? (
              <Badge variant="success">نشط</Badge>
            ) : (
              <Badge variant="danger">موقوف</Badge>
            )
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryStat icon={Truck} label="الشحنات" value={counters.shipments} />
        <SummaryStat icon={Package} label="الطرود" value={counters.packages} />
        <SummaryStat icon={Ticket} label="تذاكر الدعم" value={counters.tickets} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* ---------------- profile + shipments ---------------- */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>بيانات الحساب</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <DataRow label="رقم العميل" value={<span className="tabular">{customer.customerNumber}</span>} />
                <DataRow label="الاسم الكامل" value={customer.fullName} />
                <DataRow
                  label="الجوال"
                  value={
                    <span className="inline-flex items-center gap-1.5" dir="ltr">
                      <Phone className="size-3.5 text-muted" aria-hidden />
                      {customer.phone}
                    </span>
                  }
                />
                <DataRow
                  label="البريد الإلكتروني"
                  value={
                    customer.email ? (
                      <span className="inline-flex items-center gap-1.5" dir="ltr">
                        <Mail className="size-3.5 text-muted" aria-hidden />
                        {customer.email}
                      </span>
                    ) : (
                      "غير مسجّل"
                    )
                  }
                />
                <DataRow
                  label="المدينة"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-3.5 text-muted" aria-hidden />
                      {customer.city}
                    </span>
                  }
                />
                <DataRow label="تاريخ التسجيل" value={formatDate(customer.createdAt)} />
                <DataRow label="آخر تحديث" value={formatDate(customer.updatedAt)} />
                <DataRow
                  label="حالة الحساب"
                  value={
                    customer.accountStatus === "active" ? (
                      <Badge variant="success">نشط</Badge>
                    ) : (
                      <Badge variant="danger">موقوف</Badge>
                    )
                  }
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>آخر الشحنات</CardTitle>
                <p className="mt-1 text-[13px] text-muted">
                  {shipments.total === 0
                    ? "لا توجد شحنات مسجّلة لهذا العميل."
                    : `إجمالي ${shipments.total} شحنة مرتبطة بالعميل.`}
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {shipments.rows.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted">
                  لم تُسجَّل أي شحنة لهذا العميل بعد.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[720px]">
                    <thead>
                      <tr>
                        <Th>رقم التتبع</Th>
                        <Th>الوصف</Th>
                        <Th>الحالة</Th>
                        <Th>الوزن</Th>
                        <Th>آخر تحديث</Th>
                        <Th className="text-end"> </Th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipments.rows.map((shipment) => (
                        <Tr key={shipment.id}>
                          <Td>
                            <span className="tabular font-bold">{shipment.trackingNumber}</span>
                          </Td>
                          <Td className="max-w-52">
                            <span className="line-clamp-2 text-muted">{shipment.description}</span>
                          </Td>
                          <Td>
                            <Badge variant={STATUS_GROUP_VARIANTS[shipment.statusGroup] ?? "neutral"}>
                              {STATUS_GROUP_LABELS[shipment.statusGroup] ?? shipment.statusGroup}
                            </Badge>
                          </Td>
                          <Td className="tabular text-muted">
                            {shipment.weight ? `${shipment.weight} كجم` : "—"}
                          </Td>
                          <Td className="whitespace-nowrap text-muted">
                            <span title={formatDate(shipment.updatedAt)}>
                              {formatRelative(shipment.updatedAt)}
                            </span>
                          </Td>
                          <Td className="text-end">
                            <Link
                              href={`/admin/shipments/${shipment.id}`}
                              className="text-[13px] font-bold text-brand-dark hover:underline"
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
        </div>

        {/* ---------------- account actions ---------------- */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>إدارة الحساب</CardTitle>
            </CardHeader>
            <CardContent>
              {canSuspend ? (
                <CustomerStatusForm
                  profileId={customer.id}
                  fullName={customer.fullName}
                  currentStatus={customer.accountStatus}
                />
              ) : (
                <p className="text-[13px] leading-relaxed text-muted">
                  إيقاف وتفعيل الحسابات يتطلب صلاحية «إيقاف العملاء»، وهي غير مفعّلة لدورك
                  الحالي.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2.5">
              <p className="text-sm font-bold text-ink">ملاحظات أمنية</p>
              <ul className="space-y-2 text-[13px] leading-relaxed text-muted">
                <li>رقم العميل معرّف للتصريف فقط وليس كلمة مرور.</li>
                <li>لا تُعرض كلمات المرور أو هاشاتها في هذه الشاشة إطلاقاً.</li>
                <li>كل إجراء هنا يُسجَّل في سجل التدقيق باسمك.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Truck;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-muted text-muted">
          <Icon className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-xs font-semibold text-muted">{label}</p>
          <p className="tabular mt-0.5 text-xl font-extrabold text-ink">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
