import { sqliteTable, text, integer, primaryKey, uniqueIndex, index, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import type { AutomationConfig } from "@/lib/automation-schemas"; // Import the config type
import { ArmedState } from '@/lib/mappings/definitions'; // <-- Import the enum
import type { DeviceType, DeviceSubtype } from '@/lib/mappings/definitions'; 

export const connectors = sqliteTable("connectors", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  category: text("category").notNull(),
  name: text("name").notNull(),
  cfg_enc: text("cfg_enc").notNull(), // Stores config as JSON string
  organizationId: text("organization_id").references(() => organization.id, { onDelete: 'cascade' }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  eventsEnabled: integer("events_enabled", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  organizationIdx: index("connectors_organization_idx").on(table.organizationId),
}));

// Remove relation to automations as sourceConnectorId is removed from automations
export const connectorsRelations = relations(connectors, ({ one, many }) => ({
  organization: one(organization, {
    fields: [connectors.organizationId],
    references: [organization.id],
  }),
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
  standardizedDeviceType: text("standardized_device_type").$type<DeviceType>(), // Mapped DeviceType enum value
  standardizedDeviceSubtype: text("standardized_device_subtype").$type<DeviceSubtype | null>(), // Mapped DeviceSubtype enum value (nullable)
  status: text("status"),
  batteryPercentage: integer("battery_percentage"), // 0-100 percentage, nullable
  serverId: text("server_id"), // Optional: e.g., Piko Server ID
  vendor: text("vendor"),
  model: text("model"),
  url: text("url"),
  isSecurityDevice: integer("is_security_device", { mode: "boolean" }).default(false).notNull(),
  rawDeviceData: text("raw_device_data", { mode: "json" }).$type<Record<string, unknown> | null>(), // Store the raw device data object from the API as JSON string
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
  organizationId: text("organization_id").references(() => organization.id, { onDelete: 'cascade' }),
  locationScopeId: text("location_scope_id").references(() => locations.id, { onDelete: 'cascade' }),
  tags: text("tags", { mode: "json" }).$type<string[]>().default(sql`'[]'`).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(unixepoch('now', 'subsec') * 1000)`).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(sql`(unixepoch('now', 'subsec') * 1000)`).notNull(),
}, (table) => ({
  // Index for filtering by tags - useful for tag-based queries
  tagsIdx: index("automations_tags_idx").on(table.tags),
  organizationIdx: index("automations_organization_idx").on(table.organizationId),
}));

// --- ADDED: Relations for Automations ---
export const automationsRelations = relations(automations, ({ one }) => ({
  location: one(locations, {
    fields: [automations.locationScopeId],
    references: [locations.id],
  }),
  organization: one(organization, {
    fields: [automations.organizationId],
    references: [organization.id],
  }),
}));
// --- END ADDED ---

// --- NEW: Locations Table ---
export const locations = sqliteTable("locations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  parentId: text("parent_id").references((): AnySQLiteColumn => locations.id, { onDelete: 'cascade' }), 
  organizationId: text("organization_id").references(() => organization.id, { onDelete: 'cascade' }), // ADDED: nullable initially
  name: text("name").notNull(),
  path: text("path").notNull(), 
  timeZone: text("time_zone").notNull(),
  externalId: text("external_id"),
  addressStreet: text("address_street").notNull(),
  addressCity: text("address_city").notNull(),
  addressState: text("address_state").notNull(),
  addressPostalCode: text("address_postal_code").notNull(),
  notes: text("notes"), 
  latitude: text("latitude"),
  longitude: text("longitude"),
  activeArmingScheduleId: text("active_arming_schedule_id").references(() => armingSchedules.id, { onDelete: 'set null' }),
  sunriseTime: text("sunrise_time"), // "HH:mm" format in local timezone
  sunsetTime: text("sunset_time"),   // "HH:mm" format in local timezone
  sunTimesUpdatedAt: integer("sun_times_updated_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
    parentIdx: index("locations_parent_idx").on(table.parentId),
    organizationIdx: index("locations_organization_idx").on(table.organizationId), // ADDED: Index for FK
    pathIdx: index("locations_path_idx").on(table.path),
    activeArmingScheduleIdx: index("locations_active_arming_schedule_idx").on(table.activeArmingScheduleId), // Index for FK
}));

// Relations for Locations
export const locationsRelations = relations(locations, ({ one, many }) => ({
  parent: one(locations, { 
    fields: [locations.parentId],
    references: [locations.id],
    relationName: 'parentLocation',
  }),
  children: many(locations, { 
    relationName: 'parentLocation',
  }),
  organization: one(organization, { // ADDED: Organization relation
    fields: [locations.organizationId],
    references: [organization.id],
  }),
  areas: many(areas), 
  activeArmingSchedule: one(armingSchedules, { // <-- ADDED relation
    fields: [locations.activeArmingScheduleId],
    references: [armingSchedules.id],
  }),
}));

// --- NEW: Areas Table ---
export const areas = sqliteTable("areas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  locationId: text("location_id").references(() => locations.id, { onDelete: 'cascade' }).notNull(),
  name: text("name").notNull(),
  armedState: text("armed_state").$type<ArmedState>().notNull().default(ArmedState.DISARMED),
  lastArmedStateChangeReason: text("last_armed_state_change_reason"), 
  nextScheduledArmTime: integer("next_scheduled_arm_time", { mode: "timestamp" }), 
  nextScheduledDisarmTime: integer("next_scheduled_disarm_time", { mode: "timestamp" }), 
  isArmingSkippedUntil: integer("is_arming_skipped_until", { mode: "timestamp" }), 
  overrideArmingScheduleId: text("override_arming_schedule_id").references(() => armingSchedules.id, { onDelete: 'set null' }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
    locationIdx: index("areas_location_idx").on(table.locationId),
    overrideArmingScheduleIdx: index("areas_override_arming_schedule_idx").on(table.overrideArmingScheduleId), // Index for FK
}));

// Relations for Areas
export const areasRelations = relations(areas, ({ one, many }) => ({
  location: one(locations, { 
    fields: [areas.locationId],
    references: [locations.id],
  }),
  areaDevices: many(areaDevices), 
  overrideArmingSchedule: one(armingSchedules, { // <-- ADDED relation
    fields: [areas.overrideArmingScheduleId],
    references: [armingSchedules.id],
  }),
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

// --- NEW: ArmingSchedules Table ---
export const armingSchedules = sqliteTable("arming_schedules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(), // Nullable, for identifying the schedule e.g., "Weekday Evenings"
  daysOfWeek: text("days_of_week", { mode: "json" }).notNull().$type<number[]>(), // e.g. [0,1,2,3,4] for Mon-Fri
  armTimeLocal: text("arm_time_local").notNull(), // e.g., "09:00"
  disarmTimeLocal: text("disarm_time_local").notNull(), // e.g., "18:00"
  isEnabled: integer("is_enabled", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // No direct FKs to areas or locations needed here; this is a lookup table.
  // Index on isEnabled might be useful if querying for active schedules frequently.
  isEnabledIdx: index("arming_schedules_is_enabled_idx").on(table.isEnabled),
}));

// Relations for ArmingSchedules - this table is now a lookup, so it has no outgoing relations to specific locations/areas.
// It will be referenced BY locations and areas.
export const armingSchedulesRelations = relations(armingSchedules, ({ many }) => ({
  // Example if other tables needed to know all locations/areas using this schedule (complex)
  // For now, this can be empty or used for other purposes if a schedule needs to link to something else directly.
}));

// --- Better Auth Core Schema (Renamed to defaults) ---

export const user = sqliteTable("user", {
  id: text("id").primaryKey(), 
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: integer("emailVerified", { mode: "boolean" }), 
  image: text("image"),
  twoFactorEnabled: integer("twoFactorEnabled", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  role: text('role'), 
  banned: integer('banned', { mode: 'boolean' }), 
  banReason: text('banReason'), 
  banExpires: integer('banExpires', { mode: 'timestamp' }),
});

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
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  providerAccountIdx: uniqueIndex("provider_account_idx").on(table.providerId, table.accountId),
  userIdx: index("account_user_idx").on(table.userId),
}));

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }), 
  token: text("token").unique().notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  activeOrganizationId: text("activeOrganizationId").references(() => organization.id, { onDelete: 'set null' }), // ADDED: Active organization
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  impersonatedBy: text('impersonatedBy')
}, (table) => ({
  tokenIdx: index("session_token_idx").on(table.token),
  userIdx: index("session_user_idx").on(table.userId),
  activeOrgIdx: index("session_active_org_idx").on(table.activeOrganizationId), // ADDED: Index for FK
}));

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(), 
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  identifierValueIdx: uniqueIndex("verification_identifier_value_idx").on(table.identifier, table.value),
}));

// --- Relations for Better Auth Schema (Updated names) ---

export const userRelations = relations(user, ({ many, one }) => ({
  accounts: many(account), // Reference updated table 'account'
  sessions: many(session), // Reference updated table 'session'
  twoFactor: one(twoFactor),
  apiKeys: many(apikey),
  memberOf: many(member), // ADDED: User is member of organizations
  sentInvitations: many(invitation), // ADDED: User can send invitations
  keypadPins: many(keypadPins), // NEW: User keypad PINs across organizations
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { // Reference updated table 'user'
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { // Reference updated table 'user'
    fields: [session.userId],
    references: [user.id],
  }),
  activeOrganization: one(organization, { // ADDED: Active organization relation
    fields: [session.activeOrganizationId],
    references: [organization.id],
  }),
}));

// --- Better Auth 2FA Schema ---

export const twoFactor = sqliteTable("twoFactor", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  backupCodes: text("backupCodes", { mode: "json" }).notNull(), // Store as JSON array string
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
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

// --- NEW: Keypad PINs Table ---
export const keypadPins = sqliteTable("keypad_pins", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  keypadPin: text("keypad_pin").notNull(), // Hashed PIN string
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Enforce PIN uniqueness within organization
  orgPinUniqueIdx: uniqueIndex("keypad_pins_org_pin_unique_idx").on(table.organizationId, table.keypadPin),
  // One PIN per user per organization
  userOrgUniqueIdx: uniqueIndex("keypad_pins_user_org_unique_idx").on(table.userId, table.organizationId),
  // Index for fast lookups
  organizationIdx: index("keypad_pins_organization_idx").on(table.organizationId),
  userIdx: index("keypad_pins_user_idx").on(table.userId),
}));

// --- Relations for Keypad PINs Schema ---
export const keypadPinsRelations = relations(keypadPins, ({ one }) => ({
  user: one(user, {
    fields: [keypadPins.userId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [keypadPins.organizationId],
    references: [organization.id],
  }),
}));

// --- NEW: Service Configurations Table ---
export const serviceConfigurations = sqliteTable("service_configurations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text("type").notNull(),
  configEnc: text("config_enc").notNull(), // Encrypted JSON blob
  isEnabled: integer("is_enabled", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// --- NEW: Automation Audit Trail Tables ---

// Table for tracking automation executions
export const automationExecutions = sqliteTable("automation_executions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  automationId: text("automation_id").notNull().references(() => automations.id, { onDelete: 'cascade' }),
  
  // Trigger information
  triggerTimestamp: integer("trigger_timestamp", { mode: "timestamp_ms" }).notNull(), // when automation was triggered
  triggerEventId: text("trigger_event_id"), // references events.eventUuid if event-triggered, NULL for scheduled
  triggerContext: text("trigger_context", { mode: "json" }).notNull().$type<Record<string, any>>(), // full facts object used for token replacement
  
  // Condition evaluation results
  stateConditionsMet: integer("state_conditions_met", { mode: "boolean" }), // result of primary trigger conditions (NULL for scheduled)
  temporalConditionsMet: integer("temporal_conditions_met", { mode: "boolean" }), // result of temporal conditions (NULL if no temporal conditions)
  
  // Execution results
  executionStatus: text("execution_status").notNull(), // 'success', 'partial_failure', 'failure'
  executionDurationMs: integer("execution_duration_ms"), // how long the entire execution took (nullable)
  
  // Action execution summary
  totalActions: integer("total_actions").notNull().default(0),
  successfulActions: integer("successful_actions").notNull().default(0),
  failedActions: integer("failed_actions").notNull().default(0),
  
  // Metadata
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(unixepoch('now', 'subsec') * 1000)`).notNull(),
}, (table) => ({
  automationIdx: index("automation_executions_automation_idx").on(table.automationId),
  timestampIdx: index("automation_executions_timestamp_idx").on(table.triggerTimestamp),
  triggerEventIdx: index("automation_executions_trigger_event_idx").on(table.triggerEventId),
  statusIdx: index("automation_executions_status_idx").on(table.executionStatus),
}));

// Table for tracking individual action executions within an automation
export const automationActionExecutions = sqliteTable("automation_action_executions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  executionId: text("execution_id").notNull().references(() => automationExecutions.id, { onDelete: 'cascade' }),
  actionIndex: integer("action_index").notNull(), // order of action in the automation (0-based)
  actionType: text("action_type").notNull(),
  actionParams: text("action_params", { mode: "json" }).notNull().$type<Record<string, any>>(),
  
  // Execution results
  status: text("status").notNull(), // 'success', 'failure', 'skipped'
  errorMessage: text("error_message"), // error details if failed
  retryCount: integer("retry_count").notNull().default(0),
  executionDurationMs: integer("execution_duration_ms"),
  
  // Action-specific result data (optional, for actions that return meaningful data)
  resultData: text("result_data", { mode: "json" }).$type<Record<string, any> | null>(), // e.g., HTTP response status, created event ID, etc.
  
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
}, (table) => ({
  executionIdx: index("automation_action_executions_execution_idx").on(table.executionId),
  statusIdx: index("automation_action_executions_status_idx").on(table.status),
  typeIdx: index("automation_action_executions_type_idx").on(table.actionType),
}));

// Relations for automation audit trail tables
export const automationExecutionsRelations = relations(automationExecutions, ({ one, many }) => ({
  automation: one(automations, {
    fields: [automationExecutions.automationId],
    references: [automations.id],
  }),
  actionExecutions: many(automationActionExecutions),
}));

export const automationActionExecutionsRelations = relations(automationActionExecutions, ({ one }) => ({
  execution: one(automationExecutions, {
    fields: [automationActionExecutions.executionId],
    references: [automationExecutions.id],
  }),
}));

export const apikey = sqliteTable("apikey", {
  id: text('id').primaryKey(),
  name: text('name'),
  start: text('start'),
  prefix: text('prefix'),
  key: text('key').notNull(),
  userId: text('user_id').notNull().references(()=> user.id, { onDelete: 'cascade' }),
  refillInterval: integer('refill_interval'),
  refillAmount: integer('refill_amount'),
  lastRefillAt: integer('last_refill_at', { mode: 'timestamp' }),
  enabled: integer('enabled', { mode: 'boolean' }),
  rateLimitEnabled: integer('rate_limit_enabled', { mode: 'boolean' }),
  rateLimitTimeWindow: integer('rate_limit_time_window'),
  rateLimitMax: integer('rate_limit_max'),
  requestCount: integer('request_count'),
  remaining: integer('remaining'),
  lastRequest: integer('last_request', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  permissions: text('permissions'),
  metadata: text('metadata')
}, (table) => ({
  userIdx: index("apikey_user_idx").on(table.userId),
  enabledIdx: index("apikey_enabled_idx").on(table.enabled),
  expiresAtIdx: index("apikey_expires_at_idx").on(table.expiresAt),
  createdAtIdx: index("apikey_created_at_idx").on(table.createdAt),
  updatedAtIdx: index("apikey_updated_at_idx").on(table.updatedAt),
}));

// --- Relations for API Key Schema ---
export const apikeyRelations = relations(apikey, ({ one }) => ({
  user: one(user, {
    fields: [apikey.userId],
    references: [user.id],
  }),
}));

// --- Better Auth Organization Schema ---

export const organization = sqliteTable("organization", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  logo: text("logo"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, any> | null>(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  slugIdx: uniqueIndex("organization_slug_idx").on(table.slug),
}));

export const member = sqliteTable("member", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  organizationId: text("organizationId").notNull().references(() => organization.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // owner, admin, member
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  userOrgIdx: uniqueIndex("member_user_org_idx").on(table.userId, table.organizationId),
  userIdx: index("member_user_idx").on(table.userId),
  orgIdx: index("member_org_idx").on(table.organizationId),
}));

export const invitation = sqliteTable("invitation", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull(),
  inviterId: text("inviterId").notNull().references(() => user.id, { onDelete: "cascade" }),
  organizationId: text("organizationId").notNull().references(() => organization.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("pending"), // pending, accepted, rejected, expired
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  emailOrgIdx: index("invitation_email_org_idx").on(table.email, table.organizationId),
  inviterIdx: index("invitation_inviter_idx").on(table.inviterId),
  orgIdx: index("invitation_org_idx").on(table.organizationId),
  statusIdx: index("invitation_status_idx").on(table.status),
}));

// --- Relations for Better Auth Organization Schema ---

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
  locations: many(locations), // Organization has many locations
  connectors: many(connectors), // Organization has many connectors
  automations: many(automations), // NEW: Organization has many automations
  sessions: many(session), // For activeOrganizationId reference
  keypadPins: many(keypadPins), // NEW: Organization keypad PINs
}));

export const memberRelations = relations(member, ({ one }) => ({
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  inviter: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
}));
