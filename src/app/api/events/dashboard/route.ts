import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { events, devices, connectors, areaDevices, areas, locations } from '@/data/db/schema';
import { desc, eq, and, isNull } from 'drizzle-orm';
import type { StandardizedEvent } from '@/types/events';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { EventCategory, EventType, EventSubtype } from '@/lib/mappings/definitions';
import { withApiRouteAuth } from '@/lib/auth/withApiRouteAuth';

const DEFAULT_LIMIT = 100; // Default number of events to fetch

// Define the structure of the enriched event for the dashboard
export interface DashboardEvent extends StandardizedEvent {
    deviceName?: string | null;
    deviceRawType?: string | null;
    connectorName?: string | null;
    connectorCategory?: string | null;
    areaId?: string | null;
    areaName?: string | null;
    locationId?: string | null;
    locationName?: string | null;
    locationPath?: string | null;
}

async function getRecentEventsForDashboard(limit: number = DEFAULT_LIMIT): Promise<DashboardEvent[]> {
    try {
        // Select required fields from events and joined tables
        const results = await db
            .select({
                // Event fields
                eventUuid: events.eventUuid,
                connectorId: events.connectorId,
                deviceId: events.deviceId, // This is the *external* device ID
                timestamp: events.timestamp,
                standardizedEventCategory: events.standardizedEventCategory,
                standardizedEventType: events.standardizedEventType,
                standardizedEventSubtype: events.standardizedEventSubtype,
                standardizedPayload: events.standardizedPayload,
                rawPayload: events.rawPayload,
                // Joined Device fields (nullable)
                internalDeviceId: devices.id, // Our internal UUID for joining
                deviceName: devices.name,
                rawDeviceType: devices.type,
                // Joined Connector fields (nullable)
                connectorName: connectors.name,
                connectorCategory: connectors.category,
                // Joined AreaDevice -> Area fields (nullable)
                areaId: areaDevices.areaId,
                areaName: areas.name,
                // Joined Area -> Location fields (nullable)
                locationId: areas.locationId,
                locationName: locations.name,
                locationPath: locations.path,
            })
            .from(events)
            // --- Joins ---
            // Event -> Connector (Always exists)
            .innerJoin(connectors, eq(connectors.id, events.connectorId))
            // Event -> Device (Using external ID and connector ID) - LEFT JOIN in case device was deleted but events remain
            .leftJoin(devices, and(
                eq(devices.connectorId, events.connectorId),
                eq(devices.deviceId, events.deviceId) // Join based on external ID
            ))
            // Device -> AreaDevice (Optional: Device might not be in an area)
            .leftJoin(areaDevices, eq(areaDevices.deviceId, devices.id)) // Join based on internal device ID
            // AreaDevice -> Area (Optional: AreaDevice implies Area exists, but use LEFT JOIN for safety)
            .leftJoin(areas, eq(areas.id, areaDevices.areaId))
            // Area -> Location (Optional: Area implies Location exists, but use LEFT JOIN for safety)
            .leftJoin(locations, eq(locations.id, areas.locationId))
            // --- Ordering & Limit ---
            .orderBy(desc(events.timestamp))
            .limit(limit);

        // --- Map DB results to DashboardEvent[] ---
        const dashboardEvents: DashboardEvent[] = results.map(row => {
            const payload = typeof row.standardizedPayload === 'string'
                            ? JSON.parse(row.standardizedPayload)
                            : row.standardizedPayload ?? {}; // Ensure payload is an object
            const originalEvent = typeof row.rawPayload === 'string'
                                  ? JSON.parse(row.rawPayload)
                                  : row.rawPayload ?? {}; // Ensure originalEvent is an object

            // Reconstruct deviceInfo using fetched data
            const deviceInfo = getDeviceTypeInfo(row.connectorCategory, row.rawDeviceType);

            return {
                eventId: row.eventUuid,
                connectorId: row.connectorId,
                deviceId: row.deviceId, // External ID
                timestamp: new Date(row.timestamp), // Convert timestamp back to Date
                category: row.standardizedEventCategory as EventCategory,
                type: row.standardizedEventType as EventType,
                subtype: row.standardizedEventSubtype as EventSubtype | undefined,
                payload: payload,
                originalEvent: originalEvent,
                deviceInfo: deviceInfo, // Add reconstructed deviceInfo
                // Enriched fields
                deviceName: row.deviceName,
                deviceRawType: row.rawDeviceType,
                connectorName: row.connectorName,
                connectorCategory: row.connectorCategory,
                areaId: row.areaId,
                areaName: row.areaName,
                locationId: row.locationId,
                locationName: row.locationName,
                locationPath: row.locationPath,
            };
        });

        return dashboardEvents;

    } catch (error) {
        console.error('Failed to get recent events for dashboard:', error);
        // Consider more specific error handling or re-throwing
        throw new Error('Database query failed');
    }
}

export const GET = withApiRouteAuth(async (request, authContext) => {
  try {
    // Optional: Add query parameters later for limit, time range, etc.
    // const { searchParams } = new URL(request.url);
    // const limit = parseInt(searchParams.get('limit') || '', 10) || DEFAULT_LIMIT;

    const events = await getRecentEventsForDashboard(DEFAULT_LIMIT);
    return NextResponse.json({ success: true, data: events });

  } catch (error) {
    console.error("[API /api/events/dashboard GET] Error:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    // Return a generic server error response
    return NextResponse.json({ success: false, error: "Failed to fetch dashboard events." }, { status: 500 });
  }
}); 