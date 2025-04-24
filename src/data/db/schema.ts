import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import type { AutomationConfig } from "@/lib/automation-schemas"; // Import the config type

export const nodes = sqliteTable("nodes", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  name: text("name").notNull(),
  cfg_enc: text("cfg_enc").notNull(), // Stores config as JSON string
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  yolinkHomeId: text("yolink_home_id"),  // New column to store YoLink home ID
  eventsEnabled: integer("events_enabled", { mode: "boolean" }).notNull().default(false), // Whether events are enabled for this node
});

// --- NEW events table schema ---
export const events = sqliteTable("events", {
  // Core identifiers
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventUuid: text("event_uuid").notNull().unique(), // Store StandardizedEvent.eventId

  // Timing and Source
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(), // StandardizedEvent.timestamp
  connectorId: text("connector_id").notNull().references(() => nodes.id, { onDelete: 'set null' }), // StandardizedEvent.connectorId - Set null if node deleted
  deviceId: text("device_id").notNull(), // StandardizedEvent.deviceId (connector-specific)

  // Standardized Classification
  standardizedEventCategory: text("standardized_event_category").notNull(), // StandardizedEvent.eventCategory
  standardizedEventType: text("standardized_event_type").notNull(), // StandardizedEvent.eventType

  // Payloads
  rawEventType: text("raw_event_type"), // Original event type string (nullable? - let's keep nullable for now)
  standardizedPayload: text("standardized_payload", { mode: "json" }).notNull(), // JSON string of StandardizedEvent.payload
  rawPayload: text("raw_payload", { mode: "json" }).notNull(), // JSON string of StandardizedEvent.rawEventPayload

}, (table) => ({
    // Indexes for common query patterns
    timestampIdx: index("events_timestamp_idx").on(table.timestamp),
    connectorDeviceIdx: index("events_connector_device_idx").on(table.connectorId, table.deviceId),
}));

// Table for storing devices from all connectors
export const devices = sqliteTable("devices", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()), // Add default UUID generation
  deviceId: text("device_id").notNull(), // External device ID from the connector
  connectorId: text("connector_id").notNull().references(() => nodes.id, { onDelete: 'cascade' }), // References the connector node
  name: text("name").notNull(),
  type: text("type").notNull(), // Device type/model
  status: text("status"), // Device status (nullable)
  serverId: text("server_id").references(() => pikoServers.serverId), // FK to pikoServers table
  vendor: text("vendor"), 
  model: text("model"), 
  url: text("url"), 
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Keep existing unique index for devices
  connectorDeviceUniqueIdx: uniqueIndex("devices_connector_device_unique_idx")
    .on(table.connectorId, table.deviceId),
}));

// Table for storing Piko server information
export const pikoServers = sqliteTable("piko_servers", {
  serverId: text("id").primaryKey(), // Piko server ID (e.g., "{45645270...}")
  connectorId: text("connector_id").notNull().references(() => nodes.id, { onDelete: 'cascade' }), // References the Piko connector node
  name: text("name").notNull(),
  status: text("status"), // e.g., "Online"
  version: text("version"), // e.g., "6.0.3.40568"
  osPlatform: text("os_platform"), // e.g., "windows_x64"
  osVariantVersion: text("os_variant_version"), // e.g., "10.0.14393"
  url: text("url"), // Server URL
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Junction table for camera associations (renamed from deviceAssociations)
export const cameraAssociations = sqliteTable('camera_associations', { // Renamed table
  deviceId: text('device_id').references(() => devices.id, { onDelete: 'cascade' }).notNull(), // Renamed from yolinkDeviceId
  pikoCameraId: text('piko_camera_id').references(() => devices.id, { onDelete: 'cascade' }).notNull(), // Kept as is
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()), 
}, (table) => ({ 
  // Updated primary key columns
  pk: primaryKey({ columns: [table.deviceId, table.pikoCameraId] }), 
}));

// Table for storing automation configurations
export const automations = sqliteTable("automations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()), // Unique ID for the automation config
  name: text("name").notNull(), // User-friendly name
  sourceNodeId: text("source_node_id").notNull().references(() => nodes.id, { onDelete: 'cascade' }), // Link to the source connector node
  enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
  // Configuration stored as JSON string, validated by Zod on read/write
  configJson: text("config_json", { mode: "json" }).notNull().$type<AutomationConfig>(), 
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(unixepoch('now', 'subsec') * 1000)`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(sql`(unixepoch('now', 'subsec') * 1000)`).notNull(),
});

// Define relations for automations (linking back to nodes)
export const automationsRelations = relations(automations, ({ one }) => ({
  sourceNode: one(nodes, {
    fields: [automations.sourceNodeId],
    references: [nodes.id],
    relationName: 'sourceAutomations',
  }),
}));