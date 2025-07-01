PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_arming_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`days_of_week` text NOT NULL,
	`arm_time_local` text NOT NULL,
	`disarm_time_local` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_arming_schedules`("id", "name", "days_of_week", "arm_time_local", "disarm_time_local", "is_enabled", "created_at", "updated_at") SELECT "id", "name", "days_of_week", "arm_time_local", "disarm_time_local", "is_enabled", "created_at", "updated_at" FROM `arming_schedules`;--> statement-breakpoint
DROP TABLE `arming_schedules`;--> statement-breakpoint
ALTER TABLE `__new_arming_schedules` RENAME TO `arming_schedules`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `arming_schedules_is_enabled_idx` ON `arming_schedules` (`is_enabled`);