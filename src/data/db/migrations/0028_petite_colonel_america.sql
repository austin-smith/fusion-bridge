CREATE TABLE `layouts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`device_ids` text NOT NULL,
	`items` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `layouts_organization_idx` ON `layouts` (`organization_id`);--> statement-breakpoint
CREATE INDEX `layouts_created_by_idx` ON `layouts` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `layouts_updated_by_idx` ON `layouts` (`updated_by_user_id`);