CREATE TABLE `keypad_pins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`keypad_pin` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `keypad_pins_org_pin_unique_idx` ON `keypad_pins` (`organization_id`,`keypad_pin`);--> statement-breakpoint
CREATE UNIQUE INDEX `keypad_pins_user_org_unique_idx` ON `keypad_pins` (`user_id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `keypad_pins_organization_idx` ON `keypad_pins` (`organization_id`);--> statement-breakpoint
CREATE INDEX `keypad_pins_user_idx` ON `keypad_pins` (`user_id`);--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `keypadPin`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `keypadPinSetAt`;