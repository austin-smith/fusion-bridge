import { sqliteTable, text, integer, primaryKey, uniqueIndex, index, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import type { AutomationConfig } from "@/lib/automation-schemas"; // Import the config type
import { ArmedState } from '@/lib/mappings/definitions'; // <-- Import the enum

export const connectors = sqliteTable("connectors", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  category: text("category").notNull(),
  name: text("name").notNull(),
  cfg_enc: text("cfg_enc").notNull(), // Stores config as JSON string
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  eventsEnabled: integer("events_enabled", { mode: "boolean" }).notNull().default(false),
});

// Remove relation to automations as sourceConnectorId is removed from automations
export const connectorsRelations = relations(connectors, ({ many }) => ({
	devices: many(devices),
  pikoServers: many(pikoServers),
  events: many(events),
}));

// --- NEW events table schema ---
export const events = sqliteTable("events", {
  // Core identifiers
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventUuid: text("event_uuid").notNull().unique(), // Store StandardizedEvent.eventId

  // Timing and Source
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(), // StandardizedEvent.timestamp
  connectorId: text("connector_id").notNull().references(() => connectors.id, { onDelete: 'cascade' }), // StandardizedEvent.connectorId - Set null if connector deleted
  deviceId: text("device_id").notNull(), // StandardizedEvent.deviceId (connector-specific) - NOTE: This is the *external* ID, not our internal devices.id UUID

  // Standardized Classification
  standardizedEventCategory: text("standardized_event_category").notNull(), // StandardizedEvent.eventCategory
  standardizedEventType: text("standardized_event_type").notNull(), // StandardizedEvent.eventType
  standardizedEventSubtype: text("standardized_event_subtype"), // <-- ADDED: Optional subtype

  // Payloads
  rawEventType: text("raw_event_type"), // Original event type string (nullable? - let's keep nullable for now)
  standardizedPayload: text("standardized_payload", { mode: "json" }).notNull(), // JSON string of StandardizedEvent.payload
  rawPayload: text("raw_payload", { mode: "json" }).notNull(), // JSON string of StandardizedEvent.rawEventPayload

}, (table) => ({
    // Indexes for common query patterns
    timestampIdx: index("events_timestamp_idx").on(table.timestamp),
    connectorDeviceIdx: index("events_connector_device_idx").on(table.connectorId, table.deviceId),
    eventTypeIdx: index("events_event_type_idx").on(table.standardizedEventType), // <-- Index for filtering conditions
}));

// Relation for events linking back to connector
export const eventsRelations = relations(events, ({ one }) => ({
  connector: one(connectors, {
    fields: [events.connectorId],
    references: [connectors.id],
  }),
  // Note: We don't directly link events to devices table here as event.deviceId is the external ID
}));

// Table for storing devices from all connectors
export const devices = sqliteTable("devices", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()), // Internal UUID for our system
  deviceId: text("device_id").notNull(), // External device ID from the connector
  connectorId: text("connector_id").notNull().references(() => connectors.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  type: text("type").notNull(), // Raw type from connector
  // Standardized type info (populated by sync logic)
  standardizedDeviceType: text("standardized_device_type"), // Mapped DeviceType enum value
  standardizedDeviceSubtype: text("standardized_device_subtype"), // Mapped DeviceSubtype enum value (nullable)
  status: text("status"),
  serverId: text("server_id"), // Optional: e.g., Piko Server ID
  vendor: text("vendor"),
  model: text("model"),
  url: text("url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Unique constraint on connector-specific device ID + connector
  connectorDeviceUniqueIdx: uniqueIndex("devices_connector_device_unique_idx")
    .on(table.connectorId, table.deviceId),
  // Indexes for filtering conditions by standardized types
  stdDeviceTypeIdx: index("devices_std_type_idx").on(table.standardizedDeviceType),
  stdDeviceSubtypeIdx: index("devices_std_subtype_idx").on(table.standardizedDeviceSubtype),
}));

// Relation for devices linking back to connector and server
export const devicesRelations = relations(devices, ({ one, many }) => ({
  connector: one(connectors, {
    fields: [devices.connectorId],
    references: [connectors.id],
  }),
  cameraAssociationsSource: many(cameraAssociations, { relationName: 'sourceDevice' }), // Associations where this device is the source (e.g., YoLink)
  cameraAssociationsTarget: many(cameraAssociations, { relationName: 'targetCamera' }), // Associations where this device is the target (e.g., Piko Camera)
  areaDevices: many(areaDevices), // Relation to the junction table
}));

// Table for storing Piko server information
export const pikoServers = sqliteTable("piko_servers", {
  serverId: text("id").primaryKey(), // Piko server ID (e.g., "{45645270...}") - Note: Using standard 'id' name now
  connectorId: text("connector_id").notNull().references(() => connectors.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  status: text("status"), // e.g., "Online"
  version: text("version"), // e.g., "6.0.3.40568"
  osPlatform: text("os_platform"), // e.g., "windows_x64"
  osVariantVersion: text("os_variant_version"), // e.g., "10.0.14393"
  url: text("url"), // Server URL
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Index on connector ID might be useful
  connectorIdx: index("piko_servers_connector_idx").on(table.connectorId),
}));

// Relation for Piko servers linking back to connector and devices
export const pikoServersRelations = relations(pikoServers, ({ one, many }) => ({
  connector: one(connectors, {
    fields: [pikoServers.connectorId],
    references: [connectors.id],
  }),
  // No explicit relation to devices here anymore
}));

// Junction table for camera associations (renamed from deviceAssociations)
export const cameraAssociations = sqliteTable('camera_associations', { // Renamed table
  deviceId: text('device_id').references(() => devices.id, { onDelete: 'cascade' }).notNull(), // FK to our internal devices.id
  pikoCameraId: text('piko_camera_id').references(() => devices.id, { onDelete: 'cascade' }).notNull(), // FK to our internal devices.id
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Updated primary key columns
  pk: primaryKey({ columns: [table.deviceId, table.pikoCameraId] }),
  // Indexes for individual foreign keys can be helpful
  pikoCameraIdx: index("camera_assoc_piko_idx").on(table.pikoCameraId),
  deviceIdx: index("camera_assoc_device_idx").on(table.deviceId),
}));

// Relations for the junction table linking back to the devices table twice
export const cameraAssociationsRelations = relations(cameraAssociations, ({ one }) => ({
  sourceDevice: one(devices, {
    fields: [cameraAssociations.deviceId],
    references: [devices.id],
    relationName: 'sourceDevice', // Use for distinguishing the relations
  }),
  targetCamera: one(devices, {
    fields: [cameraAssociations.pikoCameraId],
    references: [devices.id],
    relationName: 'targetCamera', // Use for distinguishing the relations
  }),
}));

// Table for storing automation configurations (Connector-Agnostic)
export const automations = sqliteTable("automations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
  // Stores the AutomationConfig object with primaryTrigger (standardized types) 
  // and secondaryConditions (standardized types, time windows)
  configJson: text("config_json", { mode: "json" }).notNull().$type<AutomationConfig>(), 
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(unixepoch('now', 'subsec') * 1000)`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(sql`(unixepoch('now', 'subsec') * 1000)`).notNull(),
}, (table) => ({
  // No indexes needed here currently
}));

// --- NEW: Locations Table ---
export const locations = sqliteTable("locations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  parentId: text("parent_id").references((): AnySQLiteColumn => locations.id, { onDelete: 'cascade' }), // Self-referencing FK - Type is correct now
  name: text("name").notNull(),
  path: text("path").notNull(), // Materialized path (e.g., "rootId.childId.grandchildId")
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
    // Indexes
    parentIdx: index("locations_parent_idx").on(table.parentId),
    pathIdx: index("locations_path_idx").on(table.path), // Index for path-based queries
}));

// Relations for Locations (Self-referencing and to Areas)
export const locationsRelations = relations(locations, ({ one, many }) => ({
  parent: one(locations, { // Relation to parent location
    fields: [locations.parentId],
    references: [locations.id],
    relationName: 'parentLocation',
  }),
  children: many(locations, { // Relation to child locations
    relationName: 'parentLocation', // Must match the parent's relationName
  }),
  areas: many(areas), // Relation to Areas located within this Location
}));

// --- NEW: Areas Table ---
export const areas = sqliteTable("areas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  locationId: text("location_id").references(() => locations.id, { onDelete: 'cascade' }).notNull(),
  name: text("name").notNull(),
  armedState: text("armed_state").$type<ArmedState>().notNull().default(ArmedState.DISARMED),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
    locationIdx: index("areas_location_idx").on(table.locationId),
}));

// Relations for Areas (to Location and AreaDevices junction)
export const areasRelations = relations(areas, ({ one, many }) => ({
  location: one(locations, { // Relation back to the Location
    fields: [areas.locationId],
    references: [locations.id],
  }),
  areaDevices: many(areaDevices), // Relation to the junction table
}));

// --- NEW: AreaDevices Junction Table ---
export const areaDevices = sqliteTable('area_devices', {
  areaId: text('area_id').references(() => areas.id, { onDelete: 'cascade' }).notNull(),
  deviceId: text('device_id').references(() => devices.id, { onDelete: 'cascade' }).notNull(), // FK to our internal devices.id
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Composite primary key
  pk: primaryKey({ columns: [table.areaId, table.deviceId] }),
  // Indexes for individual FKs can improve performance for certain queries
  deviceIdx: index("area_devices_device_idx").on(table.deviceId),
  areaIdx: index("area_devices_area_idx").on(table.areaId),
}));

// Relations for the AreaDevices junction table linking back to Areas and Devices
export const areaDevicesRelations = relations(areaDevices, ({ one }) => ({
  area: one(areas, {
    fields: [areaDevices.areaId],
    references: [areas.id],
  }),
  device: one(devices, {
    fields: [areaDevices.deviceId],
    references: [devices.id],
  }),
}));

// --- Better Auth Core Schema (Renamed to defaults) ---

// Renamed from 'users' to 'user'
export const user = sqliteTable("user", {
  id: text("id").primaryKey(), 
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: integer("emailVerified", { mode: "timestamp" }), 
  image: text("image"),
  twoFactorEnabled: integer("twoFactorEnabled", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Renamed from 'accounts' to 'account'
export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }), 
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  idToken: text("idToken"),
  password: text("password"), 
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  providerAccountIdx: uniqueIndex("provider_account_idx").on(table.providerId, table.accountId),
  userIdx: index("account_user_idx").on(table.userId),
}));

// Renamed from 'sessions' to 'session'
export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }), 
  token: text("token").unique().notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  tokenIdx: index("session_token_idx").on(table.token),
  userIdx: index("session_user_idx").on(table.userId),
}));

// Renamed from 'verificationTokens' to 'verification'
export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(), 
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  identifierValueIdx: uniqueIndex("verification_identifier_value_idx").on(table.identifier, table.value),
}));

// --- Relations for Better Auth Schema (Updated names) ---

// Updated relation name and references
export const userRelations = relations(user, ({ many, one }) => ({
  accounts: many(account), // Reference updated table 'account'
  sessions: many(session), // Reference updated table 'session'
  twoFactor: one(twoFactor),
}));

// Updated relation name and references
export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { // Reference updated table 'user'
    fields: [account.userId],
    references: [user.id],
  }),
}));

// Updated relation name and references
export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { // Reference updated table 'user'
    fields: [session.userId],
    references: [user.id],
  }),
}));

// --- Better Auth 2FA Schema ---

export const twoFactor = sqliteTable("twoFactor", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  backupCodes: text("backupCodes", { mode: "json" }).notNull(), // Store as JSON array string
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  userIdx: index("twoFactor_user_idx").on(table.userId),
}));

// --- Relations for Better Auth 2FA Schema ---

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
    user: one(user, {
        fields: [twoFactor.userId],
        references: [user.id],
    }),
}));

// No relations needed for verification table typically