DROP TABLE `area_devices`;--> statement-breakpoint
DROP TABLE `areas`;--> statement-breakpoint
DROP TABLE `camera_associations`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_alarm_zone_devices` (
	`zone_id` text NOT NULL,
	`device_id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`zone_id`) REFERENCES `alarm_zones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_alarm_zone_devices`("zone_id", "device_id", "created_at") SELECT "zone_id", "device_id", "created_at" FROM `alarm_zone_devices`;--> statement-breakpoint
DROP TABLE `alarm_zone_devices`;--> statement-breakpoint
ALTER TABLE `__new_alarm_zone_devices` RENAME TO `alarm_zone_devices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `alarm_zone_devices_zone_idx` ON `alarm_zone_devices` (`zone_id`);