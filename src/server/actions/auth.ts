"use server";

import { randomUUID, createHash } from "node:crypto";

import { and, eq, isNull, sql, or } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDb, withTransaction } from "@/db/client";
import {
  authCredentials,
  customerAddresses,
  passwordResets,
  profiles,
} from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import {
  fieldErrors,
  loginSchema,
  normalizeSaudiPhone,
  passwordSchema,
  registerSchema,
} from "@/lib/validation";
import { logAudit } from "@/server/audit";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import {
  createSession,
  destroySession,
  getIpAddress,
  getUserAgent,
  revokeSessions,
} from "@/server/auth/session";
import { isUniqueViolation, nextCustomerNumber } from "@/server/ids";
import { createNotification } from "@/server/notify";
import { enforceRateLimit, rateLimit } from "@/server/rate-limit";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function genericLoginError(): ActionState {
  return {
    ok: false,
    message: "بيانات الدخول غير صحيحة. تحقّق من البيانات وحاول مرة أخرى.",
  };
}

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

export async function registerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ip = await getIpAddress().catch(() => "unknown");
  try {
    enforceRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  } catch {
    return {
      ok: false,
      message: "تم تجاوز عدد محاولات التسجيل المسموح. حاول بعد ساعة.",
    };
  }

  const raw: Record<string, string> = {
    fullName: String(formData.get("fullName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    city: String(formData.get("city") ?? ""),
    district: String(formData.get("district") ?? ""),
    street: String(formData.get("street") ?? ""),
    buildingNumber: String(formData.get("buildingNumber") ?? ""),
    secondaryNumber: String(formData.get("secondaryNumber") ?? ""),
    postalCode: String(formData.get("postalCode") ?? ""),
    nationalAddressShortCode: String(formData.get("nationalAddressShortCode") ?? ""),
    addressDetails: String(formData.get("addressDetails") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    consent: formData.get("consent") ? "on" : "",
  };

  const echo: Record<string, string> = { ...raw, password: "", confirmPassword: "" };

  const parsed = registerSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      ok: false,
      message: "يرجى مراجعة الحقول المحددة.",
      errors: fieldErrors(parsed.error),
      data: echo,
    };
  }

  const data = parsed.data;
  const db = await getDb();

  const phoneTaken = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.phone, data.phone))
    .limit(1);
  if (phoneTaken.length > 0) {
    return {
      ok: false,
      message: "رقم الجوال مرتبط بحساب موجود بالفعل.",
      errors: { phone: "رقم الجوال مسجل بحساب آخر" },
      data: echo,
    };
  }

  if (data.email) {
    const emailTaken = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.email, data.email))
      .limit(1);
    if (emailTaken.length > 0) {
      return {
        ok: false,
        message: "البريد الإلكتروني مرتبط بحساب موجود بالفعل.",
        errors: { email: "البريد الإلكتروني مسجل بحساب آخر" },
        data: echo,
      };
    }
  }

  const passwordHash = await hashPassword(data.password);
  let profileId: string;
  let customerNumber: string;

  try {
    const created = await withTransaction(async (tx) => {
      const number = await nextCustomerNumber(tx);
      const id = randomUUID();

      await tx.insert(profiles).values({
        id,
        customerNumber: number,
        fullName: data.fullName,
        phone: data.phone,
        email: data.email,
        city: data.city,
        role: "customer",
        accountStatus: "active",
      });

      await tx.insert(authCredentials).values({
        id: randomUUID(),
        profileId: id,
        passwordHash,
      });

      // The registration address becomes the default delivery address.
      await tx.insert(customerAddresses).values({
        id: randomUUID(),
        customerId: id,
        label: "عنوان التسجيل",
        recipientName: data.fullName,
        phone: data.phone,
        city: data.city,
        district: data.district,
        street: data.street,
        buildingNumber: data.buildingNumber,
        secondaryNumber: data.secondaryNumber || null,
        postalCode: data.postalCode,
        nationalAddressShortCode: data.nationalAddressShortCode || null,
        addressDetails: data.addressDetails || null,
        isDefault: true,
      });

      await logAudit(
        {
          actorId: id,
          actorLabel: data.fullName,
          action: "customer.registered",
          entityType: "profile",
          entityId: id,
          metadata: { customerNumber: number },
        },
        tx,
      );

      await createNotification(
        {
          customerId: id,
          title: "مرحباً بك في World Associates Shipping CO",
          message: "تم إنشاء حسابك بنجاح. احتفظ برقم العميل الخاص بك واستخدمه عند الشراء من الصين.",
          type: "success",
          link: "/welcome",
        },
        tx,
      );

      return { id, number };
    });

    profileId = created.id;
    customerNumber = created.number;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        message: "يوجد حساب مسجّل بهذه البيانات بالفعل.",
        data: echo,
      };
    }
    console.error("[auth] registration failed", error);
    return {
      ok: false,
      message: "تعذّر إنشاء الحساب حالياً. حاول مرة أخرى لاحقاً.",
      data: echo,
    };
  }

  await createSession(profileId, await getUserAgent());
  redirect(`/welcome?n=${encodeURIComponent(customerNumber)}`);
}

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ip = await getIpAddress().catch(() => "unknown");
  const identifierRaw = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  try {
    enforceRateLimit(`login:${ip}`, 10, 5 * 60 * 1000);
    if (identifierRaw) enforceRateLimit(`login-id:${identifierRaw.toLowerCase()}`, 10, 5 * 60 * 1000);
  } catch {
    return {
      ok: false,
      message: "محاولات دخول كثيرة. انتظر دقائق ثم أعد المحاولة.",
    };
  }

  const parsed = loginSchema.safeParse({ identifier: identifierRaw, password });
  if (!parsed.success) {
    return { ok: false, message: "أدخل البريد الإلكتروني أو رقم الجوال وكلمة المرور." };
  }

  const identifier = parsed.data.identifier;
  const phone = normalizeSaudiPhone(identifier);
  const customerNumber = /^WA-[A-Za-z0-9-]+$/.test(identifier.toUpperCase())
    ? identifier.toUpperCase()
    : null;
  const email = identifier.includes("@") ? identifier.toLowerCase() : null;

  const db = await getDb();
  const rows = await db
    .select({
      id: profiles.id,
      phone: profiles.phone,
      email: profiles.email,
      customerNumber: profiles.customerNumber,
      fullName: profiles.fullName,
      role: profiles.role,
      accountStatus: profiles.accountStatus,
      credentialId: authCredentials.id,
      passwordHash: authCredentials.passwordHash,
      failedAttempts: authCredentials.failedAttempts,
      lockedUntil: authCredentials.lockedUntil,
    })
    .from(profiles)
    .leftJoin(authCredentials, eq(authCredentials.profileId, profiles.id))
    .where(
      or(
        phone ? eq(profiles.phone, phone) : sql`false`,
        email ? eq(profiles.email, email) : sql`false`,
        customerNumber ? eq(profiles.customerNumber, customerNumber) : sql`false`,
      ),
    )
    .limit(1);

  const user = rows[0];
  const now = new Date();

  // Always compare a password so a missing account is not detectable by timing.
  if (!user || !user.passwordHash || !user.credentialId) {
    await verifyPassword(
      password || "invalid",
      "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid",
    );
    return genericLoginError();
  }

  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > now.getTime()) {
    const minutes = Math.max(1, Math.ceil((new Date(user.lockedUntil).getTime() - now.getTime()) / 60000));
    return {
      ok: false,
      message: `تم قفل الدخول مؤقتاً بعد محاولات فاشلة. حاول بعد ${minutes} دقيقة.`,
    };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const attempts = (user.failedAttempts ?? 0) + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    await db
      .update(authCredentials)
      .set({
        failedAttempts: attempts,
        lockedUntil: lock ? new Date(now.getTime() + LOCK_MINUTES * 60000) : user.lockedUntil,
      })
      .where(eq(authCredentials.id, user.credentialId));
    await logAudit({
      actorId: user.id,
      actorLabel: user.fullName,
      action: lock ? "auth.login_locked" : "auth.login_failed",
      entityType: "profile",
      entityId: user.id,
      metadata: { attempts },
    });
    return genericLoginError();
  }

  if (user.accountStatus !== "active") {
    await logAudit({
      actorId: user.id,
      actorLabel: user.fullName,
      action: "auth.login_denied_suspended",
      entityType: "profile",
      entityId: user.id,
    });
    return {
      ok: false,
      message: "هذا الحساب موقوف. تواصل مع الدعم للمساعدة.",
    };
  }

  await db
    .update(authCredentials)
    .set({ failedAttempts: 0, lockedUntil: null })
    .where(eq(authCredentials.id, user.credentialId));

  await createSession(user.id, await getUserAgent());

  await logAudit({
    actorId: user.id,
    actorLabel: user.fullName,
    action: "auth.login",
    entityType: "profile",
    entityId: user.id,
  });

  redirect(user.role === "customer" ? "/dashboard" : "/admin");
}

/* ------------------------------------------------------------------ */
/* Logout                                                              */
/* ------------------------------------------------------------------ */

export async function logoutAction(): Promise<void> {
  const ip = await getIpAddress().catch(() => "unknown");
  rateLimit(`logout:${ip}`, 30, 60_000);
  await destroySession();
  redirect("/");
}

/* ------------------------------------------------------------------ */
/* Password reset                                                      */
/* ------------------------------------------------------------------ */

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ip = await getIpAddress().catch(() => "unknown");
  try {
    enforceRateLimit(`reset:${ip}`, 5, 60 * 60 * 1000);
  } catch {
    return { ok: false, message: "تم تجاوز عدد المحولات. حاول لاحقاً." };
  }

  const identifier = String(formData.get("identifier") ?? "").trim();
  if (!identifier) {
    return { ok: false, message: "أدخل البريد الإلكتروني أو رقم الجوال." };
  }

  const phone = normalizeSaudiPhone(identifier);
  const email = identifier.includes("@") ? identifier.toLowerCase() : null;
  const customerNumber = /^WA-[A-Za-z0-9-]+$/i.test(identifier)
    ? identifier.toUpperCase()
    : null;

  const db = await getDb();
  const rows = await db
    .select({ id: profiles.id, fullName: profiles.fullName })
    .from(profiles)
    .where(
      or(
        phone ? eq(profiles.phone, phone) : sql`false`,
        email ? eq(profiles.email, email) : sql`false`,
        customerNumber ? eq(profiles.customerNumber, customerNumber) : sql`false`,
      ),
    )
    .limit(1);

  const genericResponse: ActionState = {
    ok: true,
    message:
      "إذا كان الحساب مسجلاً بهذه البيانات فسيتم إنشاء رابط إعادة تعيين صالح لمدة ساعة.",
  };

  const user = rows[0];
  if (!user) return genericResponse;

  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  await db.insert(passwordResets).values({
    id: randomUUID(),
    profileId: user.id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });
  await logAudit({
    actorId: user.id,
    actorLabel: user.fullName,
    action: "auth.password_reset_requested",
    entityType: "profile",
    entityId: user.id,
  });
  await revokeSessions(user.id);

  // No mail provider is bundled. In development the link is returned so the
  // flow can be completed; in production it is only stored (see README:
  // "Configuring the e-mail provider").
  if (process.env.NODE_ENV !== "production") {
    return {
      ...genericResponse,
      data: { resetUrl: `/reset-password?token=${token}` },
    };
  }
  return genericResponse;
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ip = await getIpAddress().catch(() => "unknown");
  try {
    enforceRateLimit(`reset-do:${ip}`, 10, 60 * 60 * 1000);
  } catch {
    return { ok: false, message: "تم تجاوز عدد المحولات. حاول لاحقاً." };
  }

  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) return { ok: false, message: "رابط إعادة التعيين غير صالح." };
  if (password !== confirmPassword) {
    return { ok: false, errors: { confirmPassword: "كلمتا المرور غير متطابقتين" } };
  }

  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    return { ok: false, errors: { password: parsed.error.issues[0]?.message ?? "كلمة المرور غير صالحة" } };
  }

  const db = await getDb();
  const rows = await db
    .select({ id: passwordResets.id, profileId: passwordResets.profileId, expiresAt: passwordResets.expiresAt, usedAt: passwordResets.usedAt })
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, sha256(token)))
    .limit(1);

  const row = rows[0];
  if (!row || row.usedAt || new Date(row.expiresAt).getTime() < Date.now()) {
    return { ok: false, message: "رابط إعادة التعيين غير صالح أو منتهي الصلاحية." };
  }

  const passwordHash = await hashPassword(password);

  try {
    await withTransaction(async (tx) => {
      await tx
        .update(passwordResets)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResets.id, row.id), isNull(passwordResets.usedAt)));
      await tx
        .update(authCredentials)
        .set({ passwordHash, passwordUpdatedAt: new Date(), failedAttempts: 0, lockedUntil: null, mustChangePassword: false })
        .where(eq(authCredentials.profileId, row.profileId));
      await logAudit(
        {
          actorId: row.profileId,
          action: "auth.password_reset_completed",
          entityType: "profile",
          entityId: row.profileId,
        },
        tx,
      );
    });
  } catch {
    return { ok: false, message: "تعذّر تحديث كلمة المرور. أعد المحاولة." };
  }

  await revokeSessions(row.profileId);
  redirect("/login?reset=1");
}

/* ------------------------------------------------------------------ */
/* Change password (signed in)                                         */
/* ------------------------------------------------------------------ */

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ip = await getIpAddress().catch(() => "unknown");
  try {
    enforceRateLimit(`change-pw:${ip}`, 10, 60 * 60 * 1000);
  } catch {
    return { ok: false, message: "تم تجاوز عدد المحولات. حاول لاحقاً." };
  }

  const { getSession } = await import("@/server/auth/guards");
  const session = await getSession();
  if (!session) return { ok: false, message: "انتهت الجلسة. سجّل الدخول مجدداً." };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password !== confirmPassword) {
    return { ok: false, errors: { confirmPassword: "كلمتا المرور غير متطابقتين" } };
  }

  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    return { ok: false, errors: { password: parsed.error.issues[0]?.message ?? "كلمة المرور غير صالحة" } };
  }

  const db = await getDb();
  const rows = await db
    .select({ id: authCredentials.id, passwordHash: authCredentials.passwordHash })
    .from(authCredentials)
    .where(eq(authCredentials.profileId, session.profileId))
    .limit(1);

  const credential = rows[0];
  if (!credential || !(await verifyPassword(currentPassword, credential.passwordHash))) {
    return { ok: false, errors: { currentPassword: "كلمة المرور الحالية غير صحيحة" } };
  }

  const passwordHash = await hashPassword(password);
  await db
    .update(authCredentials)
    .set({ passwordHash, passwordUpdatedAt: new Date(), mustChangePassword: false })
    .where(eq(authCredentials.id, credential.id));

  await logAudit({
    actorId: session.profileId,
    actorLabel: session.fullName,
    action: "auth.password_changed",
    entityType: "profile",
    entityId: session.profileId,
  });

  // Drop every other session, keep the one that performed the change.
  const { sessions } = await import("@/db/schema");
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.profileId, session.profileId), sql`${sessions.id} <> ${session.sessionId}`));

  return { ok: true, message: "تم تغيير كلمة المرور بنجاح." };
}
