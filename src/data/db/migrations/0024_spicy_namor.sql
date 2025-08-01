CREATE INDEX `events_connector_category_timestamp_idx` ON `events` (`connector_id`,`standardized_event_category`,`timestamp`);--> statement-breakpoint
ALTER TABLE `alarm_zone_audit_log` DROP COLUMN `metadata`;--> statement-breakpoint
ALTER TABLE `devices` DROP COLUMN `is_security_device`;--> statement-breakpoint
ALTER TABLE `spaces` DROP COLUMN `metadata`;