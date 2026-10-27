import "server-only";

import { statusCodesForGroups } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { AddressInput } from "@/lib/validation";
import type { StatusGroup } from "@/db/schema";

export const ACTIVE_SHIPMENT_GROUPS = [
  "warehouse",
  "ready",
  "awaiting_payment",
  "in_transit",
  "exception",
] as const satisfies readonly StatusGroup[];

/** camelCase address shape consumed by the UI (mirrors the old Drizzle row). */
export type AddressRow = {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  city: string;
  district: string;
  street: string;
  buildingNumber: string;
  secondaryNumber: string | null;
  postalCode: string;
  nationalAddressShortCode: string | null;
  addressDetails: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type RawAddress = {
  id: string;
  label: string | null;
  recipient_name: string;
  phone: string;
  city: string;
  district: string | null;
  street: string | null;
  building_number: string | null;
  secondary_number: string | null;
  postal_code: string | null;
  national_address_short_code: string | null;
  address_details: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

const ADDRESS_COLUMNS =
  "id, label, recipient_name, phone, city, district, street, building_number, secondary_number, postal_code, national_address_short_code, address_details, is_default, created_at, updated_at";

function toAddress(row: RawAddress): AddressRow {
  return {
    id: row.id,
    label: row.label,
    recipientName: row.recipient_name,
    phone: row.phone,
    city: row.city,
    district: row.district ?? "",
    street: row.street ?? "",
    buildingNumber: row.building_number ?? "",
    secondaryNumber: row.secondary_number,
    postalCode: row.postal_code ?? "",
    nationalAddressShortCode: row.national_address_short_code,
    addressDetails: row.address_details,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAddresses(customerId: string): Promise<AddressRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customer_addresses")
    .select(ADDRESS_COLUMNS)
    .eq("customer_id", customerId)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });

  return (data ?? []).map(toAddress);
}

export type AddressWithLock = AddressRow & { locked: boolean };

/**
 * Every address of the customer plus whether it is locked to an active
 * shipment, so the list page can disable deletion without N+1.
 */
export async function listAddressesWithLock(customerId: string): Promise<AddressWithLock[]> {
  const supabase = await createClient();
  const activeCodes = statusCodesForGroups([...ACTIVE_SHIPMENT_GROUPS]);

  const [addressesRes, shipmentsRes] = await Promise.all([
    supabase
      .from("customer_addresses")
      .select(ADDRESS_COLUMNS)
      .eq("customer_id", customerId)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false }),
    // Shipments bound to an address in an active group => that address is locked.
    supabase
      .from("shipments")
      .select("address_id")
      .eq("customer_id", customerId)
      .not("address_id", "is", null)
      .in("current_status", activeCodes),
  ]);

  const locked = new Set(
    (shipmentsRes.data ?? [])
      .map((row) => row.address_id)
      .filter((v): v is string => Boolean(v)),
  );

  return (addressesRes.data ?? []).map((row) => ({
    ...toAddress(row),
    locked: locked.has(row.id),
  }));
}

export async function getDefaultAddress(customerId: string): Promise<AddressRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customer_addresses")
    .select(ADDRESS_COLUMNS)
    .eq("customer_id", customerId)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? toAddress(data) : null;
}

export async function getAddress(customerId: string, id: string): Promise<AddressRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customer_addresses")
    .select(ADDRESS_COLUMNS)
    .eq("id", id)
    .eq("customer_id", customerId)
    .limit(1)
    .maybeSingle();

  return data ? toAddress(data) : null;
}

/**
 * An address is locked while a non-terminal shipment is bound to it. The
 * confirmed snapshot on the shipment is never modified by address changes.
 */
export async function isAddressLocked(addressId: string): Promise<boolean> {
  const supabase = await createClient();
  const activeCodes = statusCodesForGroups([...ACTIVE_SHIPMENT_GROUPS]);

  const { count } = await supabase
    .from("shipments")
    .select("id", { count: "exact", head: true })
    .eq("address_id", addressId)
    .in("current_status", activeCodes);

  return (count ?? 0) > 0;
}

export async function countAddresses(customerId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("customer_addresses")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId);
  return count ?? 0;
}

/** Maps validated input to snake_case DB columns for insert/update. */
export function addressToValues(input: AddressInput) {
  return {
    label: input.label || null,
    recipient_name: input.recipientName,
    phone: input.phone,
    city: input.city,
    district: input.district,
    street: input.street,
    building_number: input.buildingNumber,
    secondary_number: input.secondaryNumber || null,
    postal_code: input.postalCode,
    national_address_short_code: input.nationalAddressShortCode || null,
    address_details: input.addressDetails || null,
    is_default: input.isDefault ?? false,
  };
}
