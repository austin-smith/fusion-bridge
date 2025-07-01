ALTER TABLE `automations` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX `automations_tags_idx` ON `automations` (`tags`);