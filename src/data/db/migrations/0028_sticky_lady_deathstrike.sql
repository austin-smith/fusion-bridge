CREATE TABLE `floor_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`location_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`floor_plan_data` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `floor_plans_location_idx` ON `floor_plans` (`location_id`);--> statement-breakpoint
CREATE INDEX `floor_plans_organization_idx` ON `floor_plans` (`organization_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_device_overlays` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`floor_plan_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`floor_plan_id`) REFERENCES `floor_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_device_overlays`("id", "device_id", "floor_plan_id", "organization_id", "x", "y", "created_at", "updated_at", "created_by_user_id", "updated_by_user_id") SELECT "id", "device_id", "floor_plan_id", "organization_id", "x", "y", "created_at", "updated_at", "created_by_user_id", "updated_by_user_id" FROM `device_overlays`;--> statement-breakpoint
DROP TABLE `device_overlays`;--> statement-breakpoint
ALTER TABLE `__new_device_overlays` RENAME TO `device_overlays`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `device_overlays_device_floor_plan_unique_idx` ON `device_overlays` (`device_id`,`floor_plan_id`);--> statement-breakpoint
CREATE INDEX `device_overlays_organization_idx` ON `device_overlays` (`organization_id`);--> statement-breakpoint
CREATE INDEX `device_overlays_floor_plan_idx` ON `device_overlays` (`floor_plan_id`);--> statement-breakpoint
CREATE INDEX `device_overlays_device_idx` ON `device_overlays` (`device_id`);--> statement-breakpoint
ALTER TABLE `locations` DROP COLUMN `floor_plan`;