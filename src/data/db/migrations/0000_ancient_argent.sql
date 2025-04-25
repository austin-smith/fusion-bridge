CREATE TABLE `automations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source_connector_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`config_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL,
	FOREIGN KEY (`source_connector_id`) REFERENCES `connectors`(`id`) ON UPDATE no action ON DELETE cascade
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
	`status` text,
	`server_id` text,
	`vendor` text,
	`model` text,
	`url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`connector_id`) REFERENCES `connectors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`server_id`) REFERENCES `piko_servers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_uuid` text NOT NULL,
	`timestamp` integer NOT NULL,
	`connector_id` text NOT NULL,
	`device_id` text NOT NULL,
	`standardized_event_category` text NOT NULL,
	`standardized_event_type` text NOT NULL,
	`raw_event_type` text,
	`standardized_payload` text NOT NULL,
	`raw_payload` text NOT NULL,
	FOREIGN KEY (`connector_id`) REFERENCES `connectors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
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
CREATE UNIQUE INDEX `devices_connector_device_unique_idx` ON `devices` (`connector_id`,`device_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_event_uuid_unique` ON `events` (`event_uuid`);--> statement-breakpoint
CREATE INDEX `events_timestamp_idx` ON `events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `events_connector_device_idx` ON `events` (`connector_id`,`device_id`);