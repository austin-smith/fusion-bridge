CREATE TABLE `arming_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`days_of_week` text NOT NULL,
	`arm_time_local` text NOT NULL,
	`disarm_time_local` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `arming_schedules_is_enabled_idx` ON `arming_schedules` (`is_enabled`);--> statement-breakpoint
ALTER TABLE `areas` ADD `last_armed_state_change_reason` text;--> statement-breakpoint
ALTER TABLE `areas` ADD `next_scheduled_arm_time` integer;--> statement-breakpoint
ALTER TABLE `areas` ADD `next_scheduled_disarm_time` integer;--> statement-breakpoint
ALTER TABLE `areas` ADD `is_arming_skipped_until` integer;--> statement-breakpoint
ALTER TABLE `areas` ADD `override_arming_schedule_id` text REFERENCES arming_schedules(id);--> statement-breakpoint
CREATE INDEX `areas_override_arming_schedule_idx` ON `areas` (`override_arming_schedule_id`);--> statement-breakpoint
ALTER TABLE `devices` ADD `is_security_device` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `locations` ADD `time_zone` text NOT NULL DEFAULT 'America/Los_Angeles';--> statement-breakpoint
ALTER TABLE `locations` ADD `active_arming_schedule_id` text REFERENCES arming_schedules(id);--> statement-breakpoint
CREATE INDEX `locations_active_arming_schedule_idx` ON `locations` (`active_arming_schedule_id`);