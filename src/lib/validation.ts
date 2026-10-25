import { z } from "zod";

/**
 * Shared validation. Used by client forms for instant feedback and re-used
 * unchanged by the server actions, which are the authoritative check.
 */

/** Accepts 05XXXXXXXX, 5XXXXXXXX, +9665XXXXXXXX, 9665XXXXXXXX. */
export function normalizeSaudiPhone(input: string): string | null {
  const cleaned = String(input ?? "").replace(/[\s\-().]/g, "");
  if (!/^\+?\d{9,15}$/.test(cleaned)) return null;

  let digits = cleaned.replace(/^\+/, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (digits.startsWith("966")) digits = `0${digits.slice(3)}`;
  if (digits.startsWith("5") && digits.length === 9) digits = `0${digits}`;

  if (!/^05\d{8}$/.test(digits)) return null;
  return `+966${digits.slice(1)}`;
}

export const saudiPhoneSchema = z
  .string()
  .trim()
  .min(1, "رقم الجوال مطلوب")
  .refine((value) => normalizeSaudiPhone(value) !== null, {
    message: "أدخل رقم جوال سعودي صحيح يبدأ بـ 05 أو +966",
  })
  .transform((value) => normalizeSaudiPhone(value) ?? "");

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

export const PASSWORD_MIN_LENGTH = 10;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `كلمة المرور يجب ألا تقل عن ${PASSWORD_MIN_LENGTH} أحرف`)
  .max(128, "كلمة المرور طويلة جداً")
  .refine((value) => /[A-Za-z\u0621-\u064A]/.test(value), {
    message: "كلمة المرور يجب أن تحتوي على حرف واحد على الأقل",
  })
  .refine((value) => /\d/.test(value), {
    message: "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل",
  })
  .refine((value) => !/^\s|\s$/.test(value), {
    message: "لا تبدأ كلمة المرور أو تنتهي بمسافات",
  });

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "أدخل رقم الجوال أو البريد الإلكتروني أو رقم العميل")
    .max(200),
  password: z.string().min(1, "أدخل كلمة المرور"),
});

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(3, "الاسم الكامل مطلوب (3 أحرف على الأقل)")
      .max(120, "الاسم الكامل طويل جداً"),
    phone: saudiPhoneSchema,
    email: z
      .string()
      .trim()
      .max(200, "البريد الإلكتروني طويل جداً")
      .refine((value) => value === "" || z.email().safeParse(value).success, {
        message: "صيغة البريد الإلكتروني غير صحيحة",
      })
      .transform((value) => (value === "" ? null : value.toLowerCase())),
    city: z.string().trim().min(1, "اختر المدينة").max(80),
    district: z.string().trim().min(1, "الحي مطلوب").max(80),
    street: z.string().trim().min(1, "الشارع مطلوب").max(120),
    buildingNumber: z
      .string()
      .trim()
      .min(1, "رقم المبنى مطلوب")
      .max(20)
      .regex(/^[0-9\-\/A-Za-z]+$/, "رقم المبنى يحتوي على أحرف غير مقبولة"),
    secondaryNumber: z
      .string()
      .trim()
      .max(20)
      .regex(/^[0-9\-\/A-Za-z]*$/, "الرقم الثانوي يحتوي على أحرف غير مقبولة")
      .or(z.literal("")),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{5}$/, "الرمز البريدي يتكون من 5 أرقام"),
    nationalAddressShortCode: z
      .string()
      .trim()
      .max(12)
      .regex(/^[A-Za-z0-9]*$/, "الرمز المختصر للعنوان الوطني غير صحيح")
      .or(z.literal("")),
    addressDetails: z.string().trim().max(500, "تعليمات التسليم طويلة جداً").or(z.literal("")),
    password: passwordSchema,
    confirmPassword: z.string(),
    consent: z
      .string({ message: "يجب الموافقة على سياسة الخصوصية للمتابعة" })
      .refine((value) => value === "on", {
        message: "يجب الموافقة على سياسة الخصوصية للمتابعة",
      }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "كلمتا المرور غير متطابقتين",
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/* ------------------------------------------------------------------ */
/* Addresses                                                           */
/* ------------------------------------------------------------------ */

export const addressSchema = z.object({
  label: z.string().trim().max(40).or(z.literal("")),
  recipientName: z.string().trim().min(3, "اسم المستلم مطلوب").max(120),
  phone: saudiPhoneSchema,
  city: z.string().trim().min(1, "اختر المدينة").max(80),
  district: z.string().trim().min(1, "الحي مطلوب").max(80),
  street: z.string().trim().min(1, "الشارع مطلوب").max(120),
  buildingNumber: z.string().trim().min(1, "رقم المبنى مطلوب").max(20),
  secondaryNumber: z.string().trim().max(20).or(z.literal("")),
  postalCode: z.string().trim().regex(/^\d{5}$/, "الرمز البريدي يتكون من 5 أرقام"),
  nationalAddressShortCode: z
    .string()
    .trim()
    .max(12)
    .regex(/^[A-Za-z0-9]*$/, "الرمز المختصر غير صحيح")
    .or(z.literal("")),
  addressDetails: z.string().trim().max(500).or(z.literal("")),
  isDefault: z.boolean().optional().default(false),
});

export type AddressInput = z.infer<typeof addressSchema>;

/* ------------------------------------------------------------------ */
/* Shipment linking (ربط طرد)                                          */
/* ------------------------------------------------------------------ */

export const claimSchema = z
  .object({
    shipmentTrackingNumber: z
      .string()
      .trim()
      .max(40)
      .or(z.literal(""))
      .default(""),
    carrierTrackingNumber: z
      .string()
      .trim()
      .max(80)
      .or(z.literal(""))
      .default(""),
    description: z.string().trim().max(500).or(z.literal("")),
  })
  .refine(
    (data) =>
      data.shipmentTrackingNumber.length > 0 || data.carrierTrackingNumber.length > 0,
    {
      message: "أدخل رقم تتبع الشحنة أو رقم تتبّع الناقل",
      path: ["shipmentTrackingNumber"],
    },
  );

export type ClaimInput = z.infer<typeof claimSchema>;

/* ------------------------------------------------------------------ */
/* Support                                                             */
/* ------------------------------------------------------------------ */

export const ticketSchema = z.object({
  subject: z.string().trim().min(5, "الموضوع مطلوب (5 أحرف على الأقل)").max(160),
  description: z.string().trim().min(10, "اشرح طلبك (10 أحرف على الأقل)").max(4000),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

export type TicketInput = z.infer<typeof ticketSchema>;

/** Formats a Zod error into a flat { field: message } map (Arabic messages). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}
