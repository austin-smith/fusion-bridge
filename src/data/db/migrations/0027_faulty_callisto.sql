CREATE TABLE `device_overlays` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`location_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`x` text NOT NULL,
	`y` text NOT NULL,
	`rotation` text,
	`scale` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_overlays_device_location_unique_idx` ON `device_overlays` (`device_id`,`location_id`);--> statement-breakpoint
CREATE INDEX `device_overlays_organization_idx` ON `device_overlays` (`organization_id`);--> statement-breakpoint
CREATE INDEX `device_overlays_location_idx` ON `device_overlays` (`location_id`);--> statement-breakpoint
CREATE INDEX `device_overlays_device_idx` ON `device_overlays` (`device_id`);