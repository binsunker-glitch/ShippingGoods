"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
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
 * refused by `canTransition()` everywhere (and by the `transition_shipment`
 * RPC), so the change takes effect immediately for every staff member.
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

  const supabase = await createClient();
  const { data: transition } = await supabase
    .from("shipment_status_transitions")
    .select("id, from_status, to_status, is_active")
    .eq("id", transitionId)
    .maybeSingle();

  if (!transition) return { ok: false, message: "الانتقال غير موجود." };
  if (transition.is_active === active) {
    return { ok: true, message: "هذه القيمة مضبوطة بالفعل — لا يوجد تحديث." };
  }

  try {
    const { error } = await supabase
      .from("shipment_status_transitions")
      .update({ is_active: active })
      .eq("id", transition.id);
    if (error) throw new Error(error.message);

    await logAudit({
      actorId: session.profileId,
      actorLabel: session.fullName,
      action: active ? "status.transition_enabled" : "status.transition_disabled",
      entityType: "status_transition",
      entityId: transition.id,
      metadata: { from: transition.from_status, to: transition.to_status },
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

  const supabase = await createClient();
  const { data: catalogRows } = await supabase
    .from("shipment_status_catalog")
    .select("code")
    .eq("is_active", true);
  const known = new Set((catalogRows ?? []).map((row) => row.code));
  if (!known.has(from) || !known.has(to)) {
    return { ok: false, message: "أحد الرمزين غير موجود في كتالوج الحالات." };
  }

  try {
    // Upsert on the (from,to) unique index: insert or re-enable.
    const { error } = await supabase
      .from("shipment_status_transitions")
      .upsert(
        { from_status: from, to_status: to, is_active: true },
        { onConflict: "from_status,to_status", ignoreDuplicates: false },
      );
    if (error) throw new Error(error.message);

    await logAudit({
      actorId: session.profileId,
      actorLabel: session.fullName,
      action: "status.transition_added",
      entityType: "status_transition",
      metadata: { from, to },
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

/** camelCase form flag -> actual catalog column. */
const FLAG_COLUMNS: Record<FlagKey, string> = {
  isActive: "is_active",
  isException: "is_exception",
  restricted: "restricted",
};

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

  const supabase = await createClient();
  const { data: status } = await supabase
    .from("shipment_status_catalog")
    .select("code, label_ar, is_active, is_exception, restricted")
    .eq("code", code)
    .maybeSingle();
  if (!status) return { ok: false, message: "الحالة غير موجودة." };

  // Guard: an in-use status cannot be removed from rotation.
  if (flag === "isActive" && !value) {
    const { count } = await supabase
      .from("shipments")
      .select("id", { count: "exact", head: true })
      .eq("current_status", code);
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        message: "لا يمكن إيقاف حالة مستخدمة في شحنات حالية. غيّر حالات الشحنات أولاً.",
      };
    }
  }

  try {
    const { error } = await supabase
      .from("shipment_status_catalog")
      .update({ [FLAG_COLUMNS[flag]]: value })
      .eq("code", code);
    if (error) throw new Error(error.message);

    const previous =
      flag === "isActive"
        ? status.is_active
        : flag === "isException"
          ? status.is_exception
          : status.restricted;

    await logAudit({
      actorId: session.profileId,
      actorLabel: session.fullName,
      action: `status.flag_changed.${flag}`,
      entityType: "status_catalog",
      entityId: null, // codes are text, not UUID; the code lives in metadata.
      metadata: { code, previous, next: value },
    });
  } catch (error) {
    console.error("[admin] set status flag failed", error);
    return { ok: false, message: "تعذّر تحديث الحالة." };
  }

  revalidatePath("/admin/statuses");
  return { ok: true, message: `تم تحديث الحالة «${status.label_ar}».` };
}
