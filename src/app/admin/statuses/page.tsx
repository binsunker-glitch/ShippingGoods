import { GitBranch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { STATUS_GROUP_LABELS, STATUS_GROUP_VARIANTS } from "@/lib/constants";
import { requirePermission } from "@/server/auth/guards";
import { listStatusCatalog, listStatusTransitions } from "@/server/queries/admin";
import {
  AddTransitionForm,
  StatusFlagToggle,
  TransitionToggle,
} from "./status-controls";

export const metadata = { title: "حالات الشحن" };

export default async function AdminStatusesPage() {
  await requirePermission("statuses.manage");

  const [catalog, transitions] = await Promise.all([
    listStatusCatalog(),
    listStatusTransitions(),
  ]);

  const labelOf = (code: string) => catalog.find((row) => row.code === code)?.labelAr ?? code;

  // Group the matrix rows by their source status so it reads like a flow.
  const groups = catalog
    .map((status) => ({
      status,
      edges: transitions
        .filter((edge) => edge.fromStatus === status.code)
        .sort((a, b) => labelOf(a.toStatus).localeCompare(labelOf(b.toStatus), "ar")),
    }))
    .filter((group) => group.edges.length > 0);

  const activeEdges = transitions.filter((edge) => edge.isActive).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="حالات الشحن"
        description="كتالوج الحالات ومصفوفة الانتقالات بينها. أي انتقال موقوف يُرفض فوراً عند محاولة تغيير حالة شحنة، ويظهر سبب الرفض للموظف."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted">حالات في الكتالوج</p>
            <p className="mt-1 text-2xl font-extrabold tabular text-ink">{catalog.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted">انتقالات مفعّلة</p>
            <p className="mt-1 text-2xl font-extrabold tabular text-ink">
              {activeEdges} / {transitions.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted">حالات استثناء</p>
            <p className="mt-1 text-2xl font-extrabold tabular text-ink">
              {catalog.filter((row) => row.isException).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>كتالوج الحالات</CardTitle>
            <CardDescription>
              أوقف حالة غير مستخدمة، أو صنّفها كاستثناء، أو اجعلها مقصورة على المدير العام.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-line">
            {catalog.map((status) => (
              <div
                key={status.code}
                className="grid gap-4 px-4 py-4 lg:grid-cols-[1fr_1fr_1fr_1fr]"
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-ink">{status.labelAr}</p>
                  <p className="tabular text-xs text-muted">{status.code}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant={STATUS_GROUP_VARIANTS[status.group]}>
                      {STATUS_GROUP_LABELS[status.group]}
                    </Badge>
                    <Badge variant="neutral">ترتيب {status.sortOrder}</Badge>
                  </div>
                </div>

                <StatusFlagToggle
                  code={status.code}
                  labelAr={status.labelAr}
                  flag="isActive"
                  flagLabel="مفعّلة"
                  value={status.isActive}
                />
                <StatusFlagToggle
                  code={status.code}
                  labelAr={status.labelAr}
                  flag="isException"
                  flagLabel="حالة استثناء"
                  value={status.isException}
                />
                <StatusFlagToggle
                  code={status.code}
                  labelAr={status.labelAr}
                  flag="restricted"
                  flagLabel="مقصورة على المدير العام"
                  value={status.restricted}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>مصفوفة الانتقالات</CardTitle>
              <CardDescription>
                الانتقالات الموقوفة لا تظهر كخيار عند تغيير حالة الشحنة، والخادم يرفضها في كل الأحوال.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {groups.length === 0 ? (
              <EmptyState
                icon={GitBranch}
                title="لا توجد انتقالات"
                description="أضف أول انتقال من النموذج المجاور لتتمكن من تغيير حالات الشحنات."
              />
            ) : (
              groups.map((group) => (
                <section key={group.status.code} className="space-y-2.5">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                    <Badge variant={STATUS_GROUP_VARIANTS[group.status.group]}>
                      {STATUS_GROUP_LABELS[group.status.group]}
                    </Badge>
                    {group.status.labelAr}
                    {!group.status.isActive ? (
                      <Badge variant="danger">موقوفة</Badge>
                    ) : null}
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.edges.map((edge) => (
                      <div
                        key={edge.id}
                        className="rounded-xl border border-line bg-surface-muted px-3.5 py-3"
                      >
                        <TransitionToggle
                          transitionId={edge.id}
                          fromLabel={group.status.labelAr}
                          toLabel={labelOf(edge.toStatus)}
                          isActive={edge.isActive}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>إضافة انتقال جديد</CardTitle>
              <CardDescription>حدّد الحالة الحالية والحالة المسموح الوصول إليها.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <AddTransitionForm
              statusOptions={catalog
                .filter((row) => row.isActive)
                .map((row) => ({ code: row.code, labelAr: row.labelAr }))}
            />
            <p className="mt-4 text-xs leading-relaxed text-subtle">
              يُسجَّل كل تعديل في سجل التدقيق باسمك. الإيقاف يسري على كل الموظفين فوراً.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
