import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { nodes, devices } from '@/data/db/schema';
import { eq, sql } from 'drizzle-orm';
import * as eventsRepository from '@/data/repositories/events';
import { getDeviceTypeInfo } from '@/lib/device-mapping';
import { TypedDeviceInfo } from '@/types/device-mapping';

// Interface for the raw event structure returned by the repository's map
interface RawRepoEvent {
  event: string;
  time: number;
  msgid: string;
  data: Record<string, any>;
  payload: Record<string, any>;
  deviceId: string;
}

// Define an interface for the enriched event structure sent to the client
interface EnrichedEvent extends RawRepoEvent {
  deviceName: string;
  connectorName: string;
  deviceTypeInfo: TypedDeviceInfo;
  connectorCategory: string;
}

// GET handler to fetch events
export async function GET({ url }: Request) {
  try {
    const { searchParams } = new URL(url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    
    // Get basic events first (matches RawRepoEvent structure)
    const rawEvents: RawRepoEvent[] = await eventsRepository.getRecentEvents(limit);
    
    // Enrich with device and connector info
    const enrichedEvents = await Promise.all(rawEvents.map(async (event): Promise<EnrichedEvent> => {
      let deviceName = 'Unknown Device';
      let connectorName = 'Unknown';
      let connectorCategory = 'unknown'; // Default category
      let rawDeviceType: string | null = null; // Store the raw identifier

      // Try to find device info
      const deviceInfoResult = await db
        .select({
          name: devices.name,
          type: devices.type, // Fetch raw identifier
          connectorId: devices.connectorId,
        })
        .from(devices)
        .where(eq(devices.deviceId, event.deviceId))
        .limit(1);
      
      // If device found, get its details and connector info
      if (deviceInfoResult.length > 0) {
        const deviceInfo = deviceInfoResult[0];
        deviceName = deviceInfo.name;
        rawDeviceType = deviceInfo.type; // Store the raw identifier

        if (deviceInfo.connectorId) {
          const connectorInfo = await db
            .select({
              name: nodes.name,
              category: nodes.category, // Fetch connector category
            })
            .from(nodes)
            .where(eq(nodes.id, deviceInfo.connectorId))
            .limit(1);
          
          if (connectorInfo.length > 0) {
            connectorName = connectorInfo[0].name;
            connectorCategory = connectorInfo[0].category; // Store connector category
          }
        }
      }
      
      // Get mapped type info
      const deviceTypeInfo = getDeviceTypeInfo(connectorCategory, rawDeviceType);

      // Return enriched event conforming to the interface
      return {
        ...event, // Spread the raw event properties
        deviceName,
        connectorName,
        connectorCategory, // Add the fetched connector category
        deviceTypeInfo, // Add the mapped type info object
      };
    }));
    
    return NextResponse.json({
      success: true,
      data: enrichedEvents
    });
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