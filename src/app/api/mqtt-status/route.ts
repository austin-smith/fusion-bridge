import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import * as mqttService from '@/services/mqtt-service';

/**
 * GET handler for getting MQTT connection status for all YoLink connectors.
 * Returns an array of status objects, one for each YoLink connector.
 */
export async function GET(request: Request) {
  try {
    // Fetch all YoLink connectors from the database
    const yolinkConnectors = await db.select({
        id: connectors.id,
        name: connectors.name,
        category: connectors.category,
        cfg_enc: connectors.cfg_enc,
        eventsEnabled: connectors.eventsEnabled
    }).from(connectors).where(eq(connectors.category, 'yolink'));
    
    const statuses = [];
    
    for (const connector of yolinkConnectors) {
      let homeId: string | undefined = undefined;
      let config: { homeId?: string } | undefined;
      let parseError = false;

      try {
        config = JSON.parse(connector.cfg_enc);
        homeId = config?.homeId;
      } catch (e) {
        console.error(`[MQTT Status API] Failed to parse config for connector ${connector.id}:`, e);
        parseError = true;
      }
      
      let mqttState: mqttService.MqttClientState;

      if (homeId) {
        // Get status using the homeId from the config
        mqttState = mqttService.getMqttClientState(homeId);

        // Ensure the state reflects the actual connectorId being reported
        if (mqttState.homeId === homeId) {
          mqttState.connectorId = connector.id;
        } else {
          // State mismatch - report default state for *this* connector
          console.warn(`[MQTT Status API] State mismatch for connector ${connector.id}. Expected homeId ${homeId}, but state map returned for ${mqttState.homeId}. Reporting default state.`);
          mqttState = {
              connected: false, lastEvent: null, homeId: homeId, 
              connectorId: connector.id, error: 'State mismatch in service map', 
              reconnecting: false, 
              // Use DB value for disabled state
              disabled: !connector.eventsEnabled 
          };
        }
      } else {
        // No homeId found - report default disconnected state
        console.warn(`[MQTT Status API] No homeId found in config for connector ${connector.id}. Reporting disconnected.`);
        mqttState = {
            connected: false, lastEvent: null, homeId: null, 
            connectorId: connector.id,
            error: parseError ? 'Config parse error' : 'Missing homeId in config', 
            reconnecting: false, 
            // Use DB value for disabled state
            disabled: !connector.eventsEnabled 
        };
      }

      // Sync disabled state with DB as the source of truth, regardless of service state
      // This covers cases where the service might lag behind DB updates.
      if (mqttState.disabled !== !connector.eventsEnabled) {
          console.warn(`[MQTT Status API] Overriding reported disabled state (${mqttState.disabled}) for connector ${connector.id} based on DB value (${!connector.eventsEnabled})`);
          mqttState.disabled = !connector.eventsEnabled;
      }

      statuses.push({
        connectorId: connector.id,
        name: connector.name,
        homeId: homeId, // May be undefined
        enabled: connector.eventsEnabled,
        mqttState
      });
    }
    
    return NextResponse.json({
      success: true,
      statuses
    });

  } catch (error) {
    console.error('[MQTT Status API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    }, { status: 500 });
  }
} 