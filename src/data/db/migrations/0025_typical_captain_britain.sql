CREATE TABLE `organization_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`type` text NOT NULL,
	`config_json` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_settings_org_type_unique_idx` ON `organization_settings` (`organization_id`,`type`);--> statement-breakpoint
CREATE INDEX `organization_settings_organization_idx` ON `organization_settings` (`organization_id`);--> statement-breakpoint
CREATE INDEX `organization_settings_type_idx` ON `organization_settings` (`type`);