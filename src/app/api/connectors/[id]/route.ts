import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { Connector, ConnectorWithConfig } from '@/types';
import { getAccessToken, getHomeInfo } from '@/services/drivers/yolink';

// Schema for connector update
const updateConnectorSchema = z.object({
  name: z.string().optional(),
  config: z.record(z.any()).optional(),
  eventsEnabled: z.boolean().optional(),
});

// GET /api/connectors/[id] - Get a single connector
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const connectorResult = await db.select().from(connectors).where(eq(connectors.id, id));
    
    if (!connectorResult.length) {
      return NextResponse.json(
        { success: false, error: 'Connector not found' },
        { status: 404 }
      );
    }
    
    const connector = connectorResult[0];
    let config = {};
    try {
      config = JSON.parse(connector.cfg_enc);
    } catch (e) {
      console.error(`Failed to parse config for connector ${connector.id}:`, e);
    }

    const connectorWithConfig: ConnectorWithConfig = {
      id: connector.id,
      category: connector.category,
      name: connector.name,
      createdAt: connector.createdAt,
      eventsEnabled: connector.eventsEnabled,
      config: config,
    };
    
    return NextResponse.json({ success: true, data: connectorWithConfig });
  } catch (error) {
    console.error('Error fetching connector:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch connector' },
      { status: 500 }
    );
  }
}

// PUT /api/connectors/[id] - Update a connector
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    
    // Validate input
    const result = updateConnectorSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid update data', details: result.error.format() },
        { status: 400 }
      );
    }
    
    // Check if connector exists
    const existingConnectorResult = await db.select().from(connectors).where(eq(connectors.id, id));
    if (!existingConnectorResult.length) {
      return NextResponse.json(
        { success: false, error: 'Connector not found' },
        { status: 404 }
      );
    }
    const existingConnector = existingConnectorResult[0];
    
    // Prepare update data
    const updateData: Partial<Connector> = {};
    const { name, config, eventsEnabled } = result.data;
    
    if (name !== undefined) updateData.name = name;
    if (eventsEnabled !== undefined) updateData.eventsEnabled = eventsEnabled;
    
    let currentConfig = {};
    try {
        currentConfig = JSON.parse(existingConnector.cfg_enc);
    } catch (e) {
        console.warn(`Could not parse existing config for connector ${id}, starting fresh.`);
    }
    
    // If config is provided in the update, merge it with existing config
    let updatedConfig = currentConfig;
    if (config !== undefined) {
      updatedConfig = { ...currentConfig, ...config };
    }

    // Special handling if updating a YoLink connector's credentials
    if (existingConnector.category === 'yolink' && config !== undefined) {
        // Check if credentials changed (uaid or clientSecret)
        const currentYoLinkConfig = currentConfig as Partial<{ uaid: string; clientSecret: string; homeId: string }>;
        const newYoLinkConfig = config as Partial<{ uaid: string; clientSecret: string }>;

        if (newYoLinkConfig.uaid !== currentYoLinkConfig.uaid || newYoLinkConfig.clientSecret !== currentYoLinkConfig.clientSecret) {
            console.log(`YoLink credentials changed for connector ${id}. Re-fetching homeId...`);
            try {
                if (!newYoLinkConfig.uaid || !newYoLinkConfig.clientSecret) {
                    throw new Error("Both UAID and Client Secret must be provided when updating YoLink credentials.");
                }
                const accessToken = await getAccessToken({ uaid: newYoLinkConfig.uaid, clientSecret: newYoLinkConfig.clientSecret });
                const newHomeId = await getHomeInfo(accessToken);
                (updatedConfig as { homeId?: string }).homeId = newHomeId;
                console.log(`YoLink homeId updated to ${newHomeId} for connector ${id}.`);
            } catch (yolinkError) {
                console.error('Error re-fetching YoLink Home ID during update:', yolinkError);
                const errorMessage = yolinkError instanceof Error ? yolinkError.message : 'Failed to verify new YoLink credentials';
                return NextResponse.json(
                    { success: false, error: `YoLink API Error during update: ${errorMessage}` },
                    { status: 400 } 
                );
            }
        }
    }

    // Store the potentially updated config as JSON string
    updateData.cfg_enc = JSON.stringify(updatedConfig);
    
    // Update the connector in the database
    const updatedConnectorResult = await db
      .update(connectors)
      .set(updateData)
      .where(eq(connectors.id, id))
      .returning();
    
    const updatedDbConnector = updatedConnectorResult[0];

    // Return the updated connector with the merged/updated config object
    const returnConnector: ConnectorWithConfig = {
      id: updatedDbConnector.id,
      category: updatedDbConnector.category,
      name: updatedDbConnector.name,
      createdAt: updatedDbConnector.createdAt,
      eventsEnabled: updatedDbConnector.eventsEnabled,
      config: updatedConfig,
    };
    
    return NextResponse.json({ success: true, data: returnConnector });

  } catch (error) {
    console.error('Error updating connector:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update connector' },
      { status: 500 }
    );
  }
}

// DELETE /api/connectors/[id] - Delete a connector
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    
    // Check if connector exists
    const existingConnector = await db.select().from(connectors).where(eq(connectors.id, id));
    if (!existingConnector.length) {
      return NextResponse.json(
        { success: false, error: 'Connector not found' },
        { status: 404 }
      );
    }
    
    // Delete the connector
    await db.delete(connectors).where(eq(connectors.id, id));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting connector:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during deletion.';
    return NextResponse.json(
      { success: false, error: `Failed to delete connector: ${errorMessage}` }, 
      { status: 500 }
    );
  }
} 