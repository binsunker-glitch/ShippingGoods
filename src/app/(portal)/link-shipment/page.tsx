import { Link2, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/ui/feedback";
import { CLAIM_STATUS_LABELS, CLAIM_STATUS_VARIANTS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import { listCustomerClaims } from "@/server/queries/customer";
import { ClaimForm } from "./claim-form";

export const metadata = { title: "ربط طرد" };

export default async function LinkShipmentPage() {
  const session = await requireCustomer();
  const claims = await listCustomerClaims(session.profileId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink sm:text-2xl">ربط طرد بحسابي</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
          اربط الشحنات الواردة باسمك في المستودع بحسابك لتتابعها وتطلب تجميعها. ربط الشحنة يتطلّب
          التحقق من الملكية قبل فتحها لك.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader>
            <CardTitle>طلب ربط شحنة</CardTitle>
          </CardHeader>
          <CardContent>
            <ClaimForm />
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand" aria-hidden />
                <span className="text-sm font-bold text-ink">كيف نتحقق من الملكية؟</span>
              </div>
              <ul className="space-y-2.5 text-[13px] leading-relaxed text-muted">
                <li className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                  إذا طابق رقم جوال الشحنة رقم جوال حسابك، يتم الربط تلقائياً فوراً.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                  إذا لم يتطابق الرقم، يذهب الطلب إلى فريق المستودع للمراجعة اليدوية.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                  لا يمكن لعميلَين الادّعاء بالملكية على الشحنة نفسها في وقت واحد.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                  كل محاولات الربط مسجّلة ومراجَعة ضمن سجل التدقيق.
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <DataRow
                label="رقم العميل الخاص بك"
                value={<span className="tabular">{session.customerNumber}</span>}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ---------------- claim history ---------------- */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Link2 className="size-4 text-muted" aria-hidden />
            <CardTitle>سجل طلبات الربط</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {claims.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              لم ترسل أي طلب ربط بعد.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr>
                    <ThCell>رقم تتبع الشحنة</ThCell>
                    <ThCell>رقم الناقل</ThCell>
                    <ThCell>الحالة</ThCell>
                    <ThCell>ملاحظة المراجعة</ThCell>
                    <ThCell>تاريخ الإرسال</ThCell>
                    <ThCell>تاريخ المراجعة</ThCell>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((claim) => (
                    <tr key={claim.id} className="border-b border-line last:border-b-0">
                      <TdCell>
                        <span className="tabular font-bold">
                          {claim.shipmentTrackingNumber ?? "—"}
                        </span>
                      </TdCell>
                      <TdCell className="tabular text-muted">
                        {claim.carrierTrackingNumber ?? "—"}
                      </TdCell>
                      <TdCell>
                        <Badge variant={CLAIM_STATUS_VARIANTS[claim.requestStatus] ?? "neutral"}>
                          {CLAIM_STATUS_LABELS[claim.requestStatus] ?? claim.requestStatus}
                        </Badge>
                      </TdCell>
                      <TdCell className="max-w-64">
                        <span className="line-clamp-2 text-muted">{claim.reviewNote ?? "—"}</span>
                      </TdCell>
                      <TdCell className="tabular whitespace-nowrap text-muted">
                        {formatDateTime(claim.createdAt)}
                      </TdCell>
                      <TdCell className="tabular whitespace-nowrap text-muted">
                        {claim.reviewedAt ? formatDateTime(claim.reviewedAt) : "—"}
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
