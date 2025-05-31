CREATE TABLE `apikey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`start` text,
	`prefix` text,
	`key` text NOT NULL,
	`user_id` text NOT NULL,
	`refill_interval` integer,
	`refill_amount` integer,
	`last_refill_at` integer,
	`enabled` integer,
	`rate_limit_enabled` integer,
	`rate_limit_time_window` integer,
	`rate_limit_max` integer,
	`request_count` integer,
	`remaining` integer,
	`last_request` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`permissions` text,
	`metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `apikey_user_idx` ON `apikey` (`user_id`);--> statement-breakpoint
CREATE INDEX `apikey_enabled_idx` ON `apikey` (`enabled`);--> statement-breakpoint
CREATE INDEX `apikey_expires_at_idx` ON `apikey` (`expires_at`);--> statement-breakpoint
CREATE INDEX `apikey_created_at_idx` ON `apikey` (`created_at`);--> statement-breakpoint
CREATE INDEX `apikey_updated_at_idx` ON `apikey` (`updated_at`);