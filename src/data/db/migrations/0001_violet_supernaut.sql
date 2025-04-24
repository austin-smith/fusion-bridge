ALTER TABLE events ADD `event_uuid` text NOT NULL;--> statement-breakpoint
ALTER TABLE events ADD `connector_id` text NOT NULL REFERENCES nodes(id);--> statement-breakpoint
ALTER TABLE events ADD `standardized_event_category` text NOT NULL;--> statement-breakpoint
ALTER TABLE events ADD `standardized_event_type` text NOT NULL;--> statement-breakpoint
ALTER TABLE events ADD `raw_event_type` text;--> statement-breakpoint
ALTER TABLE events ADD `standardized_payload` text NOT NULL;--> statement-breakpoint
ALTER TABLE events ADD `raw_payload` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `events_event_uuid_unique` ON `events` (`event_uuid`);--> statement-breakpoint
CREATE INDEX `events_timestamp_idx` ON `events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `events_connector_device_idx` ON `events` (`connector_id`,`device_id`);--> statement-breakpoint
ALTER TABLE `events` DROP COLUMN `event_type`;--> statement-breakpoint
ALTER TABLE `events` DROP COLUMN `payload`;