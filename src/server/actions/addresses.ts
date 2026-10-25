"use server";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { withTransaction } from "@/db/client";
import { customerAddresses } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import { addressSchema, fieldErrors } from "@/lib/validation";
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
    // Echo back only string values so the form can re-fill on validation failure.
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

  try {
    await withTransaction(async (tx) => {
      if (makeDefault) {
        await tx
          .update(customerAddresses)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(customerAddresses.customerId, session.profileId));
      }

      if (existing) {
        await tx
          .update(customerAddresses)
          .set({ ...addressToValues(parsed.data), isDefault: makeDefault, updatedAt: new Date() })
          .where(
            and(
              eq(customerAddresses.id, existing.id),
              eq(customerAddresses.customerId, session.profileId),
            ),
          );
        await logAudit(
          {
            actorId: session.profileId,
            actorLabel: session.fullName,
            action: "address.updated",
            entityType: "customer_address",
            entityId: existing.id,
          },
          tx,
        );
      } else {
        await tx.insert(customerAddresses).values({
          id: randomUUID(),
          customerId: session.profileId,
          ...addressToValues(parsed.data),
          isDefault: makeDefault,
        });
        await logAudit(
          {
            actorId: session.profileId,
            actorLabel: session.fullName,
            action: "address.created",
            entityType: "customer_address",
          },
          tx,
        );
      }
    });
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

  await withTransaction(async (tx) => {
    await tx
      .update(customerAddresses)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(customerAddresses.customerId, session.profileId));
    await tx
      .update(customerAddresses)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(
        and(
          eq(customerAddresses.id, address.id),
          eq(customerAddresses.customerId, session.profileId),
        ),
      );
    await logAudit(
      {
        actorId: session.profileId,
        actorLabel: session.fullName,
        action: "address.set_default",
        entityType: "customer_address",
        entityId: address.id,
      },
      tx,
    );
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

  try {
    await withTransaction(async (tx) => {
      await tx
        .delete(customerAddresses)
        .where(
          and(
            eq(customerAddresses.id, address.id),
            eq(customerAddresses.customerId, session.profileId),
          ),
        );
      await logAudit(
        {
          actorId: session.profileId,
          actorLabel: session.fullName,
          action: "address.deleted",
          entityType: "customer_address",
          entityId: address.id,
        },
        tx,
      );
    });
  } catch (error) {
    console.error("[addresses] delete failed", error);
    return { ok: false, message: "تعذّر حذف العنوان." };
  }

  revalidatePath("/addresses");
  return { ok: true, message: "تم حذف العنوان." };
}
