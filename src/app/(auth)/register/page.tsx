import { RegisterForm } from "./register-form";

export const metadata = { title: "إنشاء حساب" };

export default function RegisterPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold text-ink">إنشاء حساب عميل جديد</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">
          بعد التسجيل ستحصل فوراً على رقم عميل دائم تستخدمه في مستودع قوانغتشو وعند ربط
          طرودك.
        </p>
      </div>

      <RegisterForm />
    </div>
  );
}
