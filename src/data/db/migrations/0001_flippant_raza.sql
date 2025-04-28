CREATE TABLE `area_devices` (
	`area_id` text NOT NULL,
	`device_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`area_id`, `device_id`),
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `areas` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text,
	`name` text NOT NULL,
	`armed_state` text DEFAULT 'DISARMED' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
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
CREATE INDEX `area_devices_device_idx` ON `area_devices` (`device_id`);--> statement-breakpoint
CREATE INDEX `area_devices_area_idx` ON `area_devices` (`area_id`);--> statement-breakpoint
CREATE INDEX `areas_location_idx` ON `areas` (`location_id`);--> statement-breakpoint
CREATE INDEX `locations_parent_idx` ON `locations` (`parent_id`);--> statement-breakpoint
CREATE INDEX `locations_path_idx` ON `locations` (`path`);--> statement-breakpoint
CREATE INDEX `automations_source_connector_idx` ON `automations` (`source_connector_id`);--> statement-breakpoint
CREATE INDEX `camera_assoc_piko_idx` ON `camera_associations` (`piko_camera_id`);--> statement-breakpoint
CREATE INDEX `camera_assoc_device_idx` ON `camera_associations` (`device_id`);--> statement-breakpoint
CREATE INDEX `devices_server_id_idx` ON `devices` (`server_id`);--> statement-breakpoint
