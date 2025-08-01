'use server';

import { db } from '@/data/db';
import { events, connectors, organization } from '@/data/db/schema';
import { eq, and, lt, inArray, desc, sql, count } from 'drizzle-orm';
import { 
  getOrCreateEventRetentionSettings, 
  updateEventRetentionStats 
} from '@/data/repositories/organization-settings';
import type { EventRetentionPolicy } from '@/types/organization-settings';
import { RetentionStrategy } from '@/types/organization-settings';

/**
 * Batch size for database operations
 */
const BATCH_SIZE = 1000;

/**
 * Statistics returned by event cleanup operations
 */
export interface EventCleanupStats {
  organizationId: string;
  eventsBefore: number;
  eventsDeleted: number;
  eventsAfter: number;
  executionTimeMs: number;
  policy: EventRetentionPolicy;
}

/**
 * Result of processing all organizations
 */
export interface CleanupSummary {
  totalOrganizations: number;
  organizationsProcessed: number;
  organizationsFailed: number;
  totalEventsDeleted: number;
  totalExecutionTimeMs: number;
  organizationResults: EventCleanupStats[];
}

/**
 * Counts total events for an organization
 */
export async function countOrganizationEvents(organizationId: string): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(events)
    .innerJoin(connectors, eq(events.connectorId, connectors.id))
    .where(eq(connectors.organizationId, organizationId));
  
  return result[0]?.count ?? 0;
}

/**
 * Gets connector IDs for an organization
 */
async function getOrganizationConnectorIds(organizationId: string): Promise<string[]> {
  const orgConnectors = await db
    .select({ id: connectors.id })
    .from(connectors)
    .where(eq(connectors.organizationId, organizationId));
  
  return orgConnectors.map(c => c.id);
}

/**
 * Cleans up events for a single organization based on its retention policy
 */
export async function cleanupOrganizationEvents(organizationId: string): Promise<EventCleanupStats> {
  const startTime = Date.now();
  
  // Get or create retention settings
  const settings = await getOrCreateEventRetentionSettings(organizationId);
  const policy = settings.policy;
  
  // Count events before cleanup
  const eventsBefore = await countOrganizationEvents(organizationId);
  
  // Get connector IDs for this organization
  const connectorIds = await getOrganizationConnectorIds(organizationId);
  
  if (connectorIds.length === 0) {
    // No connectors = no events to clean
    return {
      organizationId,
      eventsBefore: 0,
      eventsDeleted: 0,
      eventsAfter: 0,
      executionTimeMs: Date.now() - startTime,
      policy
    };
  }
  
  let totalDeleted = 0;
  
  // Apply time-based cleanup (if applicable)
  if (policy.strategy === RetentionStrategy.TIME || policy.strategy === RetentionStrategy.HYBRID) {
    if (policy.maxAgeInDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.maxAgeInDays);
      const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);
      
      // Delete events older than cutoff date for this organization
      const deleteResult = await db
        .delete(events)
        .where(
          and(
            inArray(events.connectorId, connectorIds),
            sql`${events.timestamp} < ${cutoffTimestamp}`
          )
        );
      
      const deletedByTime = deleteResult.rowsAffected ?? 0;
      totalDeleted += deletedByTime;
    }
  }
  
  // Apply count-based cleanup (if applicable)
  if (policy.strategy === RetentionStrategy.COUNT || policy.strategy === RetentionStrategy.HYBRID) {
    if (policy.maxEvents) {
      // Count current events after time-based cleanup
      const currentCount = await countOrganizationEvents(organizationId);
      
      if (currentCount > policy.maxEvents) {
        const excessCount = currentCount - policy.maxEvents;
        
        // Get oldest events to delete (keeping most recent maxEvents)
        const oldestEvents = await db
          .select({ id: events.id })
          .from(events)
          .innerJoin(connectors, eq(events.connectorId, connectors.id))
          .where(eq(connectors.organizationId, organizationId))
          .orderBy(events.timestamp) // Oldest first
          .limit(excessCount);
        
        if (oldestEvents.length > 0) {
          const eventIdsToDelete = oldestEvents.map(e => e.id);
          
          // Delete in batches to avoid memory issues
          let deletedByCount = 0;
          
          for (let i = 0; i < eventIdsToDelete.length; i += BATCH_SIZE) {
            const batch = eventIdsToDelete.slice(i, i + BATCH_SIZE);
            const batchResult = await db
              .delete(events)
              .where(inArray(events.id, batch));
            
            deletedByCount += batchResult.rowsAffected ?? 0;
          }
          
          totalDeleted += deletedByCount;
        }
      }
    }
  }
  
  // Count events after cleanup
  const eventsAfter = await countOrganizationEvents(organizationId);
  
  // Update organization stats
  await updateEventRetentionStats(organizationId, {
    lastCleanupAt: new Date(),
    totalEventsDeleted: settings.stats.totalEventsDeleted + totalDeleted,
    nextScheduledCleanup: (() => {
      const nextCleanup = new Date();
      nextCleanup.setDate(nextCleanup.getDate() + 1);
      nextCleanup.setHours(10, 0, 0, 0);
      return nextCleanup;
    })()
  });
  
  return {
    organizationId,
    eventsBefore,
    eventsDeleted: totalDeleted,
    eventsAfter,
    executionTimeMs: Date.now() - startTime,
    policy
  };
}

/**
 * Runs event cleanup for all organizations
 */
export async function cleanupAllOrganizationsEvents(): Promise<CleanupSummary> {
  const logPrefix = '[Event Cleanup]';
  const startTime = Date.now();
  
  console.log(`${logPrefix} Starting event cleanup for all organizations`);
  
  // Get all organizations
  const organizations = await db.select({
    id: organization.id
  }).from(organization);
  
  console.log(`${logPrefix} Found ${organizations.length} organizations to process`);
  
  const results: EventCleanupStats[] = [];
  let successCount = 0;
  let errorCount = 0;
  let totalEventsDeleted = 0;
  
  // Process each organization
  for (const org of organizations) {
    try {
      console.log(`${logPrefix} Processing organization: ${org.id}`);
      
      const orgResult = await cleanupOrganizationEvents(org.id);
      results.push(orgResult);
      successCount++;
      totalEventsDeleted += orgResult.eventsDeleted;
      
      console.log(`${logPrefix} Completed ${org.id}: ${orgResult.eventsDeleted} events deleted (${orgResult.executionTimeMs}ms)`);
      
    } catch (error) {
      console.error(`${logPrefix} Failed to cleanup organization ${org.id}:`, error);
      errorCount++;
    }
  }
  
  const totalExecutionTime = Date.now() - startTime;
  
  console.log(`${logPrefix} Cleanup completed: ${successCount} successful, ${errorCount} failed, ${totalEventsDeleted} total events deleted (${totalExecutionTime}ms)`);
  
  return {
    totalOrganizations: organizations.length,
    organizationsProcessed: successCount,
    organizationsFailed: errorCount,
    totalEventsDeleted,
    totalExecutionTimeMs: totalExecutionTime,
    organizationResults: results
  };
}

/**
 * Previews what would be deleted for an organization without actually deleting
 */
export async function previewOrganizationCleanup(organizationId: string): Promise<{
  policy: EventRetentionPolicy;
  currentEventCount: number;
  estimatedDeletions: {
    byTime?: number;
    byCount?: number;
    total: number;
  };
}> {
  const settings = await getOrCreateEventRetentionSettings(organizationId);
  const policy = settings.policy;
  
  const currentEventCount = await countOrganizationEvents(organizationId);
  const connectorIds = await getOrganizationConnectorIds(organizationId);
  
  if (connectorIds.length === 0) {
    return {
      policy,
      currentEventCount: 0,
      estimatedDeletions: { total: 0 }
    };
  }
  
  let estimatedByTime = 0;
  let estimatedByCount = 0;
  
  // Estimate time-based deletions
  if (policy.strategy === RetentionStrategy.TIME || policy.strategy === RetentionStrategy.HYBRID) {
    if (policy.maxAgeInDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.maxAgeInDays);
      const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);
      
      const timeBasedCount = await db
        .select({ count: count() })
        .from(events)
        .where(
          and(
            inArray(events.connectorId, connectorIds),
            sql`${events.timestamp} < ${cutoffTimestamp}`
          )
        );
      
      estimatedByTime = timeBasedCount[0]?.count ?? 0;
    }
  }
  
  // Estimate count-based deletions
  if (policy.strategy === RetentionStrategy.COUNT || policy.strategy === RetentionStrategy.HYBRID) {
    if (policy.maxEvents) {
      const remainingAfterTime = currentEventCount - estimatedByTime;
      if (remainingAfterTime > policy.maxEvents) {
        estimatedByCount = remainingAfterTime - policy.maxEvents;
      }
    }
  }
  
  const total = estimatedByTime + estimatedByCount;
  
  return {
    policy,
    currentEventCount,
    estimatedDeletions: {
      byTime: estimatedByTime > 0 ? estimatedByTime : undefined,
      byCount: estimatedByCount > 0 ? estimatedByCount : undefined,
      total
    }
  };
}