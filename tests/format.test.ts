import { describe, expect, it } from "vitest";

import { passwordStrength } from "@/lib/password-strength";
import { formatCurrency, formatNationalAddress, formatWeight } from "@/lib/format";

describe("passwordStrength", () => {
  it("scores very short, single-class passwords as weak", () => {
    const result = passwordStrength("abcdef");
    expect(result.score).toBe(0);
    expect(result.label).toBe("ضعيفة جداً");
  });

  it("rewards length, case mixing and symbols", () => {
    expect(passwordStrength("abcdefghij").score).toBe(1);
    expect(passwordStrength("Shipping2026").score).toBeGreaterThanOrEqual(2);
    expect(passwordStrength("Shipping2026!!").score).toBe(4);
    expect(passwordStrength("Shipping2026!!").label).toBe("قوية");
  });

  it("never exceeds the maximum score", () => {
    expect(passwordStrength("Aaaaaaaaaaaa1!aaaa").score).toBeLessThanOrEqual(4);
  });
});

describe("formatCurrency", () => {
  it("formats SAR as ر.س and falls back to the code for unknown currencies", () => {
    expect(formatCurrency(1234.5)).toBe("1,234.5 ر.س");
    expect(formatCurrency("99", "SAR")).toBe("99 ر.س");
    expect(formatCurrency(10, "CNY")).toBe("10 CNY");
  });

  it("renders an em dash for missing values", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
    expect(formatCurrency("")).toBe("—");
    expect(formatCurrency("not-a-number")).toBe("—");
  });
});

describe("formatWeight", () => {
  it("appends the kilogram unit", () => {
    expect(formatWeight(1.25)).toBe("1.25 كجم");
    expect(formatWeight("0.500")).toBe("0.5 كجم");
  });

  it("renders an em dash for missing values", () => {
    expect(formatWeight(null)).toBe("—");
    expect(formatWeight(undefined)).toBe("—");
  });
});

describe("formatNationalAddress", () => {
  it("joins the real address fields in an Arabic reading order", () => {
    const text = formatNationalAddress({
      recipientName: "أحمد",
      phone: "+966512345678",
      city: "الرياض",
      district: "الملقا",
      street: "شارع الأمير محمد",
      buildingNumber: "1234",
      secondaryNumber: "56",
      postalCode: "12345",
      nationalAddressShortCode: "ABC123",
      addressDetails: null,
    });
    expect(text).toContain("الرياض");
    expect(text).toContain("الملقا");
    expect(text).toContain("1234");
    expect(text).toContain("12345");
  });

  it("omits blank optional parts instead of printing undefined", () => {
    const text = formatNationalAddress({
      recipientName: "سارة",
      phone: "+966512345678",
      city: "جدة",
      district: "الشاطئ",
      street: "شارع الملك عبدالعزيز",
      buildingNumber: "9",
      secondaryNumber: null,
      postalCode: "23456",
      nationalAddressShortCode: null,
      addressDetails: null,
    });
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
    expect(text).toContain("جدة");
  });

  it("returns an em dash for null input", () => {
    expect(formatNationalAddress(null)).toBe("—");
  });
});
