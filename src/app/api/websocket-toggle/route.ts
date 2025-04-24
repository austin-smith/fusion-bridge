import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import * as pikoService from '@/services/piko-websocket-service';

/**
 * POST handler for enabling/disabling WebSocket event streaming for a Piko connector.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { connectorId, disabled } = body;

    if (!connectorId || typeof disabled !== 'boolean') {
      return NextResponse.json({ success: false, error: 'Missing connectorId or invalid disabled state' }, { status: 400 });
    }

    // Verify the connector exists and is a Piko connector
    const connector = await db.select({ id: connectors.id, category: connectors.category })
                             .from(connectors)
                             .where(eq(connectors.id, connectorId))
                             .limit(1);

    if (!connector.length) {
         return NextResponse.json({ success: false, error: 'Connector not found' }, { status: 404 });
    }
    if (connector[0].category !== 'piko') {
         return NextResponse.json({ success: false, error: 'Connector is not a Piko connector' }, { status: 400 });
    }

    console.log(`[API websocket-toggle] Request received for ${connectorId}. Setting disabled=${disabled}`);

    let success = false;
    if (disabled) {
      // Call disable function (updates DB and disconnects)
      await pikoService.disablePikoConnection(connectorId);
      success = true; // disablePikoConnection doesn't return status, assume success if no error
      console.log(`[API websocket-toggle] Called disablePikoConnection for ${connectorId}`);
    } else {
      // Call enable function (updates DB and connects/initializes)
      success = await pikoService.enablePikoConnection(connectorId);
       console.log(`[API websocket-toggle] Called enablePikoConnection for ${connectorId}. Success: ${success}`);
    }

    return NextResponse.json({ success });

  } catch (error) {
    console.error('[API websocket-toggle] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    }, { status: 500 });
  }
} 