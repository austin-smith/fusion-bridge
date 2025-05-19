import { db } from '@/data/db';
import { automations } from '@/data/db/schema';
import { AutomationConfigSchema, type AutomationConfig, JsonRuleGroupSchema } from '@/lib/automation-schemas';
import { AutomationTriggerType } from '@/lib/automation-types';
import { eq } from 'drizzle-orm';

// Helper to add internal IDs if they are missing, similar to AutomationForm
// This might be needed if old conditions don't have _internalId
const addInternalIdsToNode = (node: any): any => {
    if (!node) return node;
    if (typeof node === 'object' && node !== null) {
        if (!('_internalId' in node)) {
            node._internalId = crypto.randomUUID();
        }
        if (node.all || node.any) {
            const groupType = node.all ? 'all' : 'any';
            const children = node[groupType] || [];
            node[groupType] = children.map(addInternalIdsToNode);
        }
    }
    return node;
};

async function migrateAutomations() {
  console.log('Starting automation config migration...');

  try {
    const allRules = await db.select().from(automations);
    console.log(`Found ${allRules.length} automation rules to check.`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const rule of allRules) {
      console.log(`\nProcessing rule ID: ${rule.id}, Name: ${rule.name}`);
      const currentConfig = rule.configJson as any; // Type as any to inspect old structure

      if (!currentConfig) {
        console.warn(`Rule ID ${rule.id} has null or undefined configJson. Skipping.`);
        errorCount++;
        continue;
      }

      // Check if it's already in the new format (has a trigger object)
      if (typeof currentConfig.trigger === 'object' && currentConfig.trigger !== null && currentConfig.trigger.type) {
        // Attempt to parse with new schema to ensure it's fully compliant
        const validation = AutomationConfigSchema.safeParse(currentConfig);
        if (validation.success) {
          console.log(`Rule ID ${rule.id} is already in the new format and valid. Skipping.`);
          skippedCount++;
          continue;
        } else {
          console.warn(`Rule ID ${rule.id} appears to be in new format but failed validation. Error: ${JSON.stringify(validation.error.flatten())}. Manual review needed.`);
          // If it has a trigger but is invalid, we might not want to auto-migrate it without more specific logic
          // For now, we will count it as an error and skip forceful migration.
          errorCount++;
          continue;
        }
      }

      // Check for old format (has top-level conditions but no trigger)
      if (typeof currentConfig.conditions === 'object' && currentConfig.conditions !== null && (!currentConfig.trigger)) {
        console.log(`Rule ID ${rule.id} appears to be in the old format. Attempting migration.`);

        // Add internal IDs to the old conditions to ensure they are compatible with new expectations
        const conditionsWithIds = addInternalIdsToNode(JSON.parse(JSON.stringify(currentConfig.conditions))); // Deep clone before modifying

        const newConfig: Partial<AutomationConfig> = {
          trigger: {
            type: AutomationTriggerType.EVENT, // Default assumption for old rules
            conditions: conditionsWithIds,
          },
          actions: currentConfig.actions || [],
          temporalConditions: currentConfig.temporalConditions || [],
        };

        // Validate the newly constructed config
        const validation = AutomationConfigSchema.safeParse(newConfig);

        if (validation.success) {
          try {
            await db.update(automations)
              .set({ configJson: validation.data as any })
              .where(eq(automations.id, rule.id));
            console.log(`Rule ID ${rule.id} successfully migrated and updated.`);
            migratedCount++;
          } catch (dbError) {
            console.error(`Rule ID ${rule.id} failed to update in DB after migration. Error:`, dbError);
            errorCount++;
          }
        } else {
          console.error(`Rule ID ${rule.id} failed validation after attempting migration. Error: ${JSON.stringify(validation.error.flatten())}`);
          console.log('Problematic old config:', JSON.stringify(currentConfig, null, 2));
          console.log('Attempted new config:', JSON.stringify(newConfig, null, 2));
          errorCount++;
        }
      } else if (currentConfig.trigger && typeof currentConfig.trigger !== 'object'){
        console.warn(`Rule ID ${rule.id} has a 'trigger' field that is not an object. Config: ${JSON.stringify(currentConfig.trigger)}. Skipping.`);
        errorCount++;
      } else {
        console.warn(`Rule ID ${rule.id} does not seem to match old or new format, or config is invalid. Config: ${JSON.stringify(currentConfig)}. Skipping.`);
        // This case handles configs that don't have .conditions (old) and don't have .trigger (new)
        // or where .conditions is not an object.
        errorCount++;
      }
    }

    console.log('\nMigration summary:');
    console.log(`Successfully migrated: ${migratedCount}`);
    console.log(`Skipped (already new format or other): ${skippedCount}`);
    console.log(`Errors (failed validation or DB update): ${errorCount}`);

  } catch (error) {
    console.error('An unexpected error occurred during the migration process:', error);
  }
}

migrateAutomations()
  .then(() => {
    console.log('\nMigration script finished.');
    process.exit(0);
  })
  .catch((error: any) => {
    console.error('Migration script failed with unhandled error:', error);
    process.exit(1);
  }); 