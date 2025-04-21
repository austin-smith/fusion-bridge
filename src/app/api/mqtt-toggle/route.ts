import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { nodes } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import * as mqttService from '@/services/mqtt-service';

/**
 * POST handler for toggling MQTT connection status
 * Accepts { disabled: boolean, nodeId: string } in the request body
 */
export async function POST(request: Request) {
  try {
    const { disabled, nodeId } = await request.json();
    console.log(`[MQTT Toggle API] Received request to set disabled=${disabled} for node ${nodeId}`);
    
    // Find the specific YoLink node by ID
    let targetNode;
    if (nodeId) {
      // If nodeId is provided, find that specific node
      const nodeResult = await db.select().from(nodes).where(eq(nodes.id, nodeId));
      
      if (nodeResult.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'Node not found'
        }, { status: 404 });
      }
      
      targetNode = nodeResult[0];
      
      // Check if it's a YoLink node
      if (targetNode.category !== 'yolink') {
        return NextResponse.json({
          success: false,
          error: 'Selected node is not a YoLink connector'
        }, { status: 400 });
      }
      
      // Update just this node's eventsEnabled state
      await db
        .update(nodes)
        .set({ eventsEnabled: !disabled })
        .where(eq(nodes.id, nodeId));
      
      console.log(`[MQTT Toggle API] Updated node ${nodeId}: eventsEnabled=${!disabled}`);
    } else {
      // Fallback to old behavior - find any YoLink node
      const yolinkNodes = await db.select().from(nodes).where(eq(nodes.category, 'yolink'));
      
      if (yolinkNodes.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No YoLink connector found'
        }, { status: 404 });
      }
      
      targetNode = yolinkNodes[0];
      
      // Update all YoLink nodes (old behavior)
      for (const node of yolinkNodes) {
        await db
          .update(nodes)
          .set({ eventsEnabled: !disabled })
          .where(eq(nodes.id, node.id));
        
        console.log(`[MQTT Toggle API] Updated node ${node.id}: eventsEnabled=${!disabled}`);
      }
    }
    
    // Make sure the node has a YoLink Home ID
    if (!targetNode.yolinkHomeId) {
      return NextResponse.json({
        success: false,
        error: 'YoLink Home ID is missing for this connector'
      }, { status: 400 });
    }
    
    const homeId = targetNode.yolinkHomeId;
    
    // Enable or disable MQTT connection for the selected node
    if (disabled) {
      console.log(`[MQTT Toggle API] Disabling MQTT connection for homeId ${homeId}`);
      await mqttService.disableMqttConnection(homeId);
    } else {
      console.log(`[MQTT Toggle API] Enabling MQTT connection for node ${targetNode.id} with homeId ${homeId}`);
      
      try {
        // Parse the configuration from the specific node
        const config = JSON.parse(targetNode.cfg_enc);
        if (config && config.uaid && config.clientSecret) {
          // Enable the MQTT service for this specific home
          console.log(`[MQTT Toggle API] Enabling MQTT service for homeId ${homeId}...`);
          const success = await mqttService.enableMqttConnection(homeId);
          console.log(`[MQTT Toggle API] MQTT enable result for ${homeId}: ${success}`);
          
          if (!success) {
            return NextResponse.json({
              success: false,
              error: 'Failed to enable MQTT connection'
            }, { status: 500 });
          }
        } else {
          console.error('[MQTT Toggle API] Invalid YoLink configuration');
          return NextResponse.json({
            success: false,
            error: 'Invalid YoLink configuration (missing uaid or clientSecret)'
          }, { status: 400 });
        }
      } catch (err) {
        console.error('[MQTT Toggle API] Error enabling MQTT service:', err);
        return NextResponse.json({
          success: false,
          error: err instanceof Error ? err.message : 'An unknown error occurred'
        }, { status: 500 });
      }
    }
    
    // Get current MQTT state for this specific home
    const mqttState = mqttService.getMqttClientState(homeId);
    console.log(`[MQTT Toggle API] Current MQTT state for ${homeId}:`, mqttState);
    
    return NextResponse.json({
      success: true,
      disabled,
      nodeId: targetNode.id,
      homeId,
      mqttState
    });
  } catch (error) {
    console.error('[MQTT Toggle API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    }, { status: 500 });
  }
} 