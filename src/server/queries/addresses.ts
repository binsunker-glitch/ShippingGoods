import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { customerAddresses, shipments } from "@/db/schema";
import type { AddressInput } from "@/lib/validation";

export const ACTIVE_SHIPMENT_GROUPS = [
  "warehouse",
  "ready",
  "awaiting_payment",
  "in_transit",
  "exception",
] as const;

export async function listAddresses(customerId: string) {
  const db = await getDb();
  return db
    .select()
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, customerId))
    .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.updatedAt));
}

export type AddressWithLock = Awaited<ReturnType<typeof listAddressesWithLock>>[number];

/**
 * One round trip: every address of the customer plus whether it is locked to
 * an active shipment, so the list page can disable deletion without N+1.
 */
export async function listAddressesWithLock(customerId: string) {
  const db = await getDb();
  return db
    .select({
      id: customerAddresses.id,
      label: customerAddresses.label,
      recipientName: customerAddresses.recipientName,
      phone: customerAddresses.phone,
      city: customerAddresses.city,
      district: customerAddresses.district,
      street: customerAddresses.street,
      buildingNumber: customerAddresses.buildingNumber,
      secondaryNumber: customerAddresses.secondaryNumber,
      postalCode: customerAddresses.postalCode,
      nationalAddressShortCode: customerAddresses.nationalAddressShortCode,
      addressDetails: customerAddresses.addressDetails,
      isDefault: customerAddresses.isDefault,
      updatedAt: customerAddresses.updatedAt,
      locked: sql<boolean>`exists (
        select 1 from ${shipments}
        where ${shipments.addressId} = ${customerAddresses.id}
          and ${shipments.statusGroup} in ('warehouse','ready','awaiting_payment','in_transit','exception')
      )`,
    })
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, customerId))
    .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.updatedAt));
}

export async function getDefaultAddress(customerId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, customerId))
    .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAddress(customerId: string, id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(customerAddresses)
    .where(and(eq(customerAddresses.id, id), eq(customerAddresses.customerId, customerId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * An address is locked while a non-terminal shipment is bound to it. The
 * confirmed snapshot on the shipment is never modified by address changes.
 */
export async function isAddressLocked(addressId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: shipments.id })
    .from(shipments)
    .where(
      and(
        eq(shipments.addressId, addressId),
        inArray(shipments.statusGroup, [...ACTIVE_SHIPMENT_GROUPS]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function countAddresses(customerId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: customerAddresses.id })
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, customerId));
  return rows.length;
}

export function addressToValues(input: AddressInput) {
  return {
    label: input.label || null,
    recipientName: input.recipientName,
    phone: input.phone,
    city: input.city,
    district: input.district,
    street: input.street,
    buildingNumber: input.buildingNumber,
    secondaryNumber: input.secondaryNumber || null,
    postalCode: input.postalCode,
    nationalAddressShortCode: input.nationalAddressShortCode || null,
    addressDetails: input.addressDetails || null,
    isDefault: input.isDefault ?? false,
  };
}
