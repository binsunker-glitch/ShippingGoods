"use server";

import { redirect } from "next/navigation";

import type { ActionState } from "@/lib/action-state";
import {
  fieldErrors,
  loginSchema,
  normalizeSaudiPhone,
  passwordSchema,
  registerSchema,
} from "@/lib/validation";
import { createClient } from "@/lib/supabase/server";
import { getIpAddress } from "@/server/auth/session";
import { enforceRateLimit, rateLimit } from "@/server/rate-limit";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function genericLoginError(): ActionState {
  return {
    ok: false,
    message: "بيانات الدخول غير صحيحة. تحقّق من البيانات وحاول مرة أخرى.",
  };
}

/* ------------------------------------------------------------------ */
/* Registration (Supabase Auth)                                        */
/* ------------------------------------------------------------------ */

/**
 * Registers a new customer through Supabase Auth.
 *
 * The email/password pair is the authentication credential and lives in
 * `auth.users`. The customer profile (permanent `WA-…` number) and the initial
 * default address are provisioned **atomically on the database** by the
 * `on_auth_user_created` trigger (see `supabase/migrations/0002_functions.sql`),
 * so a public caller can never choose a customer number, account status, role,
 * or shipment ownership.
 */
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
  const supabase = await createClient();

  // Friendly duplicate check before touching Supabase Auth. Uses a
  // SECURITY DEFINER function so an anonymous visitor can check a field they
  // are about to register, without being able to read any table.
  const { data: conflicts } = await supabase.rpc("check_signup_conflicts", {
    p_phone: data.phone,
    p_email: data.email,
  });

  const conflict = (conflicts ?? {}) as { phone_taken?: boolean; email_taken?: boolean };
  if (conflict.phone_taken) {
    return {
      ok: false,
      message: "رقم الجوال مرتبط بحساب موجود بالفعل.",
      errors: { phone: "رقم الجوال مسجل بحساب آخر" },
      data: echo,
    };
  }
  if (conflict.email_taken) {
    return {
      ok: false,
      message: "البريد الإلكتروني مرتبط بحساب موجود بالفعل.",
      errors: { email: "البريد الإلكتروني مسجل بسابقة" },
      data: echo,
    };
  }

  const { data: signUpData, error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      // Consumed by the `on_auth_user_created` trigger to provision the
      // profile and the default address server-side.
      data: {
        full_name: data.fullName,
        phone: data.phone,
        email: data.email,
        city: data.city,
        district: data.district,
        street: data.street,
        building_number: data.buildingNumber,
        secondary_number: data.secondaryNumber,
        postal_code: data.postalCode,
        national_address_short_code: data.nationalAddressShortCode,
        address_details: data.addressDetails,
      },
      emailRedirectTo: `${APP_URL}/login`,
    },
  });

  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("already registered") || msg.includes("already exists")) {
      return {
        ok: false,
        message: "البريد الإلكتروني مرتبط بحساب موجود بالفعل.",
        errors: { email: "البريد الإلكتروني مسجل بسابقة" },
        data: echo,
      };
    }
    console.error("[auth] signup failed", error.message);
    return {
      ok: false,
      message: "تعذّر إنشاء الحساب حالياً. حاول مرة أخرى لاحقاً.",
      data: echo,
    };
  }

  // Email confirmation enabled: no session yet. Tell the user to verify.
  if (!signUpData.session) {
    return {
      ok: true,
      message:
        "تم إنشاء الحساب. تحقّق من بريدك الإلكتروني لتفعيل الحساب ثم سجّل الدخول.",
    };
  }

  // Session established (confirmations disabled): fetch the server-generated
  // customer number and continue to the welcome screen.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const customerNumber = user
    ? await fetchCustomerNumber(supabase, user.id)
    : "";

  redirect(`/welcome?n=${encodeURIComponent(customerNumber)}`);
}

async function fetchCustomerNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("customer_number")
    .eq("id", userId)
    .maybeSingle();
  return data?.customer_number ?? "";
}

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

/**
 * Signs in with Supabase Auth. Login is by **email + password** (Supabase Auth
 * email/password). For convenience the customer number / phone identifier is
 * resolved to the account email through a SECURITY DEFINER lookup so the
 * existing multi-identifier login form keeps working.
 */
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
    return { ok: false, message: "محاولات دخول كثيرة. انتظر دقائق ثم أعد المحاولة." };
  }

  const parsed = loginSchema.safeParse({ identifier: identifierRaw, password });
  if (!parsed.success) {
    return { ok: false, message: "أدخل البريد الإلكتروني أو رقم الجوال وكلمة المرور." };
  }

  const identifier = parsed.data.identifier;
  const supabase = await createClient();

  // Resolve a phone / customer-number identifier to the account email.
  let email = identifier.includes("@") ? identifier.toLowerCase() : null;
  if (!email) {
    const { data: resolved } = await supabase.rpc("lookup_login_email", {
      p_identifier: normalizeSaudiPhone(identifier) ?? identifier,
    });
    email = resolved ?? null;
  }
  if (!email) return genericLoginError();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return genericLoginError();
  }

  // Enforce account status (Supabase Auth would still mint a session).
  const userId = data.user.id;
  const { data: profile } = await supabase
    .from("profiles")
    .select("account_status")
    .eq("id", userId)
    .maybeSingle();

  if (profile && profile.account_status !== "active") {
    await supabase.auth.signOut();
    return { ok: false, message: "هذا الحساب موقوف. تواصل مع الدعم للمساعدة." };
  }

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const role = roles?.[0]?.role ?? "customer";

  redirect(role === "customer" ? "/dashboard" : "/admin");
}

/* ------------------------------------------------------------------ */
/* Logout                                                              */
/* ------------------------------------------------------------------ */

export async function logoutAction(): Promise<void> {
  const ip = await getIpAddress().catch(() => "unknown");
  rateLimit(`logout:${ip}`, 30, 60_000);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/* ------------------------------------------------------------------ */
/* Password reset (Supabase Auth)                                      */
/* ------------------------------------------------------------------ */

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

  const supabase = await createClient();
  let email = identifier.includes("@") ? identifier.toLowerCase() : null;
  if (!email) {
    const { data: resolved } = await supabase.rpc("lookup_login_email", {
      p_identifier: normalizeSaudiPhone(identifier) ?? identifier,
    });
    email = resolved ?? null;
  }
  if (!email) {
    // Do not reveal whether the account exists.
    return {
      ok: true,
      message: "إذا كان الحساب مسجلاً بهذه البيانات فسيتم إرسال رابط إعادة التعيين.",
    };
  }

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${APP_URL}/reset-password`,
  });

  return {
    ok: true,
    message: "إذا كان الحساب مسجلاً بهذه البيانات فسيتم إرسال رابط إعادة التعيين.",
  };
}

/**
 * Completes a password reset. The recovery link establishes a Supabase session
 * (handled by `middleware.ts` + `@supabase/ssr`), and this action updates the
 * password for that session.
 */
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

  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password !== confirmPassword) {
    return { ok: false, errors: { confirmPassword: "كلمتا المرور غير متطابقتين" } };
  }
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    return {
      ok: false,
      errors: { password: parsed.error.issues[0]?.message ?? "كلمة المرور غير صالحة" },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      message: "رابط إعادة التعيين غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { ok: false, message: "تعذّر تحديث كلمة المرور. أعد المحاولة." };
  }

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

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password !== confirmPassword) {
    return { ok: false, errors: { confirmPassword: "كلمتا المرور غير متطابقتين" } };
  }
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    return {
      ok: false,
      errors: { password: parsed.error.issues[0]?.message ?? "كلمة المرور غير صالحة" },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, message: "انتهت الجلسة. سجّل الدخول مجدداً." };

  // Verify the current password by re-authenticating (Supabase Auth has no
  // direct "verify current password" API).
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauthError) {
    return { ok: false, errors: { currentPassword: "كلمة المرور الحالية غير صحيحة" } };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { ok: false, message: "تعذّر تحديث كلمة المرور. أعد المحاولة." };
  }

  return { ok: true, message: "تم تغيير كلمة المرور بنجاح." };
}
