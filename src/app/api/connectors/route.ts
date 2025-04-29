import { NextResponse } from 'next/server';
import { db } from '@/data/db/';
import { connectors } from '@/data/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { ConnectorWithConfig } from '@/types';
import crypto from 'crypto'; // Import crypto
import { NextRequest } from 'next/server';

// Define specific config schemas
const YoLinkConfigSchema = z.object({
  uaid: z.string(),
  clientSecret: z.string(),
  homeId: z.string().optional(), // Home ID can be optional initially
});

// Define Piko common/base schema
const PikoTokenSchema = z.object({ 
  accessToken: z.string(),
  refreshToken: z.string().optional(), 
  expiresAt: z.string().optional(),    
  expiresIn: z.union([z.string(), z.number()]).optional(), 
  sessionId: z.string().optional(),    
}).optional();

const PikoBaseConfigSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  token: PikoTokenSchema,
});

// Define schemas for type-specific fields
const PikoCloudSpecificSchema = z.object({
  type: z.literal('cloud'),
  selectedSystem: z.string().min(1, "Piko System selection is required"),
});

const PikoLocalSpecificSchema = z.object({
  type: z.literal('local'),
  host: z.string().min(1, "Host/URL is required"),
  port: z.number().int().min(1).max(65535, "Invalid port number"),
  ignoreTlsErrors: z.boolean().optional(), // Add TLS ignore flag
});

// Merge base with specific schemas
const PikoCloudConfigSchema = PikoCloudSpecificSchema.merge(PikoBaseConfigSchema);
const PikoLocalConfigSchema = PikoLocalSpecificSchema.merge(PikoBaseConfigSchema);

// Re-define the discriminated union using the MERGED schemas
const PikoConfigSchema = z.discriminatedUnion("type", [
  PikoCloudConfigSchema,
  PikoLocalConfigSchema
]);

const NetBoxConfigSchema = z.object({
  webhookId: z.string().uuid(),
  webhookSecret: z.string().optional(), // Secret is optional
});

// Add Genea config schema
const GeneaConfigSchema = z.object({
  webhookId: z.string().uuid(),
  apiKey: z.string().min(1, "API Key is required"), 
  webhookSecret: z.string().min(1, "Webhook Secret is required"), // Add webhookSecret as required
});

// Combined schema for the request body for POST
const createConnectorSchema = z.object({
  name: z.string().optional(),
  category: z.enum(['yolink', 'piko', 'netbox', 'genea']), // Added genea
  config: z.record(z.string(), z.any()).optional(), // Use record for initial parse, refine later
}).superRefine((data, ctx) => {
  const { category, config, name } = data;

  // Add check for name for NetBox/Genea
  if ((category === 'netbox' || category === 'genea') && (!name || name.trim() === '')) {
      ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Connector Name is required for NetBox and Genea connectors",
          path: ['name'],
      });
  }

  if (!config) {
    // Config is generally required unless specific categories allow it (none currently)
    // If a category *needs* config, add the error here.
    // For now, let's assume config *should* be present based on frontend logic.
    if (category === 'yolink' || category === 'piko' || category === 'genea' || category === 'netbox') {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Configuration is required for this connector type.",
            path: ['config'],
        });
        // Return early if config is missing but required
        return;
    }
  }

  // If config *is* present, validate its contents based on category
  if (config) {
      if (category === 'yolink') {
          const parsed = YoLinkConfigSchema.safeParse(config);
          if (!parsed.success) {
              parsed.error.errors.forEach((err) => {
                  ctx.addIssue({ ...err, path: ['config', ...(err.path)] });
              });
          }
      } else if (category === 'piko') {
          const parsed = PikoConfigSchema.safeParse(config);
          if (!parsed.success) {
              parsed.error.errors.forEach((err: z.ZodIssue) => { // Explicitly type err
                  ctx.addIssue({ ...err, path: ['config', ...(err.path)] });
              });
          }
      } else if (category === 'netbox') {
          const parsed = NetBoxConfigSchema.safeParse(config);
          if (!parsed.success) {
              parsed.error.errors.forEach((err) => {
                  ctx.addIssue({ ...err, path: ['config', ...(err.path)] });
              });
          }
      } else if (category === 'genea') {
          const parsed = GeneaConfigSchema.safeParse(config);
          if (!parsed.success) {
              // Add specific message for API key if it's the missing field
              const apiKeyError = parsed.error.errors.find(e => e.path.includes('apiKey'));
              if (apiKeyError && apiKeyError.code === 'too_small') {
                  ctx.addIssue({
                      code: z.ZodIssueCode.custom,
                      message: "API Key is required for Genea connectors",
                      path: ['config', 'apiKey']
                  });
              } else {
                // Add other errors generically
                parsed.error.errors.forEach((err) => {
                    ctx.addIssue({ ...err, path: ['config', ...(err.path)] });
                });
              }
          }
      }
  }
});

// Combined schema for the request body for PUT (subset, config is partial)
const updateConnectorSchema = z.object({
  name: z.string().optional(),
  // Category cannot be updated
  config: z.union([
    YoLinkConfigSchema.partial(),
    // Use partial schemas for Piko cloud/local within the union
    PikoCloudConfigSchema.omit({ type: true }).partial(), 
    PikoLocalConfigSchema.omit({ type: true }).partial(),   
    NetBoxConfigSchema.partial().omit({ webhookId: true }), // webhookId cannot be updated
    GeneaConfigSchema.partial().omit({ webhookId: true }), // webhookId cannot be updated, secret/apiKey can
  ]).optional(),
  // Add ignoreTlsErrors here too for PUT?
  // It should likely be part of the PikoLocalConfigSchema partial update
});

// GET /api/connectors - Fetches all connectors
export async function GET(req: NextRequest) {
  try {
    const allConnectorsRaw = await db.select().from(connectors);

    const allConnectors: ConnectorWithConfig[] = allConnectorsRaw.map(connector => {
      let config = {};
      try {
        // Explicitly check if cfg_enc is a non-null string before parsing
        if (connector.cfg_enc) { 
          config = JSON.parse(connector.cfg_enc);
        } else {
          // Handle null or empty case explicitly if needed, otherwise config remains {}
          // console.warn(`Connector ${connector.id} has null or empty cfg_enc`);
        }
      } catch (e) {
        console.error(`Failed to parse config for connector ${connector.id}:`, e);
        // config remains {} on error
      }
      return {
        id: connector.id,
        category: connector.category,
        name: connector.name,
        createdAt: connector.createdAt, 
        eventsEnabled: connector.eventsEnabled,
        config: config, // Parsed config or empty object
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
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = createConnectorSchema.safeParse(body);

    if (!validation.success) {
      console.error("Validation Error (POST):", validation.error.errors);
      return NextResponse.json({ success: false, error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }

    const { name, category, config } = validation.data;

    // Generate a default name if not provided
    const connectorName = name || `${category.charAt(0).toUpperCase() + category.slice(1)} Connector`;

    // Config is now guaranteed to be valid for the category by superRefine
    const finalConfig = config || {}; // Keep fallback just in case, though refine should prevent invalid states
    let webhookId: string | undefined = undefined;
    const connectorId = uuidv4(); // Generate ID for the new connector

    // Assign webhookId if it exists in the validated config (for NetBox/Genea)
    if ((category === 'netbox' || category === 'genea') && finalConfig.webhookId) {
        webhookId = finalConfig.webhookId as string;
        // No need to generate one here anymore, schema ensures it exists if required
    }

    // Stringify the final config for storage
    const configString = JSON.stringify(finalConfig);

    // Create connector in DB using Drizzle
    const newConnectorResult = await db.insert(connectors).values({
        id: connectorId, // Use generated UUID
        name: connectorName,
        category,
        cfg_enc: configString, // Store the stringified config (which includes webhookId for relevant types)
        eventsEnabled: false, // Default ALL new connectors to disabled
        createdAt: new Date(), // Set creation timestamp
      }).returning(); // Return the inserted row

    if (!newConnectorResult || newConnectorResult.length === 0) {
      throw new Error("Failed to create connector in database or return result.");
    }
    const newConnectorDb = newConnectorResult[0];

    // Construct the response object matching ConnectorWithConfig
    const responseData: ConnectorWithConfig = {
      id: newConnectorDb.id,
      category: newConnectorDb.category,
      name: newConnectorDb.name,
      createdAt: newConnectorDb.createdAt,
      eventsEnabled: newConnectorDb.eventsEnabled,
      config: finalConfig, // Return the parsed config object used for creation
      // webhookId: newConnectorDb.webhookId, // Optionally include if needed in response
      // lastEventTimestamp: null, // Initialize derived fields if needed by client immediately
      // status: 'unknown',      // Initialize derived fields if needed by client immediately
    };

    return NextResponse.json({ success: true, data: responseData });

  } catch (error) {
    console.error("Error creating connector:", error);
    // Handle potential Zod errors or others
    let errorMessage = 'Failed to create connector';
    if (error instanceof z.ZodError) {
        errorMessage = 'Invalid data format.'; // Should be caught by validation earlier
    } else if (error instanceof Error) {
        // Could check for specific DB error codes if needed (e.g., unique constraint)
        errorMessage = error.message;
    }
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

// Helper function (consider moving to utils)
// This function might need adjustment based on how GET uses it and Drizzle's output
function formatConnectorData(connector: any): ConnectorWithConfig {
  let config = {};
  try {
    // Assuming GET uses the raw db output which has cfg_enc
    config = connector.cfg_enc ? JSON.parse(connector.cfg_enc) : {};
  } catch (e) {
    console.error(`Failed to parse config for connector ${connector.id} in formatConnectorData:`, e);
  }
  return {
    id: connector.id,
    category: connector.category,
    name: connector.name,
    createdAt: connector.createdAt,
    eventsEnabled: connector.eventsEnabled,
    config: config, // Use the parsed config
    // lastEventTimestamp: null, // Add derived/client-side fields if needed
    // status: 'unknown',        // Add derived/client-side fields if needed
  };
} 