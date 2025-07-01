ALTER TABLE `connectors` ADD `updated_at` integer NOT NULL DEFAULT 0; --> statement-breakpoint
UPDATE `connectors` SET `updated_at` = unixepoch() * 1000;