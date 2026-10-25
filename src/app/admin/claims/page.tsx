import Link from "next/link";
import { Link2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { CLAIM_STATUS_LABELS, CLAIM_STATUS_VARIANTS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/server/auth/guards";
import { listAllClaims } from "@/server/queries/admin";
import { ClaimReviewForm } from "./claim-review-form";

export const metadata = { title: "طلبات ربط الطرود" };

const STATUS_TABS = [
  { label: "الكل", value: "all" },
  { label: "قيد المراجعة", value: "pending" },
  { label: "تم التحقق تلقائياً", value: "auto_verified" },
  { label: "معتمد", value: "approved" },
  { label: "مرفوض", value: "rejected" },
];

type Search = { status?: string; page?: string };

function buildHref(base: Search, patch: Partial<Search>) {
  const merged = { ...base, ...patch };
  const params = new URLSearchParams();
  if (merged.status && merged.status !== "all") params.set("status", merged.status);
  const pageNum = Number(merged.page ?? 1);
  if (pageNum > 1) params.set("page", String(pageNum));
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

export default async function AdminClaimsPage({
  searchParams,
}: PageProps<"/admin/claims">) {
  await requirePermission("claims.read");
  const sp = await searchParams;

  const search: Search = {
    status: typeof sp.status === "string" ? sp.status : "all",
    page: typeof sp.page === "string" ? sp.page : "1",
  };

  const result = await listAllClaims({
    status: search.status,
    page: Number(search.page) || 1,
    perPage: 15,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="طلبات ربط الطرود"
        description="راجع طلبات العملاء لربط شحناتهم. الربط يمنح العميل وصولاً للشحنة، لذا تحقق من الملكية أولاً."
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
          <p className="text-[13px] text-muted">
            إجمالي <span className="tabular font-bold">{result.total}</span> طلب
          </p>
        </CardContent>
      </Card>

      {result.rows.length === 0 ? (
        <Card>
          <CardContent className="p-5">
            <EmptyState
              icon={Link2}
              title="لا توجد طلبات"
              description={
                search.status !== "all"
                  ? "جرّب تغيير التصفية لعرض طلبات أخرى."
                  : "لم يصل أي طلب ربط إلى النظام بعد."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {result.rows.map((claim) => {
            const open = ["pending", "auto_verified"].includes(claim.requestStatus);
            return (
              <Card key={claim.id}>
                <CardContent className="grid gap-5 lg:grid-cols-[1fr_320px]">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-dark">
                        <Link2 className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold text-ink">
                          {claim.customerName ?? "عميل محذوف"}
                        </p>
                        <p className="tabular text-xs text-muted">
                          {claim.customerNumber ?? "—"} · {claim.customerPhone ?? "—"}
                        </p>
                      </div>
                      <Badge variant={CLAIM_STATUS_VARIANTS[claim.requestStatus] ?? "neutral"}>
                        {CLAIM_STATUS_LABELS[claim.requestStatus] ?? claim.requestStatus}
                      </Badge>
                    </div>

                    <dl className="grid gap-3 sm:grid-cols-2">
                      <Detail label="رقم تتبع الشحنة (رقمنا)">
                        <span className="tabular">{claim.shipmentTrackingNumber ?? "لم يُدخل"}</span>
                      </Detail>
                      <Detail label="رقم تتبّع الناقل">
                        <span className="tabular">{claim.carrierTrackingNumber ?? "—"}</span>
                      </Detail>
                      <Detail label="وصف المحتوى">
                        <span>{claim.description ?? "—"}</span>
                      </Detail>
                      <Detail label="تاريخ الإرسال">
                        <span className="tabular">{formatDateTime(claim.createdAt)}</span>
                      </Detail>
                    </dl>

                    {claim.reviewNote ? (
                      <div className="rounded-lg bg-surface-muted px-3.5 py-2.5 text-[13px] leading-relaxed text-muted">
                        <span className="font-bold text-ink">ملاحظة المراجعة:</span> {claim.reviewNote}
                        {claim.reviewedAt ? (
                          <span className="tabular mt-1 block text-xs text-subtle">
                            رُوجع في {formatDateTime(claim.reviewedAt)}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-line bg-surface-muted p-4">
                    <p className="mb-3 text-[13px] font-bold text-ink">مراجعة الطلب</p>
                    {open ? (
                      <ClaimReviewForm claimId={claim.id} trackingNumber={claim.shipmentTrackingNumber} />
                    ) : (
                      <p className="text-[13px] leading-relaxed text-muted">
                        تمت مراجعة هذا الطلب مسبقاً.
                      </p>
                    )}
                    <p className="mt-3 text-xs leading-relaxed text-subtle">
                      لا يمكن لعميلَين الادّعاء بالملكية على الشحنة نفسها؛ المفهرس الفريد في
                      قاعدة البيانات يمنع ذلك حتى عند التزامن.
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
              <Link href={buildHref(search, { page: String(result.page - 1) })} className="inline-flex h-8 items-center rounded-lg border border-line-strong bg-white px-3 text-[13px] font-bold text-ink hover:bg-surface-muted">
                السابقة
              </Link>
            ) : null}
            {result.page < result.totalPages ? (
              <Link href={buildHref(search, { page: String(result.page + 1) })} className="inline-flex h-8 items-center rounded-lg border border-line-strong bg-white px-3 text-[13px] font-bold text-ink hover:bg-surface-muted">
                التالية
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}
