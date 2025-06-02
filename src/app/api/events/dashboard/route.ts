import { NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { db } from '@/data/db';
import { events, devices, connectors, areaDevices, areas, locations } from '@/data/db/schema';
import { desc, eq, and, isNull } from 'drizzle-orm';
import type { StandardizedEvent } from '@/types/events';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { EventCategory, EventType, EventSubtype } from '@/lib/mappings/definitions';

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

// Organization-scoped dashboard events function
async function getRecentEventsForDashboard(orgDb: any, limit: number = DEFAULT_LIMIT): Promise<DashboardEvent[]> {
    try {
        // Use organization-scoped event query
        const results = await orgDb.events.findDashboard(limit);

        // Map DB results to DashboardEvent[]
        const dashboardEvents: DashboardEvent[] = results.map((row: any) => {
            const payload = typeof row.standardizedPayload === 'string'
                            ? JSON.parse(row.standardizedPayload)
                            : row.standardizedPayload ?? {};
            const originalEvent = typeof row.rawPayload === 'string'
                                  ? JSON.parse(row.rawPayload)
                                  : row.rawPayload ?? {};

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
        throw new Error('Database query failed');
    }
}

export const GET = withOrganizationAuth(async (request, authContext: OrganizationAuthContext) => {
  try {
    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    // Optional: Add query parameters later for limit, time range, etc.
    // const { searchParams } = new URL(request.url);
    // const limit = parseInt(searchParams.get('limit') || '', 10) || DEFAULT_LIMIT;

    const events = await getRecentEventsForDashboard(orgDb, DEFAULT_LIMIT);
    return NextResponse.json({ success: true, data: events });

  } catch (error) {
    console.error("[API /api/events/dashboard GET] Error:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ success: false, error: "Failed to fetch dashboard events." }, { status: 500 });
  }
}); 