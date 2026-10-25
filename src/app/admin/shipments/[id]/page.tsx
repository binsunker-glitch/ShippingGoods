import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CreditCard, MapPin, Package } from "lucide-react";

import { StatusBadge } from "@/components/shipment/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataRow } from "@/components/ui/feedback";
import {
  PACKAGE_STATUS_LABELS,
  PACKAGE_STATUS_VARIANTS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_VARIANTS,
  ROLE_LABELS,
} from "@/lib/constants";
import { formatDate, formatDateTime, formatNationalAddress, formatWeight } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/guards";
import { getAdminShipmentDetail } from "@/server/queries/shipments";
import { getAllowedTransitions, getStatusCatalog } from "@/server/queries/statuses";
import { PaymentForm } from "./payment-form";
import { StatusChangeForm, type StatusOption } from "./status-change-form";

export const metadata = { title: "إدارة الشحنة" };

export default async function AdminShipmentDetailPage({
  params,
}: PageProps<"/admin/shipments/[id]">) {
  const session = await requirePermission("shipments.read");
  const { id } = await params;

  const shipment = await getAdminShipmentDetail(id);
  if (!shipment) notFound();

  const [catalog, allowedCodes] = await Promise.all([
    getStatusCatalog(),
    getAllowedTransitions(shipment.currentStatus),
  ]);

  const options: StatusOption[] = allowedCodes
    .map((code) => catalog.get(code))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .map((entry) => ({
      code: entry.code,
      labelAr: entry.labelAr,
      restricted: entry.restricted,
    }));

  const canStatus = can(session.role, "shipments.status");
  const canFees = can(session.role, "shipments.fees");
  const canPayments = can(session.role, "payments.write");
  const currentLabel = catalog.get(shipment.currentStatus)?.labelAr ?? shipment.currentStatus;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/shipments"
          className="inline-flex items-center gap-1.5 text-[13px] font-bold text-muted transition-colors hover:text-ink"
        >
          <ArrowRight className="size-3.5" aria-hidden />
          العودة إلى الشحنات
        </Link>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-extrabold text-ink sm:text-2xl">إدارة الشحنة</h1>
            <StatusBadge status={shipment.currentStatus} group={shipment.statusGroup} />
          </div>
          <div className="rounded-lg border border-line-strong bg-white px-3 py-1.5">
            <span className="tabular text-sm font-extrabold text-ink">{shipment.trackingNumber}</span>
          </div>
        </div>
      </div>

      {/* ---------------- summary ---------------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent>
            <DataRow label="الوزن" value={formatWeight(shipment.weight)} />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <DataRow label="عدد الطرود" value={<span className="tabular">{shipment.packageCount}</span>} />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <DataRow
              label="رسوم الشحن"
              value={
                shipment.shippingFee
                  ? `${Number(shipment.shippingFee).toLocaleString("en-US")} ${shipment.currency}`
                  : "لم تُحدَّد"
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <DataRow
              label="حالة الدفع"
              value={
                <Badge variant={PAYMENT_STATUS_VARIANTS[shipment.paymentStatus] ?? "neutral"}>
                  {PAYMENT_STATUS_LABELS[shipment.paymentStatus] ?? shipment.paymentStatus}
                </Badge>
              }
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* ---------------- left column ---------------- */}
        <div className="space-y-5">
          {/* timeline */}
          <Card>
            <CardHeader>
              <CardTitle>مسار الشحنة</CardTitle>
            </CardHeader>
            <CardContent>
              {shipment.events.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">لا توجد أحداث مسجّلة بعد.</p>
              ) : (
                <ol className="relative">
                  {[...shipment.events].reverse().map((event, index, list) => {
                    const isLast = index === list.length - 1;
                    const entry = catalog.get(event.status);
                    return (
                      <li key={event.id} className="relative ps-8 pb-8 last:pb-0">
                        {!isLast ? (
                          <span className="absolute end-[7px] top-4 bottom-0 w-0.5 bg-line" aria-hidden />
                        ) : null}
                        <span
                          className={[
                            "absolute end-0 top-1 grid size-4 place-items-center rounded-full ring-4 ring-white",
                            event.statusGroup === "delivered"
                              ? "bg-success"
                              : entry?.isException
                                ? "bg-danger"
                                : "bg-brand",
                          ].join(" ")}
                          aria-hidden
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-ink">
                            {entry?.labelAr ?? event.status}
                          </p>
                          <code className="tabular rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-muted">
                            {event.status}
                          </code>
                          {entry?.isException ? <Badge variant="danger">استثناء</Badge> : null}
                        </div>
                        <p className="mt-1 text-[13px] leading-relaxed text-muted">{event.description}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 text-xs text-subtle">
                          <time dateTime={event.eventTimestamp.toISOString()}>
                            {formatDateTime(event.eventTimestamp)}
                          </time>
                          {event.location ? <span>{event.location}</span> : null}
                          <span>
                            بواسطة: {event.actorName ?? (event.source === "system" ? "النظام" : "—")}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* packages */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Package className="size-4 text-muted" aria-hidden />
                <CardTitle>الطرود المرتبطة</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {shipment.packages.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-muted">لا توجد طرود مرتبطة.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr>
                        <ThCell>رقم الطرد</ThCell>
                        <ThCell>رقم الناقل</ThCell>
                        <ThCell>الوصف</ThCell>
                        <ThCell>الوزن</ThCell>
                        <ThCell>الحالة</ThCell>
                        <ThCell>تاريخ الاستلام</ThCell>
                      </tr>
                    </thead>
                    <tbody>
                      {shipment.packages.map((pkg) => (
                        <tr key={pkg.id} className="border-b border-line last:border-b-0">
                          <TdCell>
                            <span className="tabular font-bold">{pkg.packageReference}</span>
                          </TdCell>
                          <TdCell className="tabular text-muted">
                            {pkg.carrierTrackingNumber ?? "—"}
                          </TdCell>
                          <TdCell className="max-w-52">
                            <span className="line-clamp-2 text-muted">{pkg.description ?? "—"}</span>
                          </TdCell>
                          <TdCell className="tabular">{formatWeight(pkg.weight)}</TdCell>
                          <TdCell>
                            <Badge variant={PACKAGE_STATUS_VARIANTS[pkg.packageStatus] ?? "neutral"}>
                              {PACKAGE_STATUS_LABELS[pkg.packageStatus] ?? pkg.packageStatus}
                            </Badge>
                          </TdCell>
                          <TdCell className="tabular text-muted">
                            {pkg.warehouseReceivedAt ? formatDate(pkg.warehouseReceivedAt) : "—"}
                          </TdCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* payments history */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="size-4 text-muted" aria-hidden />
                <CardTitle>سجل المدفوعات</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {shipment.payments.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-muted">لا توجد مدفوعات مسجّلة.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-sm">
                    <thead>
                      <tr>
                        <ThCell>المبلغ</ThCell>
                        <ThCell>العملة</ThCell>
                        <ThCell>الطريقة</ThCell>
                        <ThCell>الحالة</ThCell>
                        <ThCell>المرجع</ThCell>
                        <ThCell>التاريخ</ThCell>
                      </tr>
                    </thead>
                    <tbody>
                      {shipment.payments.map((payment) => (
                        <tr key={payment.id} className="border-b border-line last:border-b-0">
                          <TdCell>
                            <span className="tabular font-bold">
                              {Number(payment.amount).toLocaleString("en-US")}
                            </span>
                          </TdCell>
                          <TdCell>{payment.currency}</TdCell>
                          <TdCell className="text-muted">{payment.paymentMethod}</TdCell>
                          <TdCell>
                            <Badge
                              variant={PAYMENT_STATUS_VARIANTS[payment.paymentStatus] ?? "neutral"}
                            >
                              {PAYMENT_STATUS_LABELS[payment.paymentStatus] ?? payment.paymentStatus}
                            </Badge>
                          </TdCell>
                          <TdCell className="tabular text-muted">
                            {payment.transactionReference ?? "—"}
                          </TdCell>
                          <TdCell className="tabular text-muted">
                            {formatDateTime(payment.recordedAt)}
                          </TdCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---------------- right column: actions ---------------- */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>تغيير الحالة</CardTitle>
            </CardHeader>
            <CardContent>
              {canStatus ? (
                <StatusChangeForm
                  shipmentId={shipment.id}
                  currentStatus={shipment.currentStatus}
                  currentLabel={currentLabel}
                  options={options}
                  canUseRestricted={session.role === "super_admin"}
                />
              ) : (
                <p className="text-[13px] leading-relaxed text-muted">
                  تغيير حالة الشحنات يتطلب صلاحية «إدارة حالة الشحنات»، وهي غير مفعّلة لدورك
                  الحالي.
                </p>
              )}
            </CardContent>
          </Card>

          {canPayments ? (
            <Card>
              <CardHeader>
                <CardTitle>تسجيل دفعة</CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentForm
                  shipmentId={shipment.id}
                  trackingNumber={shipment.trackingNumber}
                  shippingFee={shipment.shippingFee}
                  canSetFees={canFees}
                />
              </CardContent>
            </Card>
          ) : null}

          {/* customer + delivery */}
          <Card>
            <CardHeader>
              <CardTitle>بيانات الشحنة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DataRow
                label="العميل"
                value={
                  shipment.customerId ? (
                    <Link
                      href={`/admin/customers/${shipment.customerId}`}
                      className="text-brand-dark hover:underline"
                    >
                      {shipment.customerName} ({shipment.customerNumber})
                    </Link>
                  ) : (
                    <Badge variant="warning">غير مرتبط بأي عميل</Badge>
                  )
                }
              />
              <DataRow label="الوصف" value={shipment.description} />
              <DataRow label="المصدر" value={shipment.origin} />
              {shipment.shippingMethod ? (
                <DataRow label="طريقة الشحن" value={shipment.shippingMethod} />
              ) : null}
              <DataRow
                label="المدينة الوجهة"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5 text-muted" aria-hidden />
                    {shipment.destinationCity ?? "—"}
                  </span>
                }
              />
              <DataRow
                label="موعد التسليم المتوقع"
                value={
                  shipment.estimatedDeliveryDate ? (
                    <span className="tabular">
                      {formatDate(shipment.estimatedDeliveryDate)}
                      {shipment.estimatedDelivery ? (
                        <Badge variant="warning" className="ms-2">
                          تقديري
                        </Badge>
                      ) : null}
                    </span>
                  ) : (
                    "غير محدد"
                  )
                }
              />
              <DataRow
                label="عنوان التسليم (المثبّت)"
                value={
                  shipment.destinationAddressSnapshot ? (
                    <span className="text-[13px] leading-relaxed">
                      {formatNationalAddress(shipment.destinationAddressSnapshot)}
                    </span>
                  ) : (
                    "—"
                  )
                }
              />
              {shipment.notes ? <DataRow label="ملاحظات داخلية" value={shipment.notes} /> : null}
              <DataRow label="تاريخ الإنشاء" value={formatDate(shipment.createdAt)} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 text-[13px] leading-relaxed text-muted">
              <p className="font-bold text-ink">تنبيهات تشغيلية</p>
              <ul className="space-y-1.5">
                <li>• عنوان التسليم مثبّت لحظة إنشاء الشحنة ولا يتغيّر بتعديل عناوين العميل.</li>
                <li>• المواعيد المتوقعة يجب أن تكون مؤكدة، وإلا فاتركها فارغة.</li>
                <li>• كل تغيير هنا يُسجَّل في سجل التدقيق باسمك ({ROLE_LABELS[session.role]}).</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ThCell({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="border-b border-line bg-surface-muted px-4 py-2.5 text-start text-xs font-bold text-muted"
    >
      {children}
    </th>
  );
}

function TdCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`border-b border-line px-4 py-3 text-ink last:border-b-0 ${className ?? ""}`}>
      {children}
    </td>
  );
}
