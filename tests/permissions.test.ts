import { describe, expect, it } from "vitest";

import {
  ADMIN_NAV,
  adminNavigation,
  can,
  isAdminRole,
  permissionsFor,
} from "@/lib/permissions";

describe("role / permission matrix", () => {
  it("denies every permission for anonymous or unknown roles", () => {
    for (const role of [null, undefined, "", "superuser", "admin", "guest"]) {
      expect(isAdminRole(role)).toBe(false);
      expect(permissionsFor(role)).toEqual([]);
      expect(can(role, "shipments.read")).toBe(false);
    }
  });

  it("treats the customer role as non-admin with zero staff permissions", () => {
    expect(isAdminRole("customer")).toBe(false);
    expect(permissionsFor("customer")).toEqual([]);
    expect(can("customer", "shipments.read")).toBe(false);
    expect(can("customer", "customers.read")).toBe(false);
  });

  it("gives the super admin every permission in the matrix", () => {
    const all = permissionsFor("super_admin");
    expect(all.length).toBeGreaterThan(15);
    for (const permission of all) {
      expect(can("super_admin", permission)).toBe(true);
    }
    expect(can("super_admin", "settings.manage")).toBe(true);
    expect(can("super_admin", "statuses.manage")).toBe(true);
  });

  it("keeps warehouse staff inside the warehouse scope", () => {
    expect(can("warehouse_staff", "warehouse.write")).toBe(true);
    expect(can("warehouse_staff", "shipments.read")).toBe(true);
    // No money, no customer administration, no status matrix.
    expect(can("warehouse_staff", "payments.write")).toBe(false);
    expect(can("warehouse_staff", "customers.read")).toBe(false);
    expect(can("warehouse_staff", "shipments.status")).toBe(false);
    expect(can("warehouse_staff", "statuses.manage")).toBe(false);
    expect(can("warehouse_staff", "audit.read")).toBe(false);
  });

  it("gives finance money-related permissions only", () => {
    expect(can("finance", "payments.write")).toBe(true);
    expect(can("finance", "shipments.fees")).toBe(true);
    expect(can("finance", "audit.read")).toBe(true);
    expect(can("finance", "shipments.status")).toBe(false);
    expect(can("finance", "customers.suspend")).toBe(false);
    expect(can("finance", "warehouse.write")).toBe(false);
    expect(can("finance", "claims.review")).toBe(false);
  });

  it("gives support read + reply but never destructive writes", () => {
    expect(can("support", "support.reply")).toBe(true);
    expect(can("support", "customers.read")).toBe(true);
    expect(can("support", "customers.suspend")).toBe(false);
    expect(can("support", "shipments.status")).toBe(false);
    expect(can("support", "payments.write")).toBe(false);
  });

  it("lets only super admin and operations manage the status matrix", () => {
    expect(can("super_admin", "statuses.manage")).toBe(true);
    expect(can("operations_manager", "statuses.manage")).toBe(true);
    expect(can("support", "statuses.manage")).toBe(false);
    expect(can("finance", "statuses.manage")).toBe(false);
    expect(can("warehouse_staff", "statuses.manage")).toBe(false);
  });

  it("reserves account suspension and settings for the super admin", () => {
    expect(can("operations_manager", "customers.suspend")).toBe(false);
    expect(can("super_admin", "customers.suspend")).toBe(true);
    expect(can("super_admin", "settings.manage")).toBe(true);
    expect(can("operations_manager", "settings.manage")).toBe(false);
  });
});

describe("admin navigation filtering", () => {
  it("exposes every nav item to the super admin", () => {
    expect(adminNavigation("super_admin").length).toBe(ADMIN_NAV.length);
  });

  it("hides nav items whose permission the role lacks", () => {
    const warehouseNav = adminNavigation("warehouse_staff");
    const hrefs = warehouseNav.map((item) => item.href);
    expect(hrefs).toContain("/admin/warehouse");
    expect(hrefs).not.toContain("/admin/statuses");
    expect(hrefs).not.toContain("/admin/audit");
    expect(hrefs).not.toContain("/admin/customers");

    const financeNav = adminNavigation("finance").map((item) => item.href);
    expect(financeNav).toContain("/admin/payments");
    expect(financeNav).not.toContain("/admin/statuses");
    expect(financeNav).not.toContain("/admin/support");
  });

  it("shows nothing to the customer role", () => {
    expect(adminNavigation("customer")).toEqual([]);
    expect(adminNavigation(null)).toEqual([]);
  });

  it("every nav entry maps to a permission that exists for at least one role", () => {
    const roles = [
      "super_admin",
      "operations_manager",
      "warehouse_staff",
      "support",
      "finance",
    ] as const;
    for (const item of ADMIN_NAV) {
      expect(roles.some((role) => can(role, item.permission))).toBe(true);
    }
  });
});
