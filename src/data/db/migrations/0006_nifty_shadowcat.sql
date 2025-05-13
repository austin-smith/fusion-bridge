CREATE TABLE `service_configurations` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`config_enc` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
