ALTER TABLE `connectors` ADD `organization_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `connectors_organization_idx` ON `connectors` (`organization_id`);--> statement-breakpoint

-- Assign existing connectors to the default organization
UPDATE connectors 
SET organization_id = (SELECT id FROM organization WHERE slug = 'default'), 
    updated_at = datetime('now')
WHERE organization_id IS NULL 
  AND EXISTS (SELECT 1 FROM organization WHERE slug = 'default');