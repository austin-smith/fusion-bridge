import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { automations } from '@/data/db/schema';
import { AutomationConfigSchema, type AutomationConfig } from '@/lib/automation-schemas';
import { AutomationTriggerType } from '@/lib/automation-types';
import { eq } from 'drizzle-orm';

// Helper to add internal IDs (copied from the migration script)
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

export async function POST(request: Request) {
    // !!! IMPORTANT: Secure this endpoint! !!!
    const secret = request.headers.get('X-Migration-Secret');
    if (!process.env.MIGRATION_SECRET || secret !== process.env.MIGRATION_SECRET) {
        console.warn('Unauthorized attempt to access migration endpoint.');
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Starting automation config migration via API endpoint...');

    try {
        const allRules = await db.select().from(automations);
        let migratedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        const errors: Array<{ ruleId: string, error: any, oldConfig?: any, attemptedConfig?: any }> = [];

        for (const rule of allRules) {
            const currentConfig = rule.configJson as any;

            if (!currentConfig) {
                console.warn(`Rule ID ${rule.id} has null or undefined configJson. Skipping.`);
                errors.push({ ruleId: rule.id, error: 'Null or undefined configJson' });
                errorCount++;
                continue;
            }

            if (typeof currentConfig.trigger === 'object' && currentConfig.trigger !== null && currentConfig.trigger.type) {
                const validation = AutomationConfigSchema.safeParse(currentConfig);
                if (validation.success) {
                    skippedCount++;
                    continue;
                } else {
                    console.warn(`Rule ID ${rule.id} appears new but invalid: ${JSON.stringify(validation.error.flatten())}`);
                    errors.push({ ruleId: rule.id, error: validation.error.flatten(), oldConfig: currentConfig });
                    errorCount++;
                    continue;
                }
            }

            if (typeof currentConfig.conditions === 'object' && currentConfig.conditions !== null && (!currentConfig.trigger)) {
                const conditionsWithIds = addInternalIdsToNode(JSON.parse(JSON.stringify(currentConfig.conditions)));
                const newConfigData: Partial<AutomationConfig> = {
                    trigger: {
                        type: AutomationTriggerType.EVENT,
                        conditions: conditionsWithIds,
                    },
                    actions: currentConfig.actions || [],
                    temporalConditions: currentConfig.temporalConditions || [],
                };

                const validation = AutomationConfigSchema.safeParse(newConfigData);
                if (validation.success) {
                    try {
                        await db.update(automations)
                            .set({ configJson: validation.data as any })
                            .where(eq(automations.id, rule.id));
                        migratedCount++;
                    } catch (dbError) {
                        console.error(`Rule ID ${rule.id} DB update failed:`, dbError);
                        errors.push({ ruleId: rule.id, error: dbError, attemptedConfig: newConfigData });
                        errorCount++;
                    }
                } else {
                    console.error(`Rule ID ${rule.id} validation failed: ${JSON.stringify(validation.error.flatten())}`);
                    errors.push({ 
                        ruleId: rule.id, 
                        error: validation.error.flatten(), 
                        oldConfig: currentConfig, 
                        attemptedConfig: newConfigData 
                    });
                    errorCount++;
                }
            } else if (currentConfig.trigger && typeof currentConfig.trigger !== 'object'){
                 console.warn(`Rule ID ${rule.id} has trigger but not an object: ${JSON.stringify(currentConfig.trigger)}`);
                 errors.push({ ruleId: rule.id, error: 'Trigger is not an object', oldConfig: currentConfig });
                 errorCount++;
            } else {
                console.warn(`Rule ID ${rule.id} does not match known formats: ${JSON.stringify(currentConfig)}`);
                errors.push({ ruleId: rule.id, error: 'Unknown format', oldConfig: currentConfig });
                errorCount++;
            }
        }

        const summary = {
            message: 'Automation config migration process completed.',
            migrated: migratedCount,
            skipped: skippedCount,
            errors: errorCount,
            errorDetails: errors.length > 0 ? errors : undefined,
        };
        console.log('Migration via API summary:', summary);
        return NextResponse.json({ success: errorCount === 0, ...summary });

    } catch (error) {
        console.error('Unexpected error during API migration process:', error);
        return NextResponse.json({ success: false, error: (error instanceof Error ? error.message : 'Unknown critical error') }, { status: 500 });
    }
} 