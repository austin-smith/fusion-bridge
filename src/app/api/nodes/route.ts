import { NextResponse } from 'next/server';
import { db } from '@/data/db/';
import { nodes } from '@/data/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { NodeWithConfig } from '@/types';
import { getAccessToken, getHomeInfo } from '@/services/drivers/yolink';

// Schema for node creation
const createNodeSchema = z.object({
  category: z.enum(['yolink', 'piko']),
  name: z.string().optional(),
  config: z.record(z.any()).optional(),
});

// Schema for YoLink config within the main config object
const yoLinkConfigSchema = z.object({
  uaid: z.string().min(1, "UAID is required"),
  clientSecret: z.string().min(1, "Client Secret is required"),
}).passthrough(); // Allow other potential fields in config

export async function GET() {
  try {
    const allNodes = await db.select().from(nodes);
    
    // Convert stored JSON strings back to objects
    const nodesWithParsedConfig: NodeWithConfig[] = allNodes.map(node => ({
      ...node,
      config: JSON.parse(node.cfg_enc || '{}'),
      yolinkHomeId: node.yolinkHomeId === null ? undefined : node.yolinkHomeId,
    }));
    
    return NextResponse.json({ success: true, data: nodesWithParsedConfig });
  } catch (error) {
    console.error('Error fetching nodes:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch nodes' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate input
    const result = createNodeSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid node data', details: result.error.format() },
        { status: 400 }
      );
    }
    
    const { category, config } = result.data;
    let { name } = result.data;
    
    // Provide a default name if missing
    if (!name) {
      name = `${category}-${Date.now()}`; 
    }

    // Ensure config is an object, default to empty if undefined/null/not object
    const safeConfig = config && typeof config === 'object' ? config : {};
    const configString = JSON.stringify(safeConfig);
    
    // Generate a unique ID
    const id = uuidv4();
    
    let yolinkHomeId: string | undefined = undefined;

    // If it's a YoLink connector, fetch the Home ID
    if (category === 'yolink') {
      console.log("Creating a YoLink node, attempting to fetch Home ID...");
      // Validate YoLink specific config
      const yoLinkConfigResult = yoLinkConfigSchema.safeParse(safeConfig);
      if (!yoLinkConfigResult.success) {
        console.error("Invalid YoLink config:", yoLinkConfigResult.error.format());
        return NextResponse.json(
          { success: false, error: 'Invalid YoLink credentials provided', details: yoLinkConfigResult.error.format() },
          { status: 400 }
        );
      }
      
      try {
        const { uaid, clientSecret } = yoLinkConfigResult.data;
        console.log("Fetching YoLink access token...");
        const accessToken = await getAccessToken({ uaid, clientSecret });
        console.log("Access token retrieved, fetching Home Info...");
        yolinkHomeId = await getHomeInfo(accessToken);
        console.log("YoLink Home ID fetched:", yolinkHomeId);
      } catch (yolinkError) {
        console.error('Error fetching YoLink Home ID:', yolinkError);
        const errorMessage = yolinkError instanceof Error ? yolinkError.message : 'Failed to connect to YoLink API to get Home ID';
        return NextResponse.json(
          { success: false, error: `YoLink API Error: ${errorMessage}` },
          { status: 400 } // Use 400 Bad Request for credential/connection issues
        );
      }
    }
    
    // Insert into database
    const newNodeResult = await db.insert(nodes).values({
      id,
      category,
      name,
      cfg_enc: configString,
      yolinkHomeId, // Add the fetched homeId here
      createdAt: new Date(),
    }).returning();

    if (!newNodeResult || newNodeResult.length === 0) {
        throw new Error("Failed to create node or return result.");
    }
    
    const newNode = newNodeResult[0];

    // Return with parsed config and potentially homeId
    const returnNode: NodeWithConfig = {
      ...newNode,
      config: JSON.parse(newNode.cfg_enc || '{}'),
      yolinkHomeId: newNode.yolinkHomeId === null ? undefined : newNode.yolinkHomeId,
    };
    
    return NextResponse.json({ success: true, data: returnNode });
  } catch (error) {
    console.error('Error creating node:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create node';
    // Avoid sending detailed internal errors if it's not a specific YoLink API error caught above
    const clientErrorMessage = errorMessage.startsWith('YoLink API Error:') ? errorMessage : 'Internal server error creating node';
    return NextResponse.json(
      { success: false, error: clientErrorMessage },
      { status: 500 }
    );
  }
} 