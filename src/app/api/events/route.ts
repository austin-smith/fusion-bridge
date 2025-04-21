import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { nodes, devices } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import * as eventsRepository from '@/data/repositories/events';

// GET handler to fetch events
export async function GET({ url }: Request) {
  try {
    const { searchParams } = new URL(url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    
    // Get basic events first
    const events = await eventsRepository.getRecentEvents(limit);
    
    // Enrich with device and connector info
    const enrichedEvents = await Promise.all(events.map(async (event) => {
      // Try to find device info
      const deviceInfo = await db
        .select({
          deviceName: devices.name,
          deviceType: devices.type,
          connectorId: devices.connectorId,
        })
        .from(devices)
        .where(eq(devices.deviceId, event.deviceId))
        .limit(1);
      
      // Try to find connector info if we have device info
      let connectorName = 'Unknown';
      if (deviceInfo.length > 0 && deviceInfo[0].connectorId) {
        const connectorInfo = await db
          .select({
            name: nodes.name,
          })
          .from(nodes)
          .where(eq(nodes.id, deviceInfo[0].connectorId))
          .limit(1);
        
        if (connectorInfo.length > 0) {
          connectorName = connectorInfo[0].name;
        }
      }
      
      // Return enriched event
      return {
        ...event,
        deviceName: deviceInfo.length > 0 ? deviceInfo[0].deviceName : 'Unknown Device',
        deviceType: deviceInfo.length > 0 ? deviceInfo[0].deviceType : 'Unknown',
        connectorName: connectorName,
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