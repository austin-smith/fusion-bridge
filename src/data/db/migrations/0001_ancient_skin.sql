CREATE TABLE `twoFactor` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`secret` text NOT NULL,
	`backupCodes` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `twoFactor_userId_unique` ON `twoFactor` (`userId`);--> statement-breakpoint
CREATE INDEX `twoFactor_user_idx` ON `twoFactor` (`userId`);--> statement-breakpoint
ALTER TABLE `user` ADD `twoFactorEnabled` integer DEFAULT false NOT NULL;