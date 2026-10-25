import { Boxes, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { formatDateTime, formatWeight } from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import { listConsolidationGroups } from "@/server/queries/customer";
import Link from "next/link";

export const metadata = { title: "التجميع والشحن" };

const GROUP_STATUS_LABELS: Record<string, string> = {
  open: "مفتوحة — تجميع جارٍ",
  confirmed: "مؤكدة — بانتظار الشحن",
  converted: "تم تحويلها إلى شحنة",
  cancelled: "ملغاة",
};

const GROUP_STATUS_VARIANTS: Record<string, "info" | "warning" | "success" | "neutral"> = {
  open: "info",
  confirmed: "warning",
  converted: "success",
  cancelled: "neutral",
};

export default async function ConsolidationPage() {
  const session = await requireCustomer();
  const groups = await listConsolidationGroups(session.profileId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink sm:text-2xl">التجميع والشحن</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
          دمج عدة طرود في شحنة واحدة يقلّل تكلفة الشحن. تُفتح مجموعة تجميع عندما يطلب فريقنا أو
          تطلب أنت دمج طرودك، ثم تتحول إلى شحنة عند اعتمادها.
        </p>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="لا توجد مجموعات تجميع بعد"
          description="عندما تصل طرودك إلى المستودع وتأهل للدمج، سيظهر هنا إمكانية تجميعها في شحنة واحدة لتوفير تكلفة الشحن."
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={group.id}>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-full bg-violet-soft text-violet">
                      <Boxes className="size-5" aria-hidden />
                    </span>
                    <div>
                      <p className="tabular text-sm font-extrabold text-ink">{group.groupReference}</p>
                      <p className="text-xs text-muted">أُنشئت في {formatDateTime(group.createdAt)}</p>
                    </div>
                  </div>
                  <Badge variant={GROUP_STATUS_VARIANTS[group.status] ?? "neutral"}>
                    {GROUP_STATUS_LABELS[group.status] ?? group.status}
                  </Badge>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-surface-muted px-3.5 py-2.5">
                    <p className="text-xs font-semibold text-muted">عدد الطرود</p>
                    <p className="tabular mt-0.5 text-lg font-extrabold text-ink">{group.packageCount}</p>
                  </div>
                  <div className="rounded-lg bg-surface-muted px-3.5 py-2.5">
                    <p className="text-xs font-semibold text-muted">الوزن الإجمالي التقريبي</p>
                    <p className="tabular mt-0.5 text-lg font-extrabold text-ink">
                      {formatWeight(group.totalWeight)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-muted px-3.5 py-2.5">
                    <p className="text-xs font-semibold text-muted">الشحنة الناتجة</p>
                    {group.shipmentId ? (
                      <Link
                        href={`/shipments/${group.shipmentId}`}
                        className="tabular mt-0.5 inline-block text-sm font-extrabold text-brand-dark hover:underline"
                      >
                        {group.shipmentTrackingNumber ?? "عرض الشحنة"}
                      </Link>
                    ) : (
                      <p className="mt-0.5 text-sm font-bold text-muted">لم تُنشأ بعد</p>
                    )}
                  </div>
                </div>

                {group.notes ? (
                  <p className="rounded-lg border border-line bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-muted">
                    <Truck className="me-1.5 inline size-3.5" aria-hidden />
                    {group.notes}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs leading-relaxed text-subtle">
        رسوم الشحن تُحتسب بعد الوزن الفعلي للمجموعة بعد الدمج، وتظهر على الشحنة الناتجة قبل طلب
        الدفع.
      </p>
    </div>
  );
}
