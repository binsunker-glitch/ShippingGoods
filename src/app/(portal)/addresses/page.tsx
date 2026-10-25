import { Home, MapPin, Pencil, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { formatNationalAddress } from "@/lib/format";
import { setDefaultAddressAction } from "@/server/actions/addresses";
import { requireCustomer } from "@/server/auth/guards";
import { listAddressesWithLock } from "@/server/queries/addresses";
import { AddressDialog } from "./address-dialog";
import { DeleteAddressButton } from "./delete-address-button";

export const metadata = { title: "العناوين" };

export default async function AddressesPage() {
  const session = await requireCustomer();
  const addresses = await listAddressesWithLock(session.profileId);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-ink sm:text-2xl">عناويني</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            احفظ عناوين التوصيل داخل المملكة لاستخدامها في شحناتك. لا يمكن حذف عنوان مرتبط بشحنة
            نشطة، وعنوان أي شحنة مؤكدة لا يتغير بمجرد تعديل دفتر العناوين.
          </p>
        </div>
        <AddressDialog />
      </section>

      {addresses.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="لا توجد عناوين محفوظة بعد"
          description="أضف عنوان توصيل واحداً على الأقل حتى نتمكن من تسليم طرودك داخل السعودية."
          action={<AddressDialog />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {addresses.map((address) => (
            <Card key={address.id} className={address.isDefault ? "border-brand/40" : undefined}>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-dark">
                      <Home className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink">
                        {address.label || address.recipientName}
                      </p>
                      <p className="truncate text-xs text-muted">{address.recipientName}</p>
                    </div>
                  </div>
                  {address.isDefault ? (
                    <Badge variant="brand">
                      <Star className="size-3" aria-hidden />
                      افتراضي
                    </Badge>
                  ) : null}
                </div>

                <p className="text-[13px] leading-relaxed text-muted">
                  {formatNationalAddress(address)}
                </p>

                <p className="tabular text-[13px] text-muted" dir="ltr">
                  {address.phone}
                </p>

                {address.locked ? (
                  <Badge variant="warning">مرتبط بشحنة نشطة — لا يمكن حذفه</Badge>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  {address.isDefault ? (
                    <span className="text-xs font-semibold text-success">العنوان الافتراضي</span>
                  ) : (
                    <form action={setDefaultAddressAction}>
                      <input type="hidden" name="id" value={address.id} />
                      <button
                        type="submit"
                        className="text-xs font-bold text-brand-dark transition-colors hover:underline"
                      >
                        تعيين كافتراضي
                      </button>
                    </form>
                  )}

                  <div className="flex items-center gap-1">
                    <AddressDialog
                      address={{
                        id: address.id,
                        label: address.label ?? "",
                        recipientName: address.recipientName,
                        phone: address.phone,
                        city: address.city,
                        district: address.district,
                        street: address.street,
                        buildingNumber: address.buildingNumber,
                        secondaryNumber: address.secondaryNumber ?? "",
                        postalCode: address.postalCode,
                        nationalAddressShortCode: address.nationalAddressShortCode ?? "",
                        addressDetails: address.addressDetails ?? "",
                      }}
                      trigger={
                        <button
                          type="button"
                          aria-label="تعديل العنوان"
                          className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-ink"
                        >
                          <Pencil className="size-4" aria-hidden />
                        </button>
                      }
                    />
                    <DeleteAddressButton
                      id={address.id}
                      recipientName={address.recipientName}
                      disabled={address.locked}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs leading-relaxed text-subtle">
        العنوان الوطني السعودي يتكوّن من: رقم المبنى، الشارع، الحي، المدينة، الرمز البريدي، و Short
        Code المكوّن من خمسة أرقام وثلاثة أحرف (اختياري).
      </p>
    </div>
  );
}
