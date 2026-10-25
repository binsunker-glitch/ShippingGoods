import { describe, expect, it } from "vitest";

import {
  fieldErrors,
  normalizeSaudiPhone,
  passwordSchema,
  registerSchema,
  saudiPhoneSchema,
} from "@/lib/validation";

describe("normalizeSaudiPhone", () => {
  it("normalises every accepted local format to +9665XXXXXXXX", () => {
    const valid = [
      "0512345678",
      "512345678",
      "+966512345678",
      "966512345678",
      "00966512345678",
      "+966 51 234 5678",
      "0512-345-678",
      "(051) 234 5678",
    ];
    for (const input of valid) {
      expect(normalizeSaudiPhone(input), input).toBe("+966512345678");
    }
  });

  it("rejects non-Saudi and malformed numbers", () => {
    const invalid = [
      "",
      "051234567",      // too short
      "05123456789",    // too long for a Saudi mobile
      "0412345678",     // not a 05 number
      "12345",
      "not-a-number",
      "+96651234",      // incomplete
      "05512345678",
      "abcdefghij",
    ];
    for (const input of invalid) {
      expect(normalizeSaudiPhone(input), input).toBeNull();
    }
  });

  it("never leaks formatting characters into the result", () => {
    expect(normalizeSaudiPhone("0 5 1 2 3 4 5 6 7 8")).toBe("+966512345678");
    expect(normalizeSaudiPhone("+966 (51) 234.5678")).toBe("+966512345678");
  });
});

describe("saudiPhoneSchema", () => {
  it("accepts and transforms valid numbers", () => {
    const parsed = saudiPhoneSchema.safeParse("0512345678");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("+966512345678");
  });

  it("returns an Arabic error message for invalid input", () => {
    const parsed = saudiPhoneSchema.safeParse("12345");
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("سعودي");
    }
  });
});

describe("passwordSchema", () => {
  it("accepts a compliant password", () => {
    expect(passwordSchema.safeParse("Shipping2026!").success).toBe(true);
  });

  it("rejects short passwords", () => {
    const parsed = passwordSchema.safeParse("Ab1!");
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("10");
    }
  });

  it("rejects passwords without a letter or without a digit", () => {
    expect(passwordSchema.safeParse("abcdefghijkl").success).toBe(false);
    expect(passwordSchema.safeParse("1234567890").success).toBe(false);
  });

  it("rejects leading or trailing whitespace", () => {
    expect(passwordSchema.safeParse(" Shipping2026!").success).toBe(false);
    expect(passwordSchema.safeParse("Shipping2026! ").success).toBe(false);
  });

  it("allows Arabic letters as the alphabetic requirement", () => {
    expect(passwordSchema.safeParse("شحن123456789").success).toBe(true);
  });
});

describe("registerSchema", () => {
  const valid = {
    fullName: "أحمد محمد العلي",
    phone: "0512345678",
    email: "AHMED@Example.com",
    city: "الرياض",
    district: "الملقا",
    street: "شارع الأمير محمد بن سلمان",
    buildingNumber: "1234",
    secondaryNumber: "56",
    postalCode: "12345",
    nationalAddressShortCode: "ABC123",
    addressDetails: "الدور الثاني",
    password: "Shipping2026!",
    confirmPassword: "Shipping2026!",
    consent: "on",
  };

  it("accepts a complete valid registration and lowercases the email", () => {
    const parsed = registerSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("ahmed@example.com");
  });

  it("normalises the phone to the canonical form", () => {
    const parsed = registerSchema.safeParse({ ...valid, phone: "+966512345678" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.phone).toBe("+966512345678");
  });

  it("rejects a mismatched password confirmation with an Arabic field error", () => {
    const parsed = registerSchema.safeParse({ ...valid, confirmPassword: "Other2026!!" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      expect(errors.confirmPassword).toBe("كلمتا المرور غير متطابقتين");
    }
  });

  it("rejects a missing privacy consent", () => {
    const parsed = registerSchema.safeParse({
      fullName: valid.fullName,
      phone: valid.phone,
      email: valid.email,
      city: valid.city,
      district: valid.district,
      street: valid.street,
      buildingNumber: valid.buildingNumber,
      secondaryNumber: valid.secondaryNumber,
      postalCode: valid.postalCode,
      nationalAddressShortCode: valid.nationalAddressShortCode,
      addressDetails: valid.addressDetails,
      password: valid.password,
      confirmPassword: valid.confirmPassword,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(fieldErrors(parsed.error).consent).toContain("سياسة الخصوصية");
    }
  });

  it("rejects invalid postal codes and building numbers", () => {
    expect(registerSchema.safeParse({ ...valid, postalCode: "1234" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, buildingNumber: "12ج" }).success).toBe(false);
  });

  it("allows an empty email but rejects a malformed one", () => {
    expect(registerSchema.safeParse({ ...valid, email: "" }).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("emits Arabic validation messages only", () => {
    const parsed = registerSchema.safeParse({ ...valid, fullName: "ab" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((issue) => issue.message);
      for (const message of messages) {
        expect(message).toMatch(/[؀-ۿ]/);
      }
    }
  });
});

describe("fieldErrors", () => {
  it("maps the first message per field and flattens nested paths", () => {
    const parsed = registerSchema.safeParse({ ...({
      fullName: "أحمد محمد العلي",
      phone: "0512345678",
      email: "",
      city: "الرياض",
      district: "الملقا",
      street: "شارع الملك",
      buildingNumber: "1",
      secondaryNumber: "",
      postalCode: "12",
      nationalAddressShortCode: "",
      addressDetails: "",
      password: "Shipping2026!",
      confirmPassword: "Mismatch2026!",
      consent: "on",
    }) });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      expect(Object.keys(errors)).toContain("confirmPassword");
      expect(Object.keys(errors)).toContain("postalCode");
      for (const message of Object.values(errors)) {
        expect(typeof message).toBe("string");
        expect(message.length).toBeGreaterThan(0);
      }
    }
  });
});
