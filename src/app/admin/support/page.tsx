import Link from "next/link";
import { LifeBuoy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Pagination } from "@/components/ui/pagination";
import {
  PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_VARIANTS,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/guards";
import { listAllTickets } from "@/server/queries/admin";
import { TicketReplyForm } from "./ticket-reply-form";

export const metadata = { title: "تذاكر الدعم" };

const STATUS_TABS = [
  { label: "الكل", value: "all" },
  { label: "مفتوحة", value: "open" },
  { label: "قيد المعالجة", value: "in_progress" },
  { label: "تم الرد", value: "answered" },
  { label: "مغلقة", value: "closed" },
];

const PRIORITY_VARIANTS: Record<string, "neutral" | "warning" | "danger" | "info"> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  urgent: "danger",
};

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

export default async function AdminSupportPage({
  searchParams,
}: PageProps<"/admin/support">) {
  const session = await requirePermission("support.read");
  const canReply = can(session.role, "support.reply");
  const sp = await searchParams;

  const search: Search = {
    status: typeof sp.status === "string" ? sp.status : "all",
    page: typeof sp.page === "string" ? sp.page : "1",
  };

  const result = await listAllTickets({
    status: search.status,
    page: Number(search.page) || 1,
    perPage: 10,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="تذاكر الدعم"
        description="استقبل أسئلة عملائك وأجبهم من هنا. يصل الرد للعميل في صفحة المساعدة مع إشعار فوري."
      />

      <Card>
        <CardContent className="space-y-4">
          <nav aria-label="تصفية حسب حالة التذكرة" className="flex flex-wrap gap-2">
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
            إجمالي <span className="tabular font-bold">{result.total}</span> تذكرة
          </p>
        </CardContent>
      </Card>

      {result.rows.length === 0 ? (
        <Card>
          <CardContent className="p-5">
            <EmptyState
              icon={LifeBuoy}
              title="لا توجد تذاكر"
              description={
                search.status !== "all"
                  ? "جرّب تغيير التصفية لعرض تذاكر أخرى."
                  : "لم تصل أي تذكرة دعم إلى النظام بعد."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {result.rows.map((ticket) => (
            <Card key={ticket.id}>
              <CardContent className="grid gap-5 lg:grid-cols-[1fr_360px]">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-dark">
                      <LifeBuoy className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-ink">{ticket.subject}</p>
                      <p className="tabular text-xs text-muted">
                        {ticket.ticketNumber} · {ticket.customerName ?? "عميل محذوف"} ·{" "}
                        {ticket.customerNumber ?? "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={TICKET_STATUS_VARIANTS[ticket.status] ?? "neutral"}>
                      {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
                    </Badge>
                    <Badge variant={PRIORITY_VARIANTS[ticket.priority] ?? "neutral"}>
                      الأولوية: {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                    </Badge>
                    <span className="tabular text-xs text-subtle">
                      أُرسلت في {formatDateTime(ticket.createdAt)}
                    </span>
                  </div>

                  <div className="rounded-lg bg-surface-muted px-3.5 py-3 text-sm leading-relaxed text-ink">
                    {ticket.description}
                  </div>

                  {ticket.repliedAt ? (
                    <div className="rounded-lg border border-success/30 bg-success-soft/40 px-3.5 py-3">
                      <p className="text-xs font-bold text-success">
                        آخر رد — {formatDateTime(ticket.repliedAt)}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink">{ticket.reply}</p>
                    </div>
                  ) : null}

                  {ticket.customerId ? (
                    <Link
                      href={`/admin/customers/${ticket.customerId}`}
                      className="inline-block text-[13px] font-bold text-brand-dark hover:underline"
                    >
                      عرض ملف العميل
                    </Link>
                  ) : null}
                </div>

                <div className="rounded-xl border border-line bg-surface-muted p-4">
                  <p className="mb-3 text-[13px] font-bold text-ink">الرد على التذكرة</p>
                  {canReply ? (
                    <TicketReplyForm ticketId={ticket.id} existingReply={ticket.reply} />
                  ) : (
                    <p className="text-[13px] leading-relaxed text-muted">
                      عرض فقط — الرد على التذاكر متاح لأدوار: المدير العام، دعم العملاء، ومدير
                      العمليات.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        basePath="/admin/support"
        params={{ status: search.status === "all" ? undefined : search.status }}
      />
    </div>
  );
}
