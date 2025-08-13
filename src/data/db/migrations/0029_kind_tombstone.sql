CREATE TABLE `user_layout_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`default_layout_id` text,
	`pinned_layout_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`default_layout_id`) REFERENCES `layouts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_layout_preferences_user_org_unique_idx` ON `user_layout_preferences` (`user_id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `user_layout_preferences_user_idx` ON `user_layout_preferences` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_layout_preferences_org_idx` ON `user_layout_preferences` (`organization_id`);--> statement-breakpoint
CREATE INDEX `user_layout_preferences_default_layout_idx` ON `user_layout_preferences` (`default_layout_id`);