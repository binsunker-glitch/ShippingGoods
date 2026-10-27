"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { addressSchema, fieldErrors } from "@/lib/validation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/server/audit";
import { requireCustomerAction } from "@/server/auth/guards";
import {
  addressToValues,
  countAddresses,
  getAddress,
  isAddressLocked,
} from "@/server/queries/addresses";

function readForm(formData: FormData) {
  return {
    id: String(formData.get("id") ?? ""),
    label: String(formData.get("label") ?? ""),
    recipientName: String(formData.get("recipientName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    city: String(formData.get("city") ?? ""),
    district: String(formData.get("district") ?? ""),
    street: String(formData.get("street") ?? ""),
    buildingNumber: String(formData.get("buildingNumber") ?? ""),
    secondaryNumber: String(formData.get("secondaryNumber") ?? ""),
    postalCode: String(formData.get("postalCode") ?? ""),
    nationalAddressShortCode: String(formData.get("nationalAddressShortCode") ?? ""),
    addressDetails: String(formData.get("addressDetails") ?? ""),
    isDefault: formData.get("isDefault") === "on",
  };
}

export async function saveAddressAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCustomerAction();
  if (!session) return { ok: false, message: "انتهت الجلسة. سجّل الدخول مجدداً." };

  const raw = readForm(formData);
  const parsed = addressSchema.safeParse(raw);
  if (!parsed.success) {
    const echo: Record<string, string> = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, String(value)]),
    );
    return { ok: false, message: "راجع الحقول المحددة.", errors: fieldErrors(parsed.error), data: echo };
  }

  const existing = raw.id ? await getAddress(session.profileId, raw.id) : null;
  if (raw.id && !existing) {
    return { ok: false, message: "العنوان غير موجود أو لا يخص حسابك." };
  }

  const total = await countAddresses(session.profileId);
  const makeDefault = parsed.data.isDefault || total === 0;

  const supabase = await createClient();
  try {
    // Clear any existing default first (DB also enforces one default per customer).
    if (makeDefault) {
      await supabase
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("customer_id", session.profileId);
    }

    if (existing) {
      const { error } = await supabase
        .from("customer_addresses")
        .update({ ...addressToValues(parsed.data), is_default: makeDefault })
        .eq("id", existing.id)
        .eq("customer_id", session.profileId);
      if (error) throw new Error(error.message);
      await logAudit({
        actorId: session.profileId,
        actorLabel: session.fullName,
        action: "address.updated",
        entityType: "customer_address",
        entityId: existing.id,
      });
    } else {
      const { error } = await supabase.from("customer_addresses").insert({
        customer_id: session.profileId,
        ...addressToValues(parsed.data),
        is_default: makeDefault,
      });
      if (error) throw new Error(error.message);
      await logAudit({
        actorId: session.profileId,
        actorLabel: session.fullName,
        action: "address.created",
        entityType: "customer_address",
      });
    }
  } catch (error) {
    console.error("[addresses] save failed", error);
    return { ok: false, message: "تعذّر حفظ العنوان. حاول مرة أخرى." };
  }

  revalidatePath("/addresses");
  return { ok: true, message: existing ? "تم تحديث العنوان بنجاح." : "تمت إضافة العنوان بنجاح." };
}

export async function setDefaultAddressAction(formData: FormData): Promise<void> {
  const session = await requireCustomerAction();
  if (!session) return;

  const id = String(formData.get("id") ?? "");
  const address = await getAddress(session.profileId, id);
  if (!address) return;

  const supabase = await createClient();
  await supabase
    .from("customer_addresses")
    .update({ is_default: false })
    .eq("customer_id", session.profileId);
  await supabase
    .from("customer_addresses")
    .update({ is_default: true })
    .eq("id", address.id)
    .eq("customer_id", session.profileId);
  await logAudit({
    actorId: session.profileId,
    actorLabel: session.fullName,
    action: "address.set_default",
    entityType: "customer_address",
    entityId: address.id,
  });

  revalidatePath("/addresses");
}

export async function deleteAddressAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCustomerAction();
  if (!session) return { ok: false, message: "انتهت الجلسة. سجّل الدخول مجدداً." };

  const id = String(formData.get("id") ?? "");
  const address = await getAddress(session.profileId, id);
  if (!address) return { ok: false, message: "العنوان غير موجود أو لا يخص حسابك." };

  const total = await countAddresses(session.profileId);
  if (total <= 1) {
    return { ok: false, message: "لا يمكن حذف آخر عنوان في حسابك." };
  }

  if (await isAddressLocked(address.id)) {
    return {
      ok: false,
      message:
        "هذا العنوان مرتبط بشحنة نشطة، ولا يمكن حذفه حتى اكتمال عملية التسليم. يمكنك تعديله من خلال الإدارة.",
    };
  }

  const supabase = await createClient();
  try {
    const { error } = await supabase
      .from("customer_addresses")
      .delete()
      .eq("id", address.id)
      .eq("customer_id", session.profileId);
    if (error) throw new Error(error.message);
    await logAudit({
      actorId: session.profileId,
      actorLabel: session.fullName,
      action: "address.deleted",
      entityType: "customer_address",
      entityId: address.id,
    });
  } catch (error) {
    console.error("[addresses] delete failed", error);
    return { ok: false, message: "تعذّر حذف العنوان." };
  }

  revalidatePath("/addresses");
  return { ok: true, message: "تم حذف العنوان." };
}
