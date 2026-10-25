import Link from "next/link";
import { CreditCard, Info, ShieldCheck } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_VARIANTS, paymentGatewayName } from "@/lib/constants";
import { formatDateTime, formatRelative } from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import { listCustomerShipments } from "@/server/queries/shipments";

export const metadata = { title: "المدفوعات" };

export default async function PaymentsPage() {
  const session = await requireCustomer();
  const gateway = paymentGatewayName();

  // Only shipments that actually owe money are listed here.
  const owing = await listCustomerShipments(session.profileId, {
    status: "awaiting_payment",
    perPage: 50,
    sort: "newest",
  });
  const paid = await listCustomerShipments(session.profileId, {
    status: "delivered",
    perPage: 10,
    sort: "updated",
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink sm:text-2xl">المدفوعات</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
          ملخص الرسوم المستحقة على شحناتك وحالة دفع كل واحدة منها.
        </p>
      </div>

      {/* ---------------- gateway availability ---------------- */}
      {gateway ? (
        <Alert variant="info" title={`بوابة الدفع: ${gateway}`}>
          بوابة الدفع متصلة. لن تتم معالجة أي عملية دفع قبل تهيئة بيانات الاعتماد الخاصة بالبوابة
          من لوحة الإدارة.
        </Alert>
      ) : (
        <Alert variant="warning" title="الدفع الإلكتروني غير مُهيأ بعد">
          <div className="space-y-2">
            <p>
              بوابة الدفع الإلكتروني لم تُهيَّأ في هذه النسخة بعد، لذلك لا تظهر لك أزرار دفع
              إلكتروني. تواصل مع فريقنا لتسديد رسوم شحناتك بالطريقة المتاحة.
            </p>
            <p className="flex items-start gap-2 text-xs">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                يمكن لفريق المالية تسجيل الدفعات المستلمة يدوياً بعد التحقق منها، فيظهر هنا
                فور تسجيلها. لا تُخزَّن أي بيانات بطاقات داخل النظام.
              </span>
            </p>
          </div>
        </Alert>
      )}

      {/* ---------------- outstanding ---------------- */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-muted" aria-hidden />
            <CardTitle>شحنات بانتظار الدفع</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {owing.rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={ShieldCheck}
                title="لا توجد رسوم مستحقة حالياً"
                description="لا توجد شحنات برسوم غير مدفوعة على حسابك في هذه اللحظة."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <thead>
                  <tr>
                    <Th>رقم التتبع</Th>
                    <Th>وصف الشحنة</Th>
                    <Th>الرسوم</Th>
                    <Th>حالة الدفع</Th>
                    <Th>آخر تحديث</Th>
                    <Th className="text-end"> </Th>
                  </tr>
                </thead>
                <tbody>
                  {owing.rows.map((shipment) => (
                    <Tr key={shipment.id}>
                      <Td>
                        <span className="tabular font-bold">{shipment.trackingNumber}</span>
                      </Td>
                      <Td className="max-w-56">
                        <span className="line-clamp-2 text-muted">{shipment.description}</span>
                      </Td>
                      <Td className="tabular whitespace-nowrap">
                        {shipment.shippingFee
                          ? `${Number(shipment.shippingFee).toLocaleString("en-US")} ${shipment.currency ?? "SAR"}`
                          : "لم تُحدَّد"}
                      </Td>
                      <Td>
                        <Badge variant={PAYMENT_STATUS_VARIANTS[shipment.paymentStatus] ?? "neutral"}>
                          {PAYMENT_STATUS_LABELS[shipment.paymentStatus] ?? shipment.paymentStatus}
                        </Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        <span title={formatDateTime(shipment.updatedAt)}>
                          {formatRelative(shipment.updatedAt)}
                        </span>
                      </Td>
                      <Td className="text-end">
                        <Link href={`/shipments/${shipment.id}`} className={buttonVariants("outline", "sm")}>
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

      {/* ---------------- recent paid ---------------- */}
      {paid.rows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>آخر الشحنات المسلَّمة</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <thead>
                  <tr>
                    <Th>رقم التتبع</Th>
                    <Th>الرسوم</Th>
                    <Th>حالة الدفع</Th>
                    <Th>آخر تحديث</Th>
                    <Th className="text-end"> </Th>
                  </tr>
                </thead>
                <tbody>
                  {paid.rows.map((shipment) => (
                    <Tr key={shipment.id}>
                      <Td>
                        <span className="tabular font-bold">{shipment.trackingNumber}</span>
                      </Td>
                      <Td className="tabular whitespace-nowrap">
                        {shipment.shippingFee
                          ? `${Number(shipment.shippingFee).toLocaleString("en-US")} ${shipment.currency ?? "SAR"}`
                          : "—"}
                      </Td>
                      <Td>
                        <Badge variant={PAYMENT_STATUS_VARIANTS[shipment.paymentStatus] ?? "neutral"}>
                          {PAYMENT_STATUS_LABELS[shipment.paymentStatus] ?? shipment.paymentStatus}
                        </Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        {formatDateTime(shipment.updatedAt)}
                      </Td>
                      <Td className="text-end">
                        <Link href={`/shipments/${shipment.id}`} className={buttonVariants("ghost", "sm")}>
                          التفاصيل
                        </Link>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs leading-relaxed text-subtle">
        جميع المبالغ بالريال السعودي. لا نعرض رسوماً أو جمارك غير موثّقة رسمياً في النظام؛ أي رقم
        يظهر هنا مسجَّل من فريق المالية.
      </p>
    </div>
  );
}
