CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`inviterId` text NOT NULL,
	`organizationId` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`inviterId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invitation_email_org_idx` ON `invitation` (`email`,`organizationId`);--> statement-breakpoint
CREATE INDEX `invitation_inviter_idx` ON `invitation` (`inviterId`);--> statement-breakpoint
CREATE INDEX `invitation_org_idx` ON `invitation` (`organizationId`);--> statement-breakpoint
CREATE INDEX `invitation_status_idx` ON `invitation` (`status`);--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`organizationId` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_user_org_idx` ON `member` (`userId`,`organizationId`);--> statement-breakpoint
CREATE INDEX `member_user_idx` ON `member` (`userId`);--> statement-breakpoint
CREATE INDEX `member_org_idx` ON `member` (`organizationId`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`metadata` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_idx` ON `organization` (`slug`);--> statement-breakpoint
ALTER TABLE `locations` ADD `organization_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `locations_organization_idx` ON `locations` (`organization_id`);--> statement-breakpoint
ALTER TABLE `session` ADD `activeOrganizationId` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `session_active_org_idx` ON `session` (`activeOrganizationId`);--> statement-breakpoint

-- Handle existing installations: Create default organization if locations exist without organizationId
INSERT INTO organization (id, name, slug, createdAt, updatedAt) 
SELECT 
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
  'Default Organization', 
  'default', 
  datetime('now'), 
  datetime('now')
WHERE EXISTS (SELECT 1 FROM locations WHERE organization_id IS NULL)
  AND NOT EXISTS (SELECT 1 FROM organization WHERE slug = 'default');--> statement-breakpoint

-- Assign orphaned locations to the default organization
UPDATE locations 
SET organization_id = (SELECT id FROM organization WHERE slug = 'default'), 
    updated_at = datetime('now')
WHERE organization_id IS NULL 
  AND EXISTS (SELECT 1 FROM organization WHERE slug = 'default');--> statement-breakpoint

-- Make the first user (by creation date) the owner of the default organization if it was created for migration
INSERT INTO member (id, userId, organizationId, role, createdAt, updatedAt)
SELECT 
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
  (SELECT id FROM user ORDER BY createdAt ASC LIMIT 1),
  (SELECT id FROM organization WHERE slug = 'default'),
  'owner',
  datetime('now'),
  datetime('now')
WHERE EXISTS (SELECT 1 FROM organization WHERE slug = 'default')
  AND EXISTS (SELECT 1 FROM user)
  AND NOT EXISTS (
    SELECT 1 FROM member 
    WHERE organizationId = (SELECT id FROM organization WHERE slug = 'default')
    AND userId = (SELECT id FROM user ORDER BY createdAt ASC LIMIT 1)
  );