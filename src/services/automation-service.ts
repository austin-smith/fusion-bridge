import 'server-only';

import { db } from '@/data/db';
import { automations, connectors } from '@/data/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import type { EventWithContext } from '@/lib/automation-types';
import { OrganizationAutomationContext } from '@/services/automation-execution-context';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';

/**
 * Organization-scoped event processing
 * Processes an event with device context using the organization-scoped automation context.
 * @param eventWithContext The EventWithContext object containing event and device context.
 */
export async function processEvent(eventWithContext: EventWithContext): Promise<void> {
    const { event: stdEvent, deviceContext } = eventWithContext;
    console.log(`[Automation Service] ENTERED processEvent for event: ${stdEvent.eventId}`);
    console.log(`[Automation Service] Processing event: ${stdEvent.type} (${stdEvent.category}) for device ${stdEvent.deviceId} from connector ${stdEvent.connectorId}`);

    try {
        // Get the organization ID from the event's connector
        const connectorRecord = await db.query.connectors.findFirst({
            where: eq(connectors.id, stdEvent.connectorId),
            columns: { organizationId: true }
        });

        if (!connectorRecord || !connectorRecord.organizationId) {
            console.warn(`[Automation Service] Cannot process event ${stdEvent.eventId}: connector ${stdEvent.connectorId} not found or has no organization`);
            return;
        }

        const organizationId = connectorRecord.organizationId;
        console.log(`[Automation Service] Processing event ${stdEvent.eventId} within organization ${organizationId}`);

        // Use organization-scoped automation context with device context
        const orgDb = createOrgScopedDb(organizationId);
        const automationContext = new OrganizationAutomationContext(organizationId, orgDb);
        await automationContext.processEvent(stdEvent, deviceContext);

    } catch (error) {
        console.error('[Automation Service] Top-level error processing event:', error);
    }
}

/**
 * Organization-scoped scheduled automation processing
 * Processes scheduled automations for all organizations.
 * @param currentTime The current time to check schedules against.
 */
export async function processScheduledAutomations(currentTime: Date): Promise<void> {
    console.log(`[Automation Service] Processing scheduled automations at ${currentTime.toISOString()} (UTC)`);

    try {
        // Get all organizations that have automations
        const organizationsWithAutomations = await db
            .selectDistinct({ organizationId: automations.organizationId })
            .from(automations)
            .where(and(
                eq(automations.enabled, true),
                isNotNull(automations.organizationId)
            ));

        if (organizationsWithAutomations.length === 0) {
            console.log(`[Automation Service] No organizations with enabled automations found.`);
            return;
        }

        console.log(`[Automation Service] Processing scheduled automations for ${organizationsWithAutomations.length} organization(s)`);

        // Process scheduled automations for each organization in parallel
        const results = await Promise.allSettled(
            organizationsWithAutomations.map(async ({ organizationId }) => {
                if (!organizationId) return;
                
                try {
                    console.log(`[Automation Service] Processing organization ${organizationId} at ${currentTime.toISOString()}`);
                    const orgDb = createOrgScopedDb(organizationId);
                    const automationContext = new OrganizationAutomationContext(organizationId, orgDb);
                    await automationContext.processScheduledAutomations(currentTime);
                    console.log(`[Automation Service] Completed processing organization ${organizationId}`);
                } catch (orgError) {
                    console.error(`[Automation Service] Error processing scheduled automations for organization ${organizationId}:`, orgError);
                }
            })
        );

        // Log results summary
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        
        if (failed > 0) {
            console.warn(`[Automation Service] Completed processing: ${successful} successful, ${failed} failed`);
        } else {
            console.log(`[Automation Service] Successfully processed all ${successful} organizations`);
        }

    } catch (error) {
        console.error(`[Automation Service] Top-level error processing scheduled automations:`, error);
    }
}


