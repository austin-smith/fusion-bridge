import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { connectors, devices } from '@/data/db/schema';
import { eq, sql, and } from 'drizzle-orm';
import * as eventsRepository from '@/data/repositories/events';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { TypedDeviceInfo, DisplayState, DeviceType, EventCategory, EventSubtype } from '@/lib/mappings/definitions';
import { intermediateStateToDisplayString } from '@/lib/mappings/presentation';
import { PikoConfig } from '@/services/drivers/piko';

// Define the enriched event structure returned by getRecentEvents
interface RepoEnrichedEvent {
  id: number;
  eventUuid: string;
  deviceId: string;
  timestamp: Date;
  standardizedEventCategory: string;
  standardizedEventType: string;
  standardizedEventSubtype: string | null;
  standardizedPayload: unknown; // Keep as unknown for parsing
  rawPayload: unknown;
  rawEventType: string | null; // Added from repo
  connectorId: string;
  deviceName: string | null; // Field from JOIN
  rawDeviceType: string | null; // Field from JOIN
  connectorName: string | null; // Field from JOIN
  connectorCategory: string | null; // Field from JOIN
  connectorConfig: string | null;
}

// Interface for the final enriched event data returned by the API
interface ApiEnrichedEvent {
  id: number;
  eventUuid: string;
  deviceId: string;
  deviceName?: string;
  connectorId: string;
  connectorName?: string;
  connectorCategory: string;
  timestamp: number; // Epoch ms
  eventCategory: string;
  eventType: string;
  eventSubtype?: EventSubtype;
  payload: Record<string, any> | null;
  rawPayload: Record<string, any> | null;
  deviceTypeInfo: TypedDeviceInfo;
  displayState?: DisplayState;
  rawEventType?: string; // Add optional rawEventType
  bestShotUrlComponents?: {
    type: 'cloud' | 'local';
    pikoSystemId?: string; // Optional: Only present for cloud
    connectorId: string;
    objectTrackId: string;
    cameraId: string;
  };
}

// GET handler to fetch events
export async function GET() {
  try {
    // Fetch enriched events directly from the repository
    const recentEnrichedEvents: RepoEnrichedEvent[] = await eventsRepository.getRecentEvents(200);

    // Map the repository results to the API response structure
    const apiEvents = recentEnrichedEvents.map((event: RepoEnrichedEvent): ApiEnrichedEvent => {
      let payload: Record<string, any> | null = null;
      let rawPayload: Record<string, any> | null = null;
      let displayState: DisplayState | undefined = undefined;
      let bestShotUrlComponents: ApiEnrichedEvent['bestShotUrlComponents'] | undefined = undefined;
      const connectorCategory = event.connectorCategory ?? 'unknown'; // Default if null from JOIN

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
      displayState = payload?.displayState;
      
      // MODIFIED: Handle both Cloud and Local Piko for bestShotUrlComponents
      if (
        connectorCategory === 'piko' &&
        event.standardizedEventCategory === EventCategory.ANALYTICS && // Check category
        payload?.objectTrackId && 
        typeof payload.objectTrackId === 'string' &&
        event.deviceId // Ensure we have the camera/device ID
      ) {
        if (event.connectorConfig) {
            try {
                const config = JSON.parse(event.connectorConfig) as PikoConfig;
                
                if (config.type === 'cloud' && config.selectedSystem) {
                    bestShotUrlComponents = {
                        type: 'cloud',
                        pikoSystemId: config.selectedSystem, // Include for cloud
                        objectTrackId: payload.objectTrackId,
                        cameraId: event.deviceId, // The event's deviceId is the camera GUID
                        connectorId: event.connectorId // Pass our internal connector ID
                    };
                } else if (config.type === 'local') {
                    bestShotUrlComponents = {
                        type: 'local',
                        // pikoSystemId is omitted for local
                        objectTrackId: payload.objectTrackId,
                        cameraId: event.deviceId,
                        connectorId: event.connectorId
                    };
                } else {
                  console.warn(`Piko event ${event.eventUuid} has invalid or incomplete config type/details in connector ${event.connectorId}. Cannot create bestShotUrlComponents.`);
                }
            } catch (e) {
                console.warn(`Failed to parse Piko config for connector ${event.connectorId} on event ${event.eventUuid}:`, e);
            }
        } else {
            console.warn(`Missing connector config for Piko event ${event.eventUuid} from connector ${event.connectorId}. Cannot create bestShotUrlComponents.`);
        }
      }

      // Assemble the final API event object
      const finalEventObject: ApiEnrichedEvent = {
        id: event.id,
        eventUuid: event.eventUuid,
        deviceId: event.deviceId,
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
      };

      return finalEventObject;
    });

    return NextResponse.json({ success: true, data: apiEvents });

  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}

// POST handler to initialize the MQTT service
export async function POST() {
  try {
    // MQTT connections are now managed via server-side instrumentation
    // We no longer need to explicitly initialize connections from this API endpoint
    // Just return success so the client can proceed with fetching events

    return NextResponse.json({
      success: true,
      message: 'Events system ready'
    });
  } catch (error) {
    console.error('Error initializing MQTT service:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to prepare events system' },
      { status: 500 }
    );
  }
} 