import { NextResponse } from 'next/server';
import { db } from '@/data/db/';
import { connectors } from '@/data/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { ConnectorWithConfig } from '@/types';
import { getAccessToken, getHomeInfo } from '@/services/drivers/yolink';

// Schema for connector creation
const createConnectorSchema = z.object({
  category: z.enum(['yolink', 'piko']),
  name: z.string().optional(),
  config: z.record(z.any()).optional(),
});

// Schema for YoLink config within the main config object
const yoLinkConfigSchema = z.object({
  uaid: z.string().min(1, "UAID is required"),
  clientSecret: z.string().min(1, "Client Secret is required"),
  homeId: z.string().optional(),
}).passthrough(); // Allow other potential fields in config

// GET /api/connectors - Fetches all connectors
export async function GET() {
  try {
    const allConnectorsRaw = await db.select().from(connectors);

    // Parse cfg_enc for the client
    const allConnectors: ConnectorWithConfig[] = allConnectorsRaw.map(connector => {
      let config = {};
      try {
        config = connector.cfg_enc ? JSON.parse(connector.cfg_enc) : {};
      } catch (e) {
        console.error(`Failed to parse config for connector ${connector.id}:`, e);
      }
      return {
        id: connector.id,
        category: connector.category,
        name: connector.name,
        createdAt: connector.createdAt, 
        eventsEnabled: connector.eventsEnabled,
        config: config, // Parsed config
      };
    });

    return NextResponse.json({ success: true, data: allConnectors });

  } catch (error: unknown) {
    console.error('Error fetching connectors:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to fetch connectors: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// POST /api/connectors - Creates a new connector
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate input using renamed schema
    const result = createConnectorSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid connector data', details: result.error.format() },
        { status: 400 }
      );
    }
    
    const { category, config } = result.data;
    let { name } = result.data;
    
    if (!name) {
      name = `${category}-${Date.now()}`;
    }

    const safeConfig = config && typeof config === 'object' ? config : {};
    const finalConfig = { ...safeConfig }; // Create a mutable copy to potentially add homeId
    
    const id = uuidv4();
    
    // If it's a YoLink connector, validate credentials and fetch/store Home ID IN the config
    if (category === 'yolink') {
      console.log("Creating a YoLink connector, validating and fetching Home ID...");
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
        const yolinkHomeId = await getHomeInfo(accessToken);
        console.log("YoLink Home ID fetched:", yolinkHomeId);
        
        // Add the fetched homeId TO THE CONFIG OBJECT
        finalConfig.homeId = yolinkHomeId;

      } catch (yolinkError) {
        console.error('Error fetching YoLink Home ID:', yolinkError);
        const errorMessage = yolinkError instanceof Error ? yolinkError.message : 'Failed to connect to YoLink API to get Home ID';
        return NextResponse.json(
          { success: false, error: `YoLink API Error: ${errorMessage}` },
          { status: 400 }
        );
      }
    }
    
    // Stringify the potentially updated config
    const configString = JSON.stringify(finalConfig);

    // Insert into database (use connectors table, no yolinkHomeId column)
    const newConnectorResult = await db.insert(connectors).values({
      id,
      category,
      name,
      cfg_enc: configString, // Store config JSON (potentially including homeId)
      createdAt: new Date(),
    }).returning();

    if (!newConnectorResult || newConnectorResult.length === 0) {
        throw new Error("Failed to create connector or return result.");
    }
    
    const newConnector = newConnectorResult[0];

    // Return the newly created connector with parsed config
    const returnConnector: ConnectorWithConfig = {
      id: newConnector.id,
      category: newConnector.category,
      name: newConnector.name,
      createdAt: newConnector.createdAt,
      eventsEnabled: newConnector.eventsEnabled,
      config: finalConfig, // Return the config object used for insertion
    };
    
    return NextResponse.json({ success: true, data: returnConnector });

  } catch (error) {
    console.error('Error creating connector:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create connector';
    const clientErrorMessage = errorMessage.startsWith('YoLink API Error:') ? errorMessage : 'Internal server error creating connector';
    return NextResponse.json(
      { success: false, error: clientErrorMessage },
      { status: 500 }
    );
  }
} 