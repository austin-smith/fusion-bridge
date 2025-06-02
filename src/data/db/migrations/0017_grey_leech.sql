-- Schema Changes: Add organization_id column and index
ALTER TABLE `automations` ADD `organization_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `automations_organization_idx` ON `automations` (`organization_id`);--> statement-breakpoint
UPDATE automations 
SET organization_id = (
  SELECT l.organization_id 
  FROM locations l 
  WHERE l.id = automations.location_scope_id 
  AND l.organization_id IS NOT NULL
),
updated_at = unixepoch('now', 'subsec') * 1000
WHERE automations.location_scope_id IS NOT NULL 
AND automations.organization_id IS NULL
AND EXISTS (
  SELECT 1 FROM locations l 
  WHERE l.id = automations.location_scope_id 
  AND l.organization_id IS NOT NULL
);--> statement-breakpoint
UPDATE automations 
SET organization_id = (SELECT id FROM organization ORDER BY createdAt LIMIT 1),
updated_at = unixepoch('now', 'subsec') * 1000
WHERE automations.organization_id IS NULL;