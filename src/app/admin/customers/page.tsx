import Link from "next/link";
import { Search, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { formatDate, formatRelative } from "@/lib/format";
import { requirePermission } from "@/server/auth/guards";
import { listCustomers } from "@/server/queries/admin";

export const metadata = { title: "العملاء" };

type Search = { q?: string; status?: string; page?: string };

function buildHref(base: Search, patch: Partial<Search>) {
  const merged = { ...base, ...patch };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.status && merged.status !== "all") params.set("status", merged.status);
  const pageNum = Number(merged.page ?? 1);
  if (pageNum > 1) params.set("page", String(pageNum));
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

export default async function AdminCustomersPage({
  searchParams,
}: PageProps<"/admin/customers">) {
  await requirePermission("customers.read");
  const sp = await searchParams;

  const search: Search = {
    q: typeof sp.q === "string" ? sp.q.trim() : "",
    status: typeof sp.status === "string" ? sp.status : "all",
    page: typeof sp.page === "string" ? sp.page : "1",
  };

  const result = await listCustomers({
    q: search.q || undefined,
    status: search.status,
    page: Number(search.page) || 1,
    perPage: 15,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="إدارة العملاء"
        description="ابحث عن العملاء واعرض تفاصيل حساباتهم وإيقاف أو تفعيل الحسابات عند الحاجة."
      />

      <Card>
        <CardContent className="space-y-4">
          <form className="grid gap-3 sm:grid-cols-[1fr_200px]" role="search">
            <div className="relative">
              <Search
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                type="search"
                name="q"
                defaultValue={search.q}
                placeholder="ابحث بالاسم أو رقم العميل أو الجوال أو البريد..."
                className="ps-9"
                aria-label="بحث في العملاء"
              />
            </div>
            <Select name="status" defaultValue={search.status} aria-label="تصفية حسب الحالة">
              <option value="all">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="suspended">موقوف</option>
            </Select>
          </form>
          <p className="text-[13px] text-muted">
            إجمالي <span className="tabular font-bold">{result.total}</span> عميل
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {result.rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Users}
                title="لا توجد نتائج"
                description={
                  search.q || search.status !== "all"
                    ? "جرّب تعديل البحث أو التصفية."
                    : "لم يُسجَّل أي عميل في النظام بعد."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[900px]">
                <thead>
                  <tr>
                    <Th>رقم العميل</Th>
                    <Th>الاسم</Th>
                    <Th>الجوال</Th>
                    <Th>البريد الإلكتروني</Th>
                    <Th>المدينة</Th>
                    <Th>الحالة</Th>
                    <Th>تاريخ التسجيل</Th>
                    <Th className="text-end"> </Th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((customer) => (
                    <Tr key={customer.id}>
                      <Td>
                        <span className="tabular font-bold">{customer.customerNumber}</span>
                      </Td>
                      <Td className="font-semibold">{customer.fullName}</Td>
                      <Td className="tabular whitespace-nowrap text-muted" dir="ltr">
                        {customer.phone}
                      </Td>
                      <Td className="text-muted" dir="ltr">
                        {customer.email ?? "—"}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{customer.city}</Td>
                      <Td>
                        {customer.accountStatus === "active" ? (
                          <Badge variant="success">نشط</Badge>
                        ) : (
                          <Badge variant="danger">موقوف</Badge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">
                        <span title={formatDate(customer.createdAt)}>
                          {formatRelative(customer.createdAt)}
                        </span>
                      </Td>
                      <Td className="text-end">
                        <Link
                          href={`/admin/customers/${customer.id}`}
                          className={buttonVariants("outline", "sm")}
                        >
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
              <Link href={buildHref(search, { page: String(result.page - 1) })} className={buttonVariants("outline", "sm")}>
                السابقة
              </Link>
            ) : null}
            {result.page < result.totalPages ? (
              <Link href={buildHref(search, { page: String(result.page + 1) })} className={buttonVariants("outline", "sm")}>
                التالية
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
