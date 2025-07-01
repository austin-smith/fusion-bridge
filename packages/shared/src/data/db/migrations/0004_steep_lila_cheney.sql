ALTER TABLE `account` RENAME COLUMN "created_at" TO "createdAt";--> statement-breakpoint
ALTER TABLE `account` RENAME COLUMN "updated_at" TO "updatedAt";--> statement-breakpoint
ALTER TABLE `session` RENAME COLUMN "created_at" TO "createdAt";--> statement-breakpoint
ALTER TABLE `session` RENAME COLUMN "updated_at" TO "updatedAt";--> statement-breakpoint
ALTER TABLE `session` RENAME COLUMN "impersonated_by" TO "impersonatedBy";--> statement-breakpoint
ALTER TABLE `twoFactor` RENAME COLUMN "created_at" TO "createdAt";--> statement-breakpoint
ALTER TABLE `twoFactor` RENAME COLUMN "updated_at" TO "updatedAt";--> statement-breakpoint
ALTER TABLE `user` RENAME COLUMN "created_at" TO "createdAt";--> statement-breakpoint
ALTER TABLE `user` RENAME COLUMN "updated_at" TO "updatedAt";--> statement-breakpoint
ALTER TABLE `user` RENAME COLUMN "ban_reason" TO "banReason";--> statement-breakpoint
ALTER TABLE `user` RENAME COLUMN "ban_expires" TO "banExpires";--> statement-breakpoint
ALTER TABLE `verification` RENAME COLUMN "created_at" TO "createdAt";--> statement-breakpoint
ALTER TABLE `verification` RENAME COLUMN "updated_at" TO "updatedAt";