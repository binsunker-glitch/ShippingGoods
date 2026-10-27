import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Core schema for World Associates Shipping CO.
 *
 * The dialect is PostgreSQL. Locally the app runs on an embedded PostgreSQL
 * (PGlite) so development works with zero external services, and the exact same
 * SQL runs against Supabase/PostgreSQL in production.
 *
 * Conventions:
 *  - UUID primary keys (generated server side with crypto.randomUUID()).
 *  - Human readable identifiers (customer numbers, tracking numbers, ...) are
 *    generated server side from the `sequences` table inside a transaction.
 *  - Timestamps are stored in UTC (timestamptz) and rendered in Asia/Riyadh.
 */

const now = sql`CURRENT_TIMESTAMP`;

/* ------------------------------------------------------------------ */
/* Sequence counters (safe, concurrent id generation)                 */
/* ------------------------------------------------------------------ */

export const sequences = pgTable("sequences", {
  key: text("key").primaryKey(),
  value: integer("value").notNull(),
});

/* ------------------------------------------------------------------ */
/* Identity / profiles                                                 */
/* ------------------------------------------------------------------ */

export const PROFILE_ROLES = [
  "customer",
  "super_admin",
  "operations_manager",
  "warehouse_staff",
  "customer_support",
  "finance_staff",
] as const;
export type ProfileRole = (typeof PROFILE_ROLES)[number];

export const ACCOUNT_STATUSES = ["active", "suspended", "closed"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const profiles = pgTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    customerNumber: text("customer_number").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    city: text("city").notNull(),
    role: text("role").$type<ProfileRole>().notNull().default("customer"),
    accountStatus: text("account_status")
      .$type<AccountStatus>()
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("profiles_customer_number_uq").on(t.customerNumber),
    uniqueIndex("profiles_phone_uq").on(t.phone),
    uniqueIndex("profiles_email_uq").on(t.email),
    index("profiles_role_idx").on(t.role),
  ],
);

/**
 * Credentials are stored separately from the profile so that profile data can
 * be exported / deleted without ever touching password material.
 */
export const authCredentials = pgTable(
  "auth_credentials",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    passwordHash: text("password_hash").notNull(),
    passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }).notNull().default(now),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex("auth_credentials_profile_uq").on(t.profileId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().default(now),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    userAgent: text("user_agent"),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_uq").on(t.tokenHash),
    index("sessions_profile_idx").on(t.profileId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex("password_resets_token_uq").on(t.tokenHash)],
);

/* ------------------------------------------------------------------ */
/* Addresses                                                           */
/* ------------------------------------------------------------------ */

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    label: text("label"),
    recipientName: text("recipient_name").notNull(),
    phone: text("phone").notNull(),
    city: text("city").notNull(),
    district: text("district").notNull(),
    street: text("street").notNull(),
    buildingNumber: text("building_number").notNull(),
    secondaryNumber: text("secondary_number"),
    postalCode: text("postal_code").notNull(),
    nationalAddressShortCode: text("national_address_short_code"),
    addressDetails: text("address_details"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => [index("customer_addresses_customer_idx").on(t.customerId)],
);

/* ------------------------------------------------------------------ */
/* Shipment status catalogue + transitions                             */
/* ------------------------------------------------------------------ */

export const STATUS_GROUPS = [
  "warehouse",
  "ready",
  "awaiting_payment",
  "in_transit",
  "delivered",
  "exception",
  "cancelled",
] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];

export const shipmentStatusCatalog = pgTable(
  "shipment_status_catalog",
  {
    code: text("code").primaryKey(),
    labelAr: text("label_ar").notNull(),
    group: text("group").$type<StatusGroup>().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    isException: boolean("is_exception").notNull().default(false),
    /** Only administrators may set this status manually. */
    restricted: boolean("restricted").notNull().default(false),
  },
  (t) => [index("shipment_status_catalog_sort_idx").on(t.sortOrder)],
);

export const shipmentStatusTransitions = pgTable(
  "shipment_status_transitions",
  {
    id: text("id").primaryKey(),
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    updatedBy: text("updated_by").references(() => profiles.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex("status_transition_uq").on(t.fromStatus, t.toStatus)],
);

/* ------------------------------------------------------------------ */
/* Packages (warehouse inventory)                                      */
/* ------------------------------------------------------------------ */

export const PACKAGE_STATUSES = [
  "awaiting_identification",
  "received",
  "registered",
  "assigned",
  "consolidated",
  "shipped",
  "delivered",
] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export const packages = pgTable(
  "packages",
  {
    id: text("id").primaryKey(),
    packageReference: text("package_reference").notNull(),
    customerId: text("customer_id").references(() => profiles.id, { onDelete: "set null" }),
    carrierTrackingNumber: text("carrier_tracking_number"),
    description: text("description"),
    weight: numeric("weight", { precision: 10, scale: 3 }),
    dimensions: text("dimensions"),
    warehouseReceivedAt: timestamp("warehouse_received_at", { withTimezone: true }),
    packageStatus: text("package_status")
      .$type<PackageStatus>()
      .notNull()
      .default("registered"),
    receivedBy: text("received_by").references(() => profiles.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("packages_reference_uq").on(t.packageReference),
    index("packages_customer_idx").on(t.customerId),
    index("packages_status_idx").on(t.packageStatus),
    index("packages_carrier_tracking_idx").on(t.carrierTrackingNumber),
  ],
);

/* ------------------------------------------------------------------ */
/* Shipments                                                           */
/* ------------------------------------------------------------------ */

export const PAYMENT_STATUSES = ["unpaid", "pending_verification", "paid", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const shipments = pgTable(
  "shipments",
  {
    id: text("id").primaryKey(),
    trackingNumber: text("tracking_number").notNull(),
    customerId: text("customer_id").references(() => profiles.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    packageCount: integer("package_count").notNull().default(0),
    weight: numeric("weight", { precision: 10, scale: 3 }),
    dimensions: text("dimensions"),
    shippingMethod: text("shipping_method"),
    origin: text("origin").notNull().default("Guangzhou, China"),
    destinationCity: text("destination_city"),
    /** Frozen copy of the delivery address confirmed for this shipment. */
    destinationAddressSnapshot: jsonb("destination_address_snapshot").$type<AddressSnapshot>(),
    /** Address book entry the snapshot came from (may later change independently). */
    addressId: text("address_id").references(() => customerAddresses.id, { onDelete: "set null" }),
    /** Used to verify shipment ownership claims. Never shown publicly. */
    recipientPhone: text("recipient_phone"),
    currentStatus: text("current_status").notNull(),
    statusGroup: text("status_group").$type<StatusGroup>().notNull().default("warehouse"),
    estimatedDeliveryDate: date("estimated_delivery_date"),
    estimatedDelivery: boolean("estimated_delivery").notNull().default(false),
    shippingFee: numeric("shipping_fee", { precision: 10, scale: 2 }),
    currency: text("currency").notNull().default("SAR"),
    paymentStatus: text("payment_status").$type<PaymentStatus>().notNull().default("unpaid"),
    consolidationGroupId: text("consolidation_group_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("shipments_tracking_number_uq").on(t.trackingNumber),
    index("shipments_customer_idx").on(t.customerId),
    index("shipments_status_idx").on(t.currentStatus),
    index("shipments_group_idx").on(t.statusGroup),
    index("shipments_updated_idx").on(t.updatedAt),
  ],
);

export type AddressSnapshot = {
  recipientName: string;
  phone: string;
  city: string;
  district: string;
  street: string;
  buildingNumber: string;
  secondaryNumber?: string | null;
  postalCode: string;
  nationalAddressShortCode?: string | null;
  addressDetails?: string | null;
};

export const shipmentEvents = pgTable(
  "shipment_events",
  {
    id: text("id").primaryKey(),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    statusGroup: text("status_group").$type<StatusGroup>().notNull(),
    location: text("location"),
    description: text("description").notNull(),
    eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull(),
    source: text("source").notNull().default("staff"),
    createdBy: text("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    /** Makes event creation idempotent: retries can never duplicate an event. */
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (t) => [
    uniqueIndex("shipment_events_idempotency_uq").on(t.idempotencyKey),
    index("shipment_events_shipment_idx").on(t.shipmentId),
  ],
);

export const shipmentPackages = pgTable(
  "shipment_packages",
  {
    id: text("id").primaryKey(),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    packageId: text("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("shipment_packages_uq").on(t.shipmentId, t.packageId),
    index("shipment_packages_package_idx").on(t.packageId),
  ],
);

/* ------------------------------------------------------------------ */
/* Consolidation                                                       */
/* ------------------------------------------------------------------ */

export const CONSOLIDATION_STATUSES = ["open", "confirmed", "converted", "cancelled"] as const;
export type ConsolidationStatus = (typeof CONSOLIDATION_STATUSES)[number];

export const consolidationGroups = pgTable(
  "consolidation_groups",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    groupReference: text("group_reference").notNull(),
    status: text("status").$type<ConsolidationStatus>().notNull().default("open"),
    shipmentId: text("shipment_id").references(() => shipments.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("consolidation_groups_reference_uq").on(t.groupReference),
    index("consolidation_groups_customer_idx").on(t.customerId),
  ],
);

export const consolidationItems = pgTable(
  "consolidation_items",
  {
    id: text("id").primaryKey(),
    consolidationGroupId: text("consolidation_group_id")
      .notNull()
      .references(() => consolidationGroups.id, { onDelete: "cascade" }),
    packageId: text("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("consolidation_items_uq").on(t.consolidationGroupId, t.packageId),
    index("consolidation_items_package_idx").on(t.packageId),
  ],
);

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

export const PAYMENT_ROWS_STATUSES = ["pending", "verified", "failed", "refunded"] as const;

export const shipmentPayments = pgTable(
  "shipment_payments",
  {
    id: text("id").primaryKey(),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("SAR"),
    paymentMethod: text("payment_method").notNull(),
    paymentStatus: text("payment_status")
      .$type<(typeof PAYMENT_ROWS_STATUSES)[number]>()
      .notNull()
      .default("pending"),
    transactionReference: text("transaction_reference"),
    notes: text("notes"),
    recordedBy: text("recorded_by").references(() => profiles.id, { onDelete: "set null" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => [index("shipment_payments_shipment_idx").on(t.shipmentId)],
);

/* ------------------------------------------------------------------ */
/* Shipment claim requests (ربط طرد)                                   */
/* ------------------------------------------------------------------ */

export const CLAIM_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const shipmentClaimRequests = pgTable(
  "shipment_claim_requests",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    shipmentId: text("shipment_id").references(() => shipments.id, { onDelete: "set null" }),
    shipmentTrackingNumber: text("shipment_tracking_number"),
    carrierTrackingNumber: text("carrier_tracking_number"),
    description: text("description"),
    documentPath: text("document_path"),
    requestStatus: text("request_status").$type<ClaimStatus>().notNull().default("pending"),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by").references(() => profiles.id, { onDelete: "set null" }),
  },
  (t) => [
    index("shipment_claim_requests_customer_idx").on(t.customerId),
    index("shipment_claim_requests_status_idx").on(t.requestStatus),
    index("shipment_claim_requests_shipment_idx").on(t.shipmentId),
    // A shipment can only ever have ONE open/approved claim: two customers can
    // never claim the same shipment, even under a race condition.
    uniqueIndex("claim_open_shipment_uq")
      .on(t.shipmentId)
      .where(
        sql`shipment_id IS NOT NULL AND request_status IN ('pending', 'auto_verified', 'approved')`,
      ),
    // A customer cannot submit the same open claim twice.
    uniqueIndex("claim_open_customer_shipment_uq")
      .on(t.customerId, t.shipmentId)
      .where(
        sql`shipment_id IS NOT NULL AND request_status IN ('pending', 'auto_verified')`,
      ),
  ],
);

/* ------------------------------------------------------------------ */
/* Notifications, tickets, documents, audit                            */
/* ------------------------------------------------------------------ */

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    message: text("message").notNull(),
    notificationType: text("notification_type").notNull().default("info"),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => [index("notifications_customer_idx").on(t.customerId, t.createdAt)],
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    ticketNumber: text("ticket_number").notNull(),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("normal"),
    assignedTo: text("assigned_to").references(() => profiles.id, { onDelete: "set null" }),
    reply: text("reply"),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("support_tickets_number_uq").on(t.ticketNumber),
    index("support_tickets_customer_idx").on(t.customerId),
    index("support_tickets_status_idx").on(t.status),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    ownerProfileId: text("owner_profile_id").references(() => profiles.id, { onDelete: "set null" }),
    storedName: text("stored_name").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedBy: text("uploaded_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index("documents_entity_idx").on(t.entityType, t.entityId),
    index("documents_owner_idx").on(t.ownerProfileId),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    actorLabel: text("actor_label"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index("audit_logs_actor_idx").on(t.actorId),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_created_idx").on(t.createdAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Configurable site content (contact info, policies, integrations)    */
/* ------------------------------------------------------------------ */

export const siteSettings = pgTable(
  "site_settings",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").notNull().$type<Record<string, unknown>>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(now),
  },
);

export type Profile = typeof profiles.$inferSelect;
export type CustomerAddress = typeof customerAddresses.$inferSelect;
export type Shipment = typeof shipments.$inferSelect;
export type ShipmentEvent = typeof shipmentEvents.$inferSelect;
export type PackageRow = typeof packages.$inferSelect;
export type ConsolidationGroup = typeof consolidationGroups.$inferSelect;
export type ClaimRequest = typeof shipmentClaimRequests.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type StatusCatalogRow = typeof shipmentStatusCatalog.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;
