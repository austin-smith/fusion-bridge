'use server';

import { db } from '@/data/db';
import { organizationSettings } from '@/data/db/schema';
import { eq, and } from 'drizzle-orm';
import type { 
  EventRetentionPolicy, 
  CleanupStats, 
  OrganizationEventSettings
} from '@/types/organization-settings';
import { DEFAULT_EVENT_RETENTION_POLICY } from '@/types/organization-settings';

// Type for the data stored in configJson for event retention
interface EventRetentionStoredConfig {
  policy: EventRetentionPolicy;
  stats: CleanupStats;
}

/**
 * Fetches the event retention settings for an organization.
 * @param organizationId - The organization ID
 * @returns The event retention settings or null if not found
 */
export async function getEventRetentionSettings(organizationId: string): Promise<OrganizationEventSettings | null> {
  try {
    const record = await db
      .select()
      .from(organizationSettings)
      .where(
        and(
          eq(organizationSettings.organizationId, organizationId),
          eq(organizationSettings.type, 'event_retention')
        )
      )
      .get();

    if (!record) {
      return null;
    }
    const storedConfig = record.configJson as EventRetentionStoredConfig;

    return {
      id: record.id,
      organizationId: record.organizationId,
      policy: storedConfig.policy,
      stats: storedConfig.stats,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  } catch (error) {
    console.error('Error fetching event retention settings:', error);
    return null;
  }
}

/**
 * Creates or updates event retention settings for an organization.
 * @param organizationId - The organization ID
 * @param policy - The retention policy to save
 * @param stats - Optional stats to update (if not provided, existing stats are preserved)
 * @returns The updated settings
 */
export async function saveEventRetentionSettings(
  organizationId: string,
  policy: EventRetentionPolicy,
  stats?: Partial<CleanupStats>
): Promise<OrganizationEventSettings> {
  try {
    // First, try to get existing settings to preserve stats if not provided
    const existingSettings = await getEventRetentionSettings(organizationId);
    
    const currentStats: CleanupStats = stats ? {
      lastCleanupAt: stats.lastCleanupAt ?? existingSettings?.stats.lastCleanupAt,
      totalEventsDeleted: stats.totalEventsDeleted ?? existingSettings?.stats.totalEventsDeleted ?? 0,
      nextScheduledCleanup: stats.nextScheduledCleanup ?? existingSettings?.stats.nextScheduledCleanup,
    } : existingSettings?.stats ?? {
      totalEventsDeleted: 0,
    };

    const configJson: EventRetentionStoredConfig = {
      policy,
      stats: currentStats,
    };

    const now = new Date();

    if (existingSettings) {
      // Update existing record
      await db
        .update(organizationSettings)
        .set({
          configJson,
          updatedAt: now,
        })
        .where(eq(organizationSettings.id, existingSettings.id));

      return {
        id: existingSettings.id,
        organizationId,
        policy,
        stats: currentStats,
        createdAt: existingSettings.createdAt,
        updatedAt: now,
      };
    } else {
      // Create new record
      const newRecord = await db
        .insert(organizationSettings)
        .values({
          organizationId,
          type: 'event_retention',
          configJson,
          isEnabled: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return {
        id: newRecord[0].id,
        organizationId,
        policy,
        stats: currentStats,
        createdAt: newRecord[0].createdAt,
        updatedAt: newRecord[0].updatedAt,
      };
    }
  } catch (error) {
    console.error('Error saving event retention settings:', error);
    throw new Error('Failed to save event retention settings');
  }
}

/**
 * Creates default event retention settings for a new organization.
 * @param organizationId - The organization ID
 * @returns The created default settings
 */
export async function createDefaultEventRetentionSettings(organizationId: string): Promise<OrganizationEventSettings> {
  const defaultStats: CleanupStats = {
    totalEventsDeleted: 0,
  };

  return saveEventRetentionSettings(organizationId, DEFAULT_EVENT_RETENTION_POLICY, defaultStats);
}

/**
 * Updates cleanup statistics for an organization's event retention settings.
 * @param organizationId - The organization ID
 * @param statsUpdate - The stats to update
 */
export async function updateEventRetentionStats(
  organizationId: string,
  statsUpdate: Partial<CleanupStats>
): Promise<void> {
  try {
    const existingSettings = await getEventRetentionSettings(organizationId);
    
    if (!existingSettings) {
      // Create default settings if none exist
      await createDefaultEventRetentionSettings(organizationId);
      await updateEventRetentionStats(organizationId, statsUpdate);
      return;
    }

    await saveEventRetentionSettings(organizationId, existingSettings.policy, statsUpdate);
  } catch (error) {
    console.error('Error updating event retention stats:', error);
    throw new Error('Failed to update event retention stats');
  }
}

/**
 * Gets or creates event retention settings for an organization.
 * If settings don't exist, creates them with default values.
 * @param organizationId - The organization ID
 * @returns The event retention settings
 */
export async function getOrCreateEventRetentionSettings(organizationId: string): Promise<OrganizationEventSettings> {
  const existingSettings = await getEventRetentionSettings(organizationId);
  
  if (existingSettings) {
    return existingSettings;
  }

  return createDefaultEventRetentionSettings(organizationId);
}