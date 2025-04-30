CREATE TABLE `area_devices` (
	`area_id` text NOT NULL,
	`device_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`area_id`, `device_id`),
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `area_devices_device_idx` ON `area_devices` (`device_id`);--> statement-breakpoint
CREATE INDEX `area_devices_area_idx` ON `area_devices` (`area_id`);--> statement-breakpoint
CREATE TABLE `areas` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`name` text NOT NULL,
	`armed_state` text DEFAULT 'DISARMED' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `areas_location_idx` ON `areas` (`location_id`);--> statement-breakpoint
CREATE TABLE `automations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`config_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `camera_associations` (
	`device_id` text NOT NULL,
	`piko_camera_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`device_id`, `piko_camera_id`),
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`piko_camera_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `camera_assoc_piko_idx` ON `camera_associations` (`piko_camera_id`);--> statement-breakpoint
CREATE INDEX `camera_assoc_device_idx` ON `camera_associations` (`device_id`);--> statement-breakpoint
CREATE TABLE `connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`cfg_enc` text NOT NULL,
	`created_at` integer NOT NULL,
	`events_enabled` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`connector_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`standardized_device_type` text,
	`standardized_device_subtype` text,
	`status` text,
	`server_id` text,
	`vendor` text,
	`model` text,
	`url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`connector_id`) REFERENCES `connectors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_connector_device_unique_idx` ON `devices` (`connector_id`,`device_id`);--> statement-breakpoint
CREATE INDEX `devices_std_type_idx` ON `devices` (`standardized_device_type`);--> statement-breakpoint
CREATE INDEX `devices_std_subtype_idx` ON `devices` (`standardized_device_subtype`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_uuid` text NOT NULL,
	`timestamp` integer NOT NULL,
	`connector_id` text NOT NULL,
	`device_id` text NOT NULL,
	`standardized_event_category` text NOT NULL,
	`standardized_event_type` text NOT NULL,
	`standardized_event_subtype` text,
	`raw_event_type` text,
	`standardized_payload` text NOT NULL,
	`raw_payload` text NOT NULL,
	FOREIGN KEY (`connector_id`) REFERENCES `connectors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_event_uuid_unique` ON `events` (`event_uuid`);--> statement-breakpoint
CREATE INDEX `events_timestamp_idx` ON `events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `events_connector_device_idx` ON `events` (`connector_id`,`device_id`);--> statement-breakpoint
CREATE INDEX `events_event_type_idx` ON `events` (`standardized_event_type`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `locations_parent_idx` ON `locations` (`parent_id`);--> statement-breakpoint
CREATE INDEX `locations_path_idx` ON `locations` (`path`);--> statement-breakpoint
CREATE TABLE `piko_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`connector_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text,
	`version` text,
	`os_platform` text,
	`os_variant_version` text,
	`url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`connector_id`) REFERENCES `connectors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `piko_servers_connector_idx` ON `piko_servers` (`connector_id`);