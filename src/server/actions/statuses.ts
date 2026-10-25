"use server";

import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getDb, withTransaction } from "@/db/client";
import { shipmentStatusCatalog, shipmentStatusTransitions, shipments } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import { logAudit } from "@/server/audit";
import { requirePermissionAction } from "@/server/auth/guards";

/* ------------------------------------------------------------------ */
/* Transition matrix (admin-configurable)                              */
/* ------------------------------------------------------------------ */

function canonical(fromStatus: string, toStatus: string) {
  return { from: fromStatus.trim(), to: toStatus.trim() };
}

/**
 * Enable or disable one transition in the matrix. Disabled transitions are
 * refused by `canTransition()` everywhere, so the change takes effect
 * immediately for every staff member.
 */
export async function setTransitionActiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermissionAction("statuses.manage");
  if (!session) return { ok: false, message: "لا تملك صلاحية إدارة حالات الشحن." };

  const transitionId = String(formData.get("transitionId") ?? "");
  const activeRaw = String(formData.get("active") ?? "");
  if (!transitionId || !["true", "false"].includes(activeRaw)) {
    return { ok: false, message: "طلب غير صالح." };
  }
  const active = activeRaw === "true";

  const db = await getDb();
  const rows = await db
    .select({
      id: shipmentStatusTransitions.id,
      fromStatus: shipmentStatusTransitions.fromStatus,
      toStatus: shipmentStatusTransitions.toStatus,
      isActive: shipmentStatusTransitions.isActive,
    })
    .from(shipmentStatusTransitions)
    .where(eq(shipmentStatusTransitions.id, transitionId))
    .limit(1);

  const transition = rows[0];
  if (!transition) return { ok: false, message: "الانتقال غير موجود." };
  if (transition.isActive === active) {
    return { ok: true, message: "هذه القيمة مضبوطة بالفعل — لا يوجد تحديث." };
  }

  try {
    await withTransaction(async (tx) => {
      await tx
        .update(shipmentStatusTransitions)
        .set({ isActive: active, updatedBy: session.profileId, updatedAt: new Date() })
        .where(eq(shipmentStatusTransitions.id, transition.id));

      await logAudit(
        {
          actorId: session.profileId,
          actorLabel: session.fullName,
          action: active ? "status.transition_enabled" : "status.transition_disabled",
          entityType: "status_transition",
          entityId: transition.id,
          metadata: { from: transition.fromStatus, to: transition.toStatus },
        },
        tx,
      );
    });
  } catch (error) {
    console.error("[admin] set transition failed", error);
    return { ok: false, message: "تعذّر تحديث الانتقال." };
  }

  revalidatePath("/admin/statuses");
  return {
    ok: true,
    message: active ? "تم تفعيل هذا الانتقال." : "تم إيقاف هذا الانتقال.",
  };
}

/**
 * Add a new (from → to) edge to the matrix. Missing edges are inserted,
 * existing ones are re-enabled — the unique index makes this idempotent.
 */
export async function addTransitionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermissionAction("statuses.manage");
  if (!session) return { ok: false, message: "لا تملك صلاحية إدارة حالات الشحن." };

  const { from, to } = canonical(
    String(formData.get("fromStatus") ?? ""),
    String(formData.get("toStatus") ?? ""),
  );
  if (!from || !to) return { ok: false, message: "اختر الحالة الحالية والحالة الجديدة." };
  if (from === to) return { ok: false, message: "لا يمكن أن تكون الحالة نفسها انتقالاً." };

  const db = await getDb();
  const catalogRows = await db
    .select({ code: shipmentStatusCatalog.code, labelAr: shipmentStatusCatalog.labelAr })
    .from(shipmentStatusCatalog)
    .where(eq(shipmentStatusCatalog.isActive, true));
  const known = new Set(catalogRows.map((row) => row.code));
  if (!known.has(from) || !known.has(to)) {
    return { ok: false, message: "أحد الرمزين غير موجود في كتالوج الحالات." };
  }

  try {
    await withTransaction(async (tx) => {
      await tx
        .insert(shipmentStatusTransitions)
        .values({
          id: randomUUID(),
          fromStatus: from,
          toStatus: to,
          isActive: true,
          updatedBy: session.profileId,
        })
        .onConflictDoUpdate({
          target: [shipmentStatusTransitions.fromStatus, shipmentStatusTransitions.toStatus],
          set: { isActive: true, updatedBy: session.profileId, updatedAt: new Date() },
        });

      await logAudit(
        {
          actorId: session.profileId,
          actorLabel: session.fullName,
          action: "status.transition_added",
          entityType: "status_transition",
          entityId: `${from}:${to}`,
          metadata: { from, to },
        },
        tx,
      );
    });
  } catch (error) {
    console.error("[admin] add transition failed", error);
    return { ok: false, message: "تعذّر إضافة الانتقال." };
  }

  revalidatePath("/admin/statuses");
  return { ok: true, message: "تمت إضافة الانتقال إلى المصفوفة." };
}

/* ------------------------------------------------------------------ */
/* Status catalogue flags                                              */
/* ------------------------------------------------------------------ */

const FLAG_KEYS = ["isActive", "isException", "restricted"] as const;
type FlagKey = (typeof FLAG_KEYS)[number];

/**
 * Flip one flag on a catalogue status. Deactivating a status is refused while
 * any shipment still sits on it, so history never loses its label.
 */
export async function setStatusFlagAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermissionAction("statuses.manage");
  if (!session) return { ok: false, message: "لا تملك صلاحية إدارة حالات الشحن." };

  const code = String(formData.get("code") ?? "");
  const flag = String(formData.get("flag") ?? "") as FlagKey;
  const activeRaw = String(formData.get("active") ?? "");

  if (!code || !FLAG_KEYS.includes(flag) || !["true", "false"].includes(activeRaw)) {
    return { ok: false, message: "طلب غير صالح." };
  }
  const value = activeRaw === "true";

  const db = await getDb();
  const rows = await db
    .select()
    .from(shipmentStatusCatalog)
    .where(eq(shipmentStatusCatalog.code, code))
    .limit(1);
  const status = rows[0];
  if (!status) return { ok: false, message: "الحالة غير موجودة." };

  // Guard: an in-use status cannot be removed from rotation.
  if (flag === "isActive" && !value) {
    const inUse = await db
      .select({ value: count() })
      .from(shipments)
      .where(eq(shipments.currentStatus, code));
    if ((inUse[0]?.value ?? 0) > 0) {
      return {
        ok: false,
        message: "لا يمكن إيقاف حالة مستخدمة في شحنات حالية. غيّر حالات الشحنات أولاً.",
      };
    }
  }

  try {
    await withTransaction(async (tx) => {
      await tx
        .update(shipmentStatusCatalog)
        .set({ [flag]: value })
        .where(eq(shipmentStatusCatalog.code, code));

      await logAudit(
        {
          actorId: session.profileId,
          actorLabel: session.fullName,
          action: `status.flag_changed.${flag}`,
          entityType: "status_catalog",
          entityId: code,
          metadata: { previous: status[flag], next: value },
        },
        tx,
      );
    });
  } catch (error) {
    console.error("[admin] set status flag failed", error);
    return { ok: false, message: "تعذّر تحديث الحالة." };
  }

  revalidatePath("/admin/statuses");
  return { ok: true, message: `تم تحديث الحالة «${status.labelAr}».` };
}
