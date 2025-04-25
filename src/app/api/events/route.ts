import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { connectors, devices } from '@/data/db/schema';
import { eq, sql, and } from 'drizzle-orm';
import * as eventsRepository from '@/data/repositories/events';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { TypedDeviceInfo, DisplayState, DeviceType, EventCategory } from '@/lib/mappings/definitions';
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
  payload: Record<string, any> | null;
  rawPayload: Record<string, any> | null;
  deviceTypeInfo: TypedDeviceInfo;
  displayState?: DisplayState;
  rawEventType?: string; // Add optional rawEventType
  bestShotUrlComponents?: {
    pikoSystemId: string;
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
      
      // NEW: Check if this is a Piko analytics event with an objectTrackId
      if (
        connectorCategory === 'piko' &&
        event.standardizedEventCategory === EventCategory.ANALYTICS && // Check category
        payload?.objectTrackId && 
        typeof payload.objectTrackId === 'string' &&
        event.deviceId // Ensure we have the camera/device ID
      ) {
        // --- START: Parse Piko Config to get actual System ID ---
        let actualPikoSystemId: string | undefined = undefined;
        
        if (event.connectorConfig) {
            try {
                const config = JSON.parse(event.connectorConfig) as PikoConfig;
                if (config.type === 'cloud' && config.selectedSystem) {
                    actualPikoSystemId = config.selectedSystem;
                } else {
                  console.warn(`Piko event ${event.eventUuid} has invalid or incomplete config in connector ${event.connectorId}`);
                }
            } catch (e) {
                console.warn(`Failed to parse Piko config for connector ${event.connectorId} on event ${event.eventUuid}:`, e);
            }
        }
        // --- END: Parse Piko Config ---

        // Only create components if we successfully got the actual Piko System ID
        if (actualPikoSystemId) {
             bestShotUrlComponents = {
                pikoSystemId: actualPikoSystemId, // USE ACTUAL PIKO SYSTEM ID
                objectTrackId: payload.objectTrackId,
                cameraId: event.deviceId, // The event's deviceId is the camera GUID
                connectorId: event.connectorId // Pass our internal connector ID too (using correct name)
             };
        } else {
             console.warn(`Could not determine actual Piko System ID for event ${event.eventUuid}, cannot create bestShotUrlComponents.`);
        }
      }

      // Assemble the final API event object
      const finalEventObject: ApiEnrichedEvent = {
        id: event.id,
        eventUuid: event.eventUuid,
        deviceId: event.deviceId,
        deviceName: event.deviceName ?? undefined, // Use joined name, convert null to undefined
        connectorId: event.connectorId,
        connectorName: event.connectorName ?? undefined, // Use joined name
        connectorCategory: connectorCategory,
        timestamp: event.timestamp.getTime(), // Convert Date to epoch ms
        eventCategory: event.standardizedEventCategory,
        eventType: event.standardizedEventType,
        payload: payload,
        deviceTypeInfo: deviceTypeInfo,
        displayState: displayState,
        rawPayload: rawPayload,
        rawEventType: event.rawEventType ?? undefined, // Include rawEventType
        bestShotUrlComponents: bestShotUrlComponents,
      }; // Removed 'satisfies ApiEnrichedEvent' here to simplify debugging if needed

      return finalEventObject; // Return the constructed object
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