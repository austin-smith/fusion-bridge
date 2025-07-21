import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';

import type { EnrichedEvent } from '@/types/events';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { EventCategory, EventSubtype, DisplayState } from '@/lib/mappings/definitions';
import { PikoConfig } from '@/services/drivers/piko';
import { shouldApiEventTriggerAlarmInZone } from '@/lib/alarm-event-evaluation';
import { DataExportService } from '@/lib/export/core-export-service';
import { eventsExportConfig } from '@/lib/export/configs/events-export-config';

// Define the enriched event structure (same as main events API)
interface OrgEnrichedEvent {
  id: number;
  eventUuid: string;
  deviceId: string;
  timestamp: Date;
  standardizedEventCategory: string;
  standardizedEventType: string;
  standardizedEventSubtype: string | null;
  standardizedPayload: unknown;
  rawPayload: unknown;
  rawEventType: string | null;
  connectorId: string;
  deviceInternalId: string | null;
  deviceName: string | null;
  rawDeviceType: string | null;
  connectorName: string | null;
  connectorCategory: string | null;
  connectorConfig: string | null;
  spaceId: string | null;
  spaceName: string | null;
  locationId: string | null;
  locationName: string | null;
  locationPath: string | null;
  // Alarm zone fields
  alarmZoneId: string | null;
  alarmZoneName: string | null;
  alarmZoneTriggerBehavior: string | null;
}

// Data fetcher function for events
const fetchEventsForExport = async (
  authContext: OrganizationAuthContext,
  filters: Record<string, any>
): Promise<EnrichedEvent[]> => {
  const orgDb = createOrgScopedDb(authContext.organizationId);

  // Parse event categories
  let eventCategories: string[] | undefined = undefined;
  if (filters.eventCategories) {
    const parsedCategories = filters.eventCategories.split(',').map((cat: string) => cat.trim()).filter((cat: string) => cat.length > 0);
    eventCategories = parsedCategories.length > 0 ? parsedCategories : undefined;
  }

  // Build the filters object for the org-scoped query
  const eventFilters = {
    eventCategories: eventCategories,
    connectorCategory: filters.connectorCategory || undefined,
    locationId: filters.locationId || undefined,
    spaceId: filters.spaceId || undefined,
    deviceNameFilter: filters.deviceNameFilter || undefined,
    eventTypeFilter: filters.eventTypeFilter || undefined,
    deviceTypeFilter: filters.deviceTypeFilter || undefined,
    connectorNameFilter: filters.connectorNameFilter || undefined,
    timeStart: filters.timeStart || undefined,
    timeEnd: filters.timeEnd || undefined
  };

  // Always export filtered data with reasonable limit
  const limit = 10000;

  try {
    // Use organization-scoped event query
    const recentEnrichedEvents: OrgEnrichedEvent[] = await orgDb.events.findRecent(limit, 0, eventFilters);

    // Apply alarm filtering if requested
    let filteredEvents = recentEnrichedEvents;
    if (filters.alarmEventsOnly === 'true') {
      console.log(`[EventsExport] Applying alarm-only filtering to ${recentEnrichedEvents.length} events`);
      const alarmFilterPromises = recentEnrichedEvents.map(async (event) => {
        // Only events from devices assigned to alarm zones can be alarm events
        if (!event.alarmZoneId || !event.alarmZoneTriggerBehavior) {
          return null; // Not an alarm event - device not in alarm zone
        }

        try {
          // Parse payload for alarm evaluation
          let payload: Record<string, any> | null = null;
          try {
            if (typeof event.standardizedPayload === 'string' && event.standardizedPayload) {
              payload = JSON.parse(event.standardizedPayload);
            } else {
              payload = event.standardizedPayload as Record<string, any> | null;
            }
          } catch (e) {
            console.warn(`Failed to parse payload for alarm evaluation on event ${event.eventUuid}:`, e);
          }

          // Use shared alarm evaluation logic
          const wouldTriggerAlarm = await shouldApiEventTriggerAlarmInZone(
            event.standardizedEventType,
            event.standardizedEventSubtype,
            payload,
            {
              id: event.alarmZoneId,
              triggerBehavior: event.alarmZoneTriggerBehavior as 'standard' | 'custom'
            },
            authContext.organizationId
          );

          return wouldTriggerAlarm ? event : null;
        } catch (error) {
          console.warn(`Error evaluating alarm status for event ${event.eventUuid}:`, error);
          return null; // Exclude on error for safety
        }
      });

      const alarmFilterResults = await Promise.all(alarmFilterPromises);
      filteredEvents = alarmFilterResults.filter((event): event is OrgEnrichedEvent => event !== null);
      console.log(`[EventsExport] Alarm filtering: ${recentEnrichedEvents.length} -> ${filteredEvents.length} events`);
    }

    // Transform to API format (reuse existing transformation logic)
    const apiEvents: EnrichedEvent[] = filteredEvents.map((event: OrgEnrichedEvent) => {
      let payload: Record<string, any> | null = null;
      let rawPayload: Record<string, any> | null = null;
      let displayState: DisplayState | undefined = undefined;
      let bestShotUrlComponents: EnrichedEvent['bestShotUrlComponents'] | undefined = undefined;
      const connectorCategory = event.connectorCategory ?? 'unknown';

      // Try to parse standardized payload
      try {
        if (typeof event.standardizedPayload === 'string' && event.standardizedPayload) {
             payload = JSON.parse(event.standardizedPayload);
        } else {
             payload = event.standardizedPayload as Record<string, any> | null;
        }
      } catch (e) {
        console.warn(`Failed to parse standardized payload for event ${event.eventUuid}:`, e);
      }

      // Try to parse raw payload
      try {
        if (typeof event.rawPayload === 'string' && event.rawPayload) {
             rawPayload = JSON.parse(event.rawPayload);
        } else {
             rawPayload = event.rawPayload as Record<string, any> | null;
        }
      } catch (e) {
        console.warn(`Failed to parse raw payload for event ${event.eventUuid}:`, e);
      }

      // Derive deviceTypeInfo using the joined rawDeviceType
      const deviceTypeInfo = getDeviceTypeInfo(connectorCategory, event.rawDeviceType ?? 'Unknown');

      // Derive displayState from parsed payload
      displayState = payload?.displayState as DisplayState | undefined;
      
      // Handle Piko bestShotUrlComponents
      if (
        connectorCategory === 'piko' &&
        event.standardizedEventCategory === EventCategory.ANALYTICS &&
        payload?.objectTrackId && 
        typeof payload.objectTrackId === 'string' &&
        event.deviceId
      ) {
        if (event.connectorConfig) {
            try {
                const config = JSON.parse(event.connectorConfig) as PikoConfig;
                
                if (config.type === 'cloud' && config.selectedSystem) {
                    bestShotUrlComponents = {
                        type: 'cloud',
                        pikoSystemId: config.selectedSystem,
                        objectTrackId: payload.objectTrackId,
                        cameraId: event.deviceId,
                        connectorId: event.connectorId
                    };
                } else if (config.type === 'local') {
                    bestShotUrlComponents = {
                        type: 'local',
                        objectTrackId: payload.objectTrackId,
                        cameraId: event.deviceId,
                        connectorId: event.connectorId
                    };
                }
            } catch (e) {
                console.warn(`Failed to parse Piko config for connector ${event.connectorId} on event ${event.eventUuid}:`, e);
            }
        }
      }

      return {
        id: event.id,
        eventUuid: event.eventUuid,
        deviceId: event.deviceId,
        deviceInternalId: event.deviceInternalId ?? undefined,
        deviceName: event.deviceName ?? undefined,
        connectorId: event.connectorId,
        connectorName: event.connectorName ?? undefined,
        connectorCategory: connectorCategory,
        timestamp: event.timestamp.getTime(),
        eventCategory: event.standardizedEventCategory,
        eventType: event.standardizedEventType,
        eventSubtype: event.standardizedEventSubtype as EventSubtype ?? undefined,
        payload: payload,
        deviceTypeInfo: deviceTypeInfo,
        displayState: displayState,
        rawPayload: rawPayload,
        rawEventType: event.rawEventType ?? undefined,
        bestShotUrlComponents: bestShotUrlComponents,
        spaceId: event.spaceId ?? undefined,
        spaceName: event.spaceName ?? undefined,
        locationId: event.locationId ?? undefined,
        locationName: event.locationName ?? undefined,
      };
    });

    console.log(`[EventsExport] Fetched ${apiEvents.length} events for export`);
    return apiEvents;

  } catch (error) {
    console.error('[EventsExport] Error fetching events:', error);
    throw new Error('Failed to fetch events for export');
  }
};

// GET handler for events export
export const GET = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Parse export parameters
    const format = searchParams.get('format') as 'csv' | 'xlsx' | 'json' || 'csv';
    const includeMetadata = searchParams.get('includeMetadata') === 'true';

    // Build filters from search parameters
    const filters: Record<string, any> = {};
    searchParams.forEach((value, key) => {
      if (!['format', 'includeMetadata'].includes(key)) {
        filters[key] = value;
      }
    });

    // Fetch data
    const data = await fetchEventsForExport(authContext, filters);
    
    // Export using consolidated export system
    const exportService = new DataExportService(eventsExportConfig);
    const allColumns = eventsExportConfig.availableColumns.map(col => col.key);
    const result = await exportService.exportForAPI(
      data, 
      { format, columns: allColumns, includeMetadata },
      'events'
    );

    const headers = {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': result.data.length.toString(),
    };

    return new Response(result.data, { headers });

  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { success: false, error: 'Export failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}); 