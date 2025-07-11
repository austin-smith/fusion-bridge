CREATE TABLE `alarm_zone_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`zone_id` text NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`previous_state` text,
	`new_state` text,
	`reason` text,
	`trigger_event_id` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`zone_id`) REFERENCES `alarm_zones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alarm_zone_audit_log_zone_created_idx` ON `alarm_zone_audit_log` (`zone_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `alarm_zone_audit_log_user_created_idx` ON `alarm_zone_audit_log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `alarm_zone_audit_log_action_idx` ON `alarm_zone_audit_log` (`action`);--> statement-breakpoint
CREATE TABLE `alarm_zone_devices` (
	`zone_id` text NOT NULL,
	`device_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`zone_id`, `device_id`),
	FOREIGN KEY (`zone_id`) REFERENCES `alarm_zones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alarm_zone_devices_device_idx` ON `alarm_zone_devices` (`device_id`);--> statement-breakpoint
CREATE INDEX `alarm_zone_devices_zone_idx` ON `alarm_zone_devices` (`zone_id`);--> statement-breakpoint
CREATE TABLE `alarm_zone_trigger_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`zone_id` text NOT NULL,
	`event_type` text NOT NULL,
	`should_trigger` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`zone_id`) REFERENCES `alarm_zones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alarm_zone_trigger_overrides_zone_event_type_idx` ON `alarm_zone_trigger_overrides` (`zone_id`,`event_type`);--> statement-breakpoint
CREATE INDEX `alarm_zone_trigger_overrides_zone_idx` ON `alarm_zone_trigger_overrides` (`zone_id`);--> statement-breakpoint
CREATE TABLE `alarm_zones` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`armed_state` text DEFAULT 'DISARMED' NOT NULL,
	`last_armed_state_change_reason` text,
	`trigger_behavior` text DEFAULT 'standard' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alarm_zones_location_idx` ON `alarm_zones` (`location_id`);--> statement-breakpoint
CREATE INDEX `alarm_zones_armed_state_idx` ON `alarm_zones` (`armed_state`);--> statement-breakpoint
CREATE TABLE `space_devices` (
	`space_id` text NOT NULL,
	`device_id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `space_devices_space_idx` ON `space_devices` (`space_id`);--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `spaces_location_idx` ON `spaces` (`location_id`);