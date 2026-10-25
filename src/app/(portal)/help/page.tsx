import { LifeBuoy, Mail, MessageSquare, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataRow } from "@/components/ui/feedback";
import { PRIORITY_LABELS, TICKET_STATUS_LABELS, TICKET_STATUS_VARIANTS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import { listSupportTickets } from "@/server/queries/customer";
import { getSiteSetting } from "@/server/queries/settings";
import { TicketForm } from "./ticket-form";

export const metadata = { title: "مركز المساعدة" };

type FaqItem = { question: string; answer: string };
type ContactSettings = {
  phone?: string;
  email?: string;
  whatsapp?: string;
  hours?: string;
};

export default async function HelpPage() {
  const session = await requireCustomer();
  const [tickets, faq, contact] = await Promise.all([
    listSupportTickets(session.profileId),
    getSiteSetting<FaqItem[]>("faq"),
    getSiteSetting<ContactSettings>("contact"),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink sm:text-2xl">مركز المساعدة</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
          ابحث في الأسئلة الشائعة أو أرسل طلباً موثقاً يصلك رقم تذكرة مخصص للمتابعة.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* ---------------- ticket form ---------------- */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="size-4 text-muted" aria-hidden />
              <CardTitle>إرسال طلب إلى الدعم</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <TicketForm />
          </CardContent>
        </Card>

        <div className="space-y-5">
          {/* ---------------- contact ---------------- */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <LifeBuoy className="size-4 text-muted" aria-hidden />
                <CardTitle>معلومات التواصل</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {contact?.phone ? (
                <DataRow
                  label="الهاتف"
                  value={
                    <span className="inline-flex items-center gap-1.5" dir="ltr">
                      <Phone className="size-3.5 text-muted" aria-hidden />
                      {contact.phone}
                    </span>
                  }
                />
              ) : null}
              {contact?.email ? (
                <DataRow
                  label="البريد الإلكتروني"
                  value={
                    <span className="inline-flex items-center gap-1.5" dir="ltr">
                      <Mail className="size-3.5 text-muted" aria-hidden />
                      {contact.email}
                    </span>
                  }
                />
              ) : null}
              {contact?.whatsapp ? (
                <DataRow
                  label="واتساب"
                  value={
                    <span className="inline-flex items-center gap-1.5" dir="ltr">
                      {contact.whatsapp}
                    </span>
                  }
                />
              ) : null}
              {contact?.hours ? (
                <DataRow label="ساعات العمل" value={contact.hours} />
              ) : null}
              {!contact?.phone && !contact?.email && !contact?.whatsapp ? (
                <p className="text-[13px] leading-relaxed text-muted">
                  لم تُضبط بيانات التواصل في النظام بعد. راجع هذه الصفحة لاحقاً أو استخدم إرسال
                  الطلب من النموذج.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* ---------------- FAQ ---------------- */}
          {faq && faq.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>الأسئلة الشائعة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {faq.map((item, index) => (
                  <details key={index} className="group rounded-lg border border-line bg-white">
                    <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-bold text-ink">
                      {item.question}
                    </summary>
                    <p className="border-t border-line px-4 py-3 text-[13px] leading-relaxed text-muted">
                      {item.answer}
                    </p>
                  </details>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* ---------------- ticket history ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>طلباتي السابقة</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {tickets.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              لم ترسل أي طلب دعم بعد.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-sm">
                <thead>
                  <tr>
                    <ThCell>رقم التذكرة</ThCell>
                    <ThCell>الموضوع</ThCell>
                    <ThCell>الحالة</ThCell>
                    <ThCell>الأولوية</ThCell>
                    <ThCell>رد الدعم</ThCell>
                    <ThCell>تاريخ الإنشاء</ThCell>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="border-b border-line last:border-b-0">
                      <TdCell>
                        <span className="tabular font-bold">{ticket.ticketNumber}</span>
                      </TdCell>
                      <TdCell className="max-w-56">
                        <span className="line-clamp-2">{ticket.subject}</span>
                      </TdCell>
                      <TdCell>
                        <Badge variant={TICKET_STATUS_VARIANTS[ticket.status] ?? "neutral"}>
                          {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
                        </Badge>
                      </TdCell>
                      <TdCell className="text-muted">
                        {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                      </TdCell>
                      <TdCell className="max-w-64">
                        {ticket.reply ? (
                          <div className="space-y-1">
                            <span className="line-clamp-2 text-muted">{ticket.reply}</span>
                            {ticket.repliedAt ? (
                              <span className="text-xs text-subtle">
                                {formatDateTime(ticket.repliedAt)}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-subtle">لم يتم الرد بعد</span>
                        )}
                      </TdCell>
                      <TdCell className="tabular whitespace-nowrap text-muted">
                        {formatDateTime(ticket.createdAt)}
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
