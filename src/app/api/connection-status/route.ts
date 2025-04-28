import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import * as mqttService from '@/services/mqtt-service';
import * as pikoService from '@/services/piko-websocket-service';
import { ConnectorCategory } from '@/lib/mappings/definitions'; // Import connector category type
import { getLastWebhookActivity } from '@/services/webhook-service'; // <-- Import webhook store getter

/**
 * GET handler for getting connection status for all connectors (MQTT, WebSocket, etc.).
 * Returns an array of status objects.
 */
export async function GET(request: Request) {
  try {
    // Fetch all connectors from the database
    const allConnectors = await db.select({
        id: connectors.id,
        name: connectors.name,
        category: connectors.category,
        cfg_enc: connectors.cfg_enc,
        eventsEnabled: connectors.eventsEnabled
    }).from(connectors);

    // Pre-fetch all current states
    const allMqttStates = mqttService.getAllMqttClientStates();
    const allPikoStates = pikoService.getAllPikoWebSocketStates();
    
    const statuses = [];
    
    for (const connector of allConnectors) {
      // Wrap processing for each connector in a try/catch
      try {
        const statusPayload: Record<string, any> = { 
            connectorId: connector.id,
            name: connector.name,
            category: connector.category,
            enabled: connector.eventsEnabled,
            connectionType: 'unknown', 
            state: null,
            lastActivity: null 
        };
        let parseError = false;
        let lastActivity: number | null = null; 

        if (connector.category === 'yolink') {
            statusPayload.connectionType = 'mqtt';
            let homeId: string | undefined = undefined;
            try {
                if (connector.cfg_enc) { 
                    const config = JSON.parse(connector.cfg_enc);
                    homeId = config?.homeId;
                } else {
                    console.warn(`[Connection Status API][YoLink] Config is null for connector ${connector.id}`);
                }
            } catch (e) {
                console.error(`[Connection Status API][YoLink] Failed to parse config for ${connector.id}:`, e);
                parseError = true;
            }

            let mqttState: mqttService.MqttClientState | undefined;
            if (homeId) {
                mqttState = allMqttStates.get(homeId);
            }
            
            if (!mqttState) {
                if (connector.eventsEnabled) {
                    console.debug(`[Connection Status API][YoLink] No MQTT state found for connector ${connector.id} (HomeID: ${homeId}). Reporting default.`);
                }
                mqttState = {
                    connected: false, lastEvent: null, homeId: homeId ?? null, 
                    connectorId: connector.id, 
                    error: parseError ? 'Config parse error' : (homeId ? 'State not found in service map' : 'Missing homeId in config'), 
                    reconnecting: false, 
                    disabled: !connector.eventsEnabled,
                    lastStandardizedPayload: null
                };
            } else {
                // Ensure connectorId in state matches the one we are processing
                if (mqttState.connectorId !== connector.id && mqttState.homeId === homeId) {
                    console.warn(`[Connection Status API][YoLink] Overriding connectorId in MQTT state for Home ${homeId} from ${mqttState.connectorId} to ${connector.id}`);
                    mqttState.connectorId = connector.id; // Correct the connector ID association
                }
            }

            // Sync disabled state with DB
            if (mqttState.disabled !== !connector.eventsEnabled) {
                console.warn(`[Connection Status API][YoLink] Overriding reported disabled state (${mqttState.disabled}) for connector ${connector.id} based on DB (${!connector.eventsEnabled})`);
                mqttState.disabled = !connector.eventsEnabled;
            }
            lastActivity = mqttState.lastEvent?.time ?? null;
            statusPayload.state = mqttState;

        } else if (connector.category === 'piko') {
            statusPayload.connectionType = 'websocket';
            let pikoState: pikoService.PikoWebSocketState | undefined = allPikoStates.get(connector.id);

            if (!pikoState) {
                console.warn(`[Connection Status API][Piko] No WebSocket state found for connector ${connector.id}. Reporting default.`);
                 pikoState = {
                     connectorId: connector.id, systemId: null, isConnected: false, 
                     isConnecting: false, error: 'State not found in service map', 
                     reconnecting: false, disabled: !connector.eventsEnabled, lastActivity: null,
                     lastStandardizedPayload: null
                 };
            }
            
            // Sync disabled state with DB
            if (pikoState.disabled !== !connector.eventsEnabled) {
                console.warn(`[Connection Status API][Piko] Overriding reported disabled state (${pikoState.disabled}) for connector ${connector.id} based on DB (${!connector.eventsEnabled})`);
                pikoState.disabled = !connector.eventsEnabled;
            }
            lastActivity = pikoState.lastActivity ?? null;
            statusPayload.state = pikoState;

        } else if (connector.category === 'netbox' || connector.category === 'genea') {
            statusPayload.connectionType = 'webhook';
            lastActivity = getLastWebhookActivity(connector.id);
            statusPayload.state = {
                connectorId: connector.id,
                lastActivity: lastActivity, 
                disabled: !connector.eventsEnabled,
                error: null 
            };
        } else {
            // Handle other/unknown connector categories
            if (connector.eventsEnabled) {
                console.warn(`[Connection Status API] Unhandled connector category: ${connector.category} for ${connector.id}`);
            }
            statusPayload.connectionType = 'unknown';
            statusPayload.state = { error: `Unsupported category: ${connector.category}` };
        }

        statusPayload.lastActivity = lastActivity;
        statuses.push(statusPayload); // Push only if processing succeeds

      } catch (connectorError) {
          // Log error specific to this connector and continue the loop
          console.error(`[Connection Status API] Error processing status for connector ${connector.id}:`, connectorError);
          // Optionally push a minimal error status for this connector
          statuses.push({
              connectorId: connector.id,
              name: connector.name, 
              category: connector.category,
              enabled: connector.eventsEnabled,
              connectionType: 'error', 
              state: { error: `Failed to process status: ${connectorError instanceof Error ? connectorError.message : 'Unknown error'}` },
              lastActivity: null
          });
      }
    } // End for loop
    
    return NextResponse.json({ success: true, statuses });

  } catch (error) {
    console.error('[Connection Status API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    }, { status: 500 });
  }
} 