import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Connector, ConnectorWithConfig } from '@/types';
import * as yolinkDriver from '@/services/drivers/yolink';
import type { YoLinkConfig } from '@/services/drivers/yolink';
import { withOrganizationAuth, OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';

// Schema for connector update
const updateConnectorSchema = z.object({
  name: z.string().optional(),
  config: z.record(z.any()).optional(),
  eventsEnabled: z.boolean().optional(),
});

// GET /api/connectors/[id] - Get a single connector
export const GET = withOrganizationAuth(async (
  request: Request,
  authContext: OrganizationAuthContext,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await context.params;
    const orgDb = createOrgScopedDb(authContext.organizationId);
    const connectorResult = await orgDb.connectors.findById(id);
    
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
      organizationId: connector.organizationId,
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
});

// PUT /api/connectors/[id] - Update a connector
export const PUT = withOrganizationAuth(async (
  request: Request,
  authContext: OrganizationAuthContext,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await context.params;
    const orgDb = createOrgScopedDb(authContext.organizationId);
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
    const existingConnectorResult = await orgDb.connectors.findById(id);
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
        const currentYoLinkConfig = currentConfig as Partial<YoLinkConfig>;
        const newYoLinkConfigFromInput = config as Partial<YoLinkConfig>;

        const credentialsChanged = newYoLinkConfigFromInput.uaid !== undefined && newYoLinkConfigFromInput.uaid !== currentYoLinkConfig.uaid || 
                                 newYoLinkConfigFromInput.clientSecret !== undefined && newYoLinkConfigFromInput.clientSecret !== currentYoLinkConfig.clientSecret;

        if (credentialsChanged) {
            console.log(`YoLink credentials changed for connector ${id}. Verifying and re-fetching homeId...`);
            try {
                const newUaid = newYoLinkConfigFromInput.uaid || currentYoLinkConfig.uaid;
                const newClientSecret = newYoLinkConfigFromInput.clientSecret || currentYoLinkConfig.clientSecret;

                if (!newUaid || !newClientSecret) {
                    throw new Error("Both UAID and Client Secret must be present when YoLink credentials change.");
                }

                // 1. Create a temporary config with the new credentials to validate them
                const tempNewCredentialConfig: YoLinkConfig = {
                    uaid: newUaid,
                    clientSecret: newClientSecret,
                    // scope is usually part of token response, default to current or empty for new credential check
                    scope: currentYoLinkConfig.scope || [], 
                };

                // 2. Validate new credentials and get a token based on them
                const tokenDetailsFromNewCreds = await yolinkDriver.getRefreshedYoLinkToken(tempNewCredentialConfig);

                // 3. Fetch homeId using the token from new credentials and the existing connectorId
                // The config passed to getHomeInfo should be the one containing the new valid token
                const newHomeId = await yolinkDriver.getHomeInfo(id, tokenDetailsFromNewCreds.updatedConfig);
                
                // 4. Update the main 'updatedConfig' object that will be saved to the DB
                (updatedConfig as YoLinkConfig).homeId = newHomeId;
                (updatedConfig as YoLinkConfig).uaid = newUaid;
                (updatedConfig as YoLinkConfig).clientSecret = newClientSecret;
                // Also, persist the new tokens obtained from the new credentials
                (updatedConfig as YoLinkConfig).accessToken = tokenDetailsFromNewCreds.updatedConfig.accessToken;
                (updatedConfig as YoLinkConfig).refreshToken = tokenDetailsFromNewCreds.updatedConfig.refreshToken;
                (updatedConfig as YoLinkConfig).tokenExpiresAt = tokenDetailsFromNewCreds.updatedConfig.tokenExpiresAt;
                (updatedConfig as YoLinkConfig).scope = tokenDetailsFromNewCreds.updatedConfig.scope; // Persist scope too

                console.log(`YoLink homeId updated to ${newHomeId} and tokens refreshed for connector ${id}.`);
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
    const updatedConnectorResult = await orgDb.connectors.update(id, updateData);
    
    const updatedDbConnector = updatedConnectorResult[0];

    // Return the updated connector with the merged/updated config object
    const returnConnector: ConnectorWithConfig = {
      id: updatedDbConnector.id,
      category: updatedDbConnector.category,
      name: updatedDbConnector.name,
      organizationId: updatedDbConnector.organizationId,
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
});

// DELETE /api/connectors/[id] - Delete a connector
export const DELETE = withOrganizationAuth(async (
  request: Request,
  authContext: OrganizationAuthContext,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await context.params;
    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    // Check if connector exists
    const existingConnector = await orgDb.connectors.findById(id);
    if (!existingConnector.length) {
      return NextResponse.json(
        { success: false, error: 'Connector not found' },
        { status: 404 }
      );
    }
    
    // Delete the connector
    await orgDb.connectors.delete(id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting connector:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during deletion.';
    return NextResponse.json(
      { success: false, error: `Failed to delete connector: ${errorMessage}` }, 
      { status: 500 }
    );
  }
}); 