import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { nodes } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import * as mqttService from '@/services/mqtt-service';

/**
 * GET handler for getting MQTT connection status
 * If nodeId query parameter is provided, returns status for that specific node
 * Otherwise returns status for all YoLink nodes
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const nodeId = url.searchParams.get('nodeId');
    
    // For multi-connection support, we need to know which homeId to query
    const statuses = [];
    
    if (nodeId) {
      // Find the specific YoLink node by ID
      const nodeResult = await db.select().from(nodes).where(eq(nodes.id, nodeId));
      
      if (nodeResult.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'Node not found'
        }, { status: 404 });
      }
      
      const node = nodeResult[0];
      
      // Check if it's a YoLink node
      if (node.category !== 'yolink') {
        return NextResponse.json({
          success: false,
          error: 'Selected node is not a YoLink connector'
        }, { status: 400 });
      }
      
      // Get status for this specific node's homeId
      if (node.yolinkHomeId) {
        const mqttState = mqttService.getMqttClientState(node.yolinkHomeId);
        statuses.push({
          nodeId: node.id,
          name: node.name,
          homeId: node.yolinkHomeId,
          enabled: node.eventsEnabled,
          mqttState
        });
      } else {
        statuses.push({
          nodeId: node.id,
          name: node.name,
          homeId: null,
          enabled: node.eventsEnabled,
          mqttState: 'disconnected' // Default when no homeId is available
        });
      }
    } else {
      // Get all YoLink nodes and their status
      const yolinkNodes = await db.select().from(nodes).where(eq(nodes.category, 'yolink'));
      
      for (const node of yolinkNodes) {
        if (node.yolinkHomeId) {
          const mqttState = mqttService.getMqttClientState(node.yolinkHomeId);
          statuses.push({
            nodeId: node.id,
            name: node.name,
            homeId: node.yolinkHomeId,
            enabled: node.eventsEnabled,
            mqttState
          });
        } else {
          statuses.push({
            nodeId: node.id,
            name: node.name,
            homeId: null,
            enabled: node.eventsEnabled,
            mqttState: 'disconnected' // Default when no homeId is available
          });
        }
      }
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