import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import * as mqttService from '@/services/mqtt-service';
import { z } from 'zod';

// Schema for the request body
const toggleSchema = z.object({
  disabled: z.boolean(),
  connectorId: z.string(),
});

/**
 * POST handler for toggling MQTT connection status for a specific connector
 * Accepts { disabled: boolean, connectorId: string } in the request body
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = toggleSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: result.error.format() },
        { status: 400 }
      );
    }

    const { disabled, connectorId } = result.data;
    console.log(`[MQTT Toggle API] Request: disabled=${disabled} for connector ${connectorId}`);
    
    // 1. Check if connector exists and is YoLink
    const connectorResult = await db.select({ category: connectors.category, cfg_enc: connectors.cfg_enc }) 
                                    .from(connectors)
                                    .where(eq(connectors.id, connectorId))
                                    .limit(1);

    if (connectorResult.length === 0) {
      return NextResponse.json({ success: false, error: 'Connector not found' }, { status: 404 });
    }
    const connector = connectorResult[0];

    if (connector.category !== 'yolink') {
      return NextResponse.json({ success: false, error: 'Selected connector is not a YoLink connector' }, { status: 400 });
    }

    // 2. Update DB state (handled within enable/disable functions, but good practice? Maybe remove)
    // We rely on enable/disableMqttConnection to update the DB via saveDisabledState
    // console.log(`[MQTT Toggle API] Updating DB: eventsEnabled=${!disabled} for connector ${connectorId}`);
    // await db.update(connectors).set({ eventsEnabled: !disabled }).where(eq(connectors.id, connectorId));

    // 3. Enable or disable MQTT connection via the service
    let success = false;
    if (disabled) {
      console.log(`[MQTT Toggle API] Calling disableMqttConnection for connector ${connectorId}`);
      await mqttService.disableMqttConnection(connectorId);
      success = true; // Assume success for disable unless error is thrown (which it doesn't currently)
    } else {
      console.log(`[MQTT Toggle API] Calling enableMqttConnection for connector ${connectorId}`);
      success = await mqttService.enableMqttConnection(connectorId);
    }

    if (!success && !disabled) { // Only check success for enable operation
       console.error(`[MQTT Toggle API] enableMqttConnection failed for connector ${connectorId}`);
       // Note: enableMqttConnection already logs errors
       return NextResponse.json({ success: false, error: 'Failed to enable MQTT connection' }, { status: 500 });
    }

    console.log(`[MQTT Toggle API] Operation completed for connector ${connectorId}. Disabled status: ${disabled}, Enable success (if applicable): ${success}`);

    // 4. Get current MQTT state (needs homeId)
    let homeId: string | undefined;
    let mqttState: mqttService.MqttClientState | undefined;
    try {
      const config = JSON.parse(connector.cfg_enc);
      homeId = config?.homeId;
      if (homeId) {
        mqttState = mqttService.getMqttClientState(homeId); // Fetch state using homeId
        console.log(`[MQTT Toggle API] Fetched MQTT state for homeId ${homeId}:`, mqttState);
      } else {
          console.warn(`[MQTT Toggle API] Could not determine homeId for connector ${connectorId} to fetch state.`);
          mqttState = mqttService.getMqttClientState(undefined); // Get default state
      }
    } catch (e) {
      console.error(`[MQTT Toggle API] Failed to parse config or get MQTT state for ${connectorId}:`, e);
      mqttState = mqttService.getMqttClientState(undefined); // Get default state on error
    }
    
    return NextResponse.json({
      success: true,
      disabled: disabled, // Return the requested state
      connectorId: connectorId,
      homeId: homeId, // Return homeId if found
      mqttState // Return the current state
    });

  } catch (error) {
    console.error('[MQTT Toggle API] General Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    }, { status: 500 });
  }
} 