"use client";

import { useActionState, useState } from "react";
import { Plus, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SAUDI_CITIES } from "@/lib/constants";
import type { ActionState } from "@/lib/action-state";
import type { AddressInput } from "@/lib/validation";
import { saveAddressAction } from "@/server/actions/addresses";

export type AddressFormRow = Pick<
  AddressInput,
  | "label"
  | "recipientName"
  | "phone"
  | "city"
  | "district"
  | "street"
  | "buildingNumber"
  | "secondaryNumber"
  | "postalCode"
  | "nationalAddressShortCode"
  | "addressDetails"
> & { id?: string };

/** Opens the shared address form in a modal; used for both create and edit. */
export function AddressDialog({
  address,
  trigger,
}: {
  address?: AddressFormRow;
  /** Omit to render the default "new address" trigger button. */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const editing = Boolean(address?.id);

  // The modal closes inside the action (an async event context), never in an
  // effect: closing is a direct response to the server's confirmation. A null
  // state on success also keeps the stale success banner off the next open.
  const saveAndMaybeClose = async (
    _prev: ActionState,
    formData: FormData,
  ): Promise<ActionState> => {
    const result = await saveAddressAction(_prev, formData);
    if (result?.ok) {
      setOpen(false);
      return null;
    }
    return result;
  };

  const [state, formAction, pending] = useActionState(saveAndMaybeClose, null);
  const errors = state?.errors ?? {};

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)} className="contents">
          {trigger}
        </span>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden />
          عنوان جديد
        </Button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={editing ? "تعديل العنوان" : "إضافة عنوان جديد"}
        description="أدخل عنوان التوصيل بدقة. لا يمكن تعديل عنوان شحنة مؤكدة بعد إنشائها."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              <X className="size-4" aria-hidden />
              إلغاء
            </Button>
            <Button form="address-form" type="submit" disabled={pending}>
              <Save className="size-4" aria-hidden />
              {pending ? "جارٍ الحفظ..." : "حفظ العنوان"}
            </Button>
          </>
        }
      >
        <form id="address-form" action={formAction} className="space-y-4">
          {address?.id ? <input type="hidden" name="id" value={address.id} /> : null}

          {state?.message && !state.ok ? (
            <Alert variant="danger" title="تعذّر الحفظ">
              {state.message}
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              htmlFor="label"
              label="اسم العنوان (اختياري)"
              hint="مثال: المنزل، المكتب"
              error={errors.label}
            >
              <Input id="label" name="label" defaultValue={address?.label ?? ""} />
            </Field>

            <Field
              htmlFor="recipientName"
              label="اسم المستلم"
              required
              error={errors.recipientName}
            >
              <Input
                id="recipientName"
                name="recipientName"
                defaultValue={address?.recipientName ?? ""}
                invalid={Boolean(errors.recipientName)}
              />
            </Field>

            <Field htmlFor="phone" label="رقم الجوال" required error={errors.phone}>
              <Input
                id="phone"
                name="phone"
                inputMode="tel"
                dir="ltr"
                className="text-end"
                placeholder="05XXXXXXXX"
                defaultValue={address?.phone ?? ""}
                invalid={Boolean(errors.phone)}
              />
            </Field>

            <Field htmlFor="city" label="المدينة" required error={errors.city}>
              <Select
                id="city"
                name="city"
                defaultValue={address?.city ?? ""}
                invalid={Boolean(errors.city)}
              >
                <option value="" disabled>
                  اختر المدينة
                </option>
                {SAUDI_CITIES.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="district" label="الحي" required error={errors.district}>
              <Input
                id="district"
                name="district"
                defaultValue={address?.district ?? ""}
                invalid={Boolean(errors.district)}
              />
            </Field>

            <Field htmlFor="street" label="الشارع" required error={errors.street}>
              <Input
                id="street"
                name="street"
                defaultValue={address?.street ?? ""}
                invalid={Boolean(errors.street)}
              />
            </Field>

            <Field
              htmlFor="buildingNumber"
              label="رقم المبنى"
              required
              error={errors.buildingNumber}
            >
              <Input
                id="buildingNumber"
                name="buildingNumber"
                inputMode="numeric"
                defaultValue={address?.buildingNumber ?? ""}
                invalid={Boolean(errors.buildingNumber)}
              />
            </Field>

            <Field
              htmlFor="secondaryNumber"
              label="الرقم الفرعي (اختياري)"
              hint="يظهر أحياناً على عنوان العنوان الوطني"
              error={errors.secondaryNumber}
            >
              <Input
                id="secondaryNumber"
                name="secondaryNumber"
                inputMode="numeric"
                defaultValue={address?.secondaryNumber ?? ""}
              />
            </Field>

            <Field
              htmlFor="postalCode"
              label="الرمز البريدي"
              required
              error={errors.postalCode}
            >
              <Input
                id="postalCode"
                name="postalCode"
                inputMode="numeric"
                dir="ltr"
                className="text-end"
                defaultValue={address?.postalCode ?? ""}
                invalid={Boolean(errors.postalCode)}
              />
            </Field>

            <Field
              htmlFor="nationalAddressShortCode"
              label="Short Code (اختياري)"
              hint="رمز من خمسة أرقام وثلاثة أحرف من العنوان الوطني"
              error={errors.nationalAddressShortCode}
            >
              <Input
                id="nationalAddressShortCode"
                name="nationalAddressShortCode"
                dir="ltr"
                className="text-end uppercase"
                placeholder="1234 ABC"
                defaultValue={address?.nationalAddressShortCode ?? ""}
              />
            </Field>
          </div>

          <Field
            htmlFor="addressDetails"
            label="تفاصيل إضافية للتوصيل (اختياري)"
            hint="مثال: الدور الثالث، مدخل B"
            error={errors.addressDetails}
          >
            <Textarea
              id="addressDetails"
              name="addressDetails"
              rows={3}
              defaultValue={address?.addressDetails ?? ""}
            />
          </Field>

          <Field
            htmlFor="isDefault"
            label="تعيين كعنوان افتراضي"
            hint="سيُستخدم تلقائياً في شحناتك الجديدة"
            error={errors.isDefault}
          >
            <label className="inline-flex cursor-pointer items-center gap-2.5">
              <input
                id="isDefault"
                name="isDefault"
                type="checkbox"
                className="size-4 cursor-pointer accent-brand"
              />
              <span className="text-sm text-muted">استخدم هذا العنوان افتراضياً</span>
            </label>
          </Field>
        </form>
      </Dialog>
    </>
  );
}
