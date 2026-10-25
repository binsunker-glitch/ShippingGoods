import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CreditCard,
  Info,
  MapPin,
  Package,
  Scale,
} from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { StatusBadge } from "@/components/shipment/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, DataRow } from "@/components/ui/feedback";
import {
  PACKAGE_STATUS_LABELS,
  PACKAGE_STATUS_VARIANTS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_VARIANTS,
  STATUS_GROUP_LABELS,
} from "@/lib/constants";
import type { StatusGroup } from "@/db/schema";
import {
  formatDate,
  formatDateTime,
  formatNationalAddress,
  formatRelative,
  formatWeight,
} from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import { getCustomerShipmentDetail } from "@/server/queries/shipments";
import { getStatusCatalog } from "@/server/queries/statuses";

export const metadata = { title: "تفاصيل الشحنة" };

type TimelineEvent = {
  id: string;
  status: string;
  statusGroup: StatusGroup;
  location: string | null;
  description: string;
  eventTimestamp: Date;
  source: string;
  actorName: string | null;
};

const TONE_CLASS: Record<StatusGroup, string> = {
  warehouse: "bg-info",
  ready: "bg-violet",
  awaiting_payment: "bg-warning",
  in_transit: "bg-brand",
  delivered: "bg-success",
  exception: "bg-danger",
  cancelled: "bg-muted",
};

/**
 * Reverse-chronological visual timeline. Labels always come from the
 * admin-configured status catalogue; unknown codes fall back to the raw code
 * rather than inventing a name.
 */
async function ShipmentTimeline({ events }: { events: TimelineEvent[] }) {
  const catalog = await getStatusCatalog();
  const ordered = [...events].reverse();

  return (
    <ol className="relative space-y-0">
      {ordered.map((event, index) => {
        const entry = catalog.get(event.status);
        const label = entry?.labelAr ?? event.status;
        const isLast = index === ordered.length - 1;
        const tone = TONE_CLASS[event.statusGroup] ?? "bg-muted";

        return (
          <li key={event.id} className="relative ps-8 pb-8 last:pb-0">
            {!isLast ? (
              <span
                className="absolute end-[7px] top-4 bottom-0 w-0.5 bg-line"
                aria-hidden
              />
            ) : null}
            <span
              className={[
                "absolute end-0 top-1 grid size-4 place-items-center rounded-full ring-4 ring-white",
                tone,
              ].join(" ")}
              aria-hidden
            />
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-ink">{label}</p>
              {entry?.isException ? <Badge variant="danger">استثناء</Badge> : null}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{event.description}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-subtle">
              <time dateTime={event.eventTimestamp.toISOString()}>
                {formatDateTime(event.eventTimestamp)}
              </time>
              {event.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" aria-hidden />
                  {event.location}
                </span>
              ) : null}
              <span title={formatRelative(event.eventTimestamp)}>
                {formatRelative(event.eventTimestamp)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default async function ShipmentDetailPage({
  params,
}: PageProps<"/shipments/[id]">) {
  const session = await requireCustomer();
  const { id } = await params;

  // Ownership is enforced inside the query (IDOR protection).
  const shipment = await getCustomerShipmentDetail(session.profileId, id);
  if (!shipment) notFound();

  const snapshot = shipment.destinationAddressSnapshot;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/shipments"
          className="inline-flex items-center gap-1.5 text-[13px] font-bold text-muted transition-colors hover:text-ink"
        >
          <ArrowRight className="size-3.5" aria-hidden />
          العودة إلى شحناتي
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-extrabold text-ink sm:text-2xl">تفاصيل الشحنة</h1>
            <StatusBadge status={shipment.currentStatus} group={shipment.statusGroup} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-white px-3 py-1.5">
            <span className="text-xs font-semibold text-muted">رقم التتبع</span>
            <span className="tabular text-sm font-extrabold text-ink">
              {shipment.trackingNumber}
            </span>
            <CopyButton value={shipment.trackingNumber} label="نسخ" variant="outline" />
          </div>
        </div>
      </div>

      {/* ---------------- estimate + status note ---------------- */}
      {shipment.statusGroup === "exception" ? (
        <Alert variant="warning" title="حالة استثنائية على هذه الشحنة">
          تواصل مع الدعم للحصول على آخر التفاصيل حول هذه الشحنة.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent>
            <DataRow
              label="الحالة الحالية"
              value={STATUS_GROUP_LABELS[shipment.statusGroup] ?? shipment.statusGroup}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <DataRow
              label="الوزن الإجمالي"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <Scale className="size-4 text-muted" aria-hidden />
                  {formatWeight(shipment.weight)}
                </span>
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <DataRow
              label="عدد الطرود"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <Package className="size-4 text-muted" aria-hidden />
                  <span className="tabular">{shipment.packageCount}</span>
                </span>
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <DataRow
              label="رسوم الشحن"
              value={
                shipment.shippingFee
                  ? `${Number(shipment.shippingFee).toLocaleString("en-US")} ${shipment.currency}`
                  : "لم تُحدَّد بعد"
              }
            />
          </CardContent>
        </Card>
      </div>

      {/* ---------------- payment status ---------------- */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CreditCard className="size-4 text-muted" aria-hidden />
            <span className="text-sm font-bold text-ink">حالة الدفع</span>
            <Badge
              variant={PAYMENT_STATUS_VARIANTS[shipment.paymentStatus] ?? "neutral"}
            >
              {PAYMENT_STATUS_LABELS[shipment.paymentStatus] ?? shipment.paymentStatus}
            </Badge>
          </div>
          {shipment.paymentStatus === "unpaid" && shipment.shippingFee ? (
            <Link href="/payments" className={buttonVariantsSafe()}>
              متابعة الدفع
            </Link>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* ---------------- timeline ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>مسار الشحنة</CardTitle>
          </CardHeader>
          <CardContent>
            {shipment.events.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                لا توجد تحديثات مسجّلة على هذه الشحنة حتى الآن.
              </p>
            ) : (
              <ShipmentTimeline events={shipment.events} />
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {/* ---------------- estimated delivery ---------------- */}
          <Card>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4 text-muted" aria-hidden />
                <span className="text-sm font-bold text-ink">موعد التسليم المتوقع</span>
              </div>
              {shipment.estimatedDeliveryDate ? (
                <>
                  <p className="tabular text-lg font-extrabold text-ink">
                    {formatDate(shipment.estimatedDeliveryDate)}
                  </p>
                  <p className="text-xs leading-relaxed text-muted">
                    موعد تقريبي فقط وقد يتغير حسب حالة الشحن والتخليص الجمركي. ليس التزاماً
                    نهائياً.
                  </p>
                </>
              ) : (
                <p className="text-[13px] leading-relaxed text-muted">
                  لم يُحدَّد موعد متوقع لهذه الشحنة بعد. سيظهر هنا فور اعتماده من فريق العمليات.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ---------------- delivery address snapshot ---------------- */}
          <Card>
            <CardHeader>
              <CardTitle>عنوان التوصيل المؤكد</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {snapshot ? (
                <>
                  <p className="text-sm font-bold text-ink">{snapshot.recipientName}</p>
                  <p className="text-[13px] leading-relaxed text-muted">
                    {formatNationalAddress(snapshot)}
                  </p>
                  <p className="tabular text-[13px] text-muted" dir="ltr">
                    {snapshot.phone}
                  </p>
                  <div className="flex items-start gap-2 rounded-lg bg-surface-muted p-2.5 text-xs leading-relaxed text-muted">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>
                      هذا العنوان مثبّت لحظة إنشاء الشحنة ولا يتغيّر بتعديل دفتر العناوين. أي تغيير
                      يتطلّب اعتماد فريق الدعم.
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-muted">لم يُحدَّد عنوان توصيل لهذه الشحنة بعد.</p>
              )}
            </CardContent>
          </Card>

          {/* ---------------- shipment meta ---------------- */}
          <Card>
            <CardHeader>
              <CardTitle>بيانات الشحنة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DataRow label="الوصف" value={shipment.description} />
              <DataRow label="المصدر" value={shipment.origin} />
              {shipment.shippingMethod ? (
                <DataRow label="طريقة الشحن" value={shipment.shippingMethod} />
              ) : null}
              {shipment.dimensions ? (
                <DataRow label="الأبعاد" value={shipment.dimensions} />
              ) : null}
              <DataRow label="تاريخ الإنشاء" value={formatDate(shipment.createdAt)} />
              {shipment.notes ? <DataRow label="ملاحظات" value={shipment.notes} /> : null}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ---------------- packages ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>الطرود المرتبطة</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {shipment.packages.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-muted">
              لم تُربط أي طرود بهذه الشحنة بعد.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr>
                    <ThCell>رقم الطرد</ThCell>
                    <ThCell>رقم التتبع لدى الناقل</ThCell>
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
                      <TdCell>
                        {pkg.carrierTrackingNumber ? (
                          <span className="tabular">{pkg.carrierTrackingNumber}</span>
                        ) : (
                          "—"
                        )}
                      </TdCell>
                      <TdCell className="max-w-56">
                        <span className="line-clamp-2 text-muted">{pkg.description ?? "—"}</span>
                      </TdCell>
                      <TdCell className="tabular">{formatWeight(pkg.weight)}</TdCell>
                      <TdCell>
                        <Badge
                          variant={PACKAGE_STATUS_VARIANTS[pkg.packageStatus] ?? "neutral"}
                        >
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

      {/* ---------------- payment history ---------------- */}
      {shipment.payments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>سجل المدفوعات</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr>
                    <ThCell>المبلغ</ThCell>
                    <ThCell>العملة</ThCell>
                    <ThCell>طريقة الدفع</ThCell>
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
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs leading-relaxed text-subtle">
        تُعرض التحديثات المسجّلة من فريقنا فقط. لا نعرض أي معلومة تشغيلية غير موثّقة رسمياً.
      </p>
    </div>
  );
}

function buttonVariantsSafe() {
  return "inline-flex h-9 items-center justify-center rounded-lg bg-brand px-4 text-[13px] font-bold text-white transition-colors hover:bg-brand-dark";
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

function TdCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`border-b border-line px-4 py-3 text-ink last:border-b-0 ${className ?? ""}`}>
      {children}
    </td>
  );
}
