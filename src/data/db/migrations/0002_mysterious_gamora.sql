PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TABLE `automations`;--> statement-breakpoint
CREATE TABLE `automations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`config_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `devices` ADD `standardized_device_type` text;--> statement-breakpoint
ALTER TABLE `devices` ADD `standardized_device_subtype` text;--> statement-breakpoint
CREATE INDEX `devices_std_type_idx` ON `devices` (`standardized_device_type`);--> statement-breakpoint
CREATE INDEX `devices_std_subtype_idx` ON `devices` (`standardized_device_subtype`);--> statement-breakpoint
CREATE INDEX `events_event_type_idx` ON `events` (`standardized_event_type`);