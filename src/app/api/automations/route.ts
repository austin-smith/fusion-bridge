import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { automations, connectors } from '@/data/db/schema';
import { AutomationConfigSchema } from '@/lib/automation-schemas';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

// Schema for validating the POST request body
const PostBodySchema = z.object({
    name: z.string().min(1, { message: "Name is required" }),
    sourceConnectorId: z.string().uuid({ message: "Invalid source connector ID" }),
    enabled: z.boolean().optional().default(true),
    config: AutomationConfigSchema,
});

/**
 * GET /api/automations
 * Fetches all automation configurations.
 */
export async function GET(request: Request) {
  try {
    const results = await db
      .select({
        id: automations.id,
        name: automations.name,
        enabled: automations.enabled,
        sourceConnectorId: automations.sourceConnectorId,
        createdAt: automations.createdAt,
        updatedAt: automations.updatedAt,
        configJson: automations.configJson,
        sourceConnectorName: connectors.name,
      })
      .from(automations)
      .leftJoin(connectors, eq(automations.sourceConnectorId, connectors.id));

    // No need for the .map() step anymore
    return NextResponse.json(results);

  } catch (error) {
    console.error("Failed to fetch automations:", error);
    return NextResponse.json({ message: "Failed to fetch automations" }, { status: 500 });
  }
}

/**
 * POST /api/automations
 * Creates a new automation configuration.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const validationResult = PostBodySchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ message: "Invalid request body", errors: validationResult.error.flatten().fieldErrors }, { status: 400 });
    }
    
    const { name, sourceConnectorId, enabled, config } = validationResult.data;

    // Optional: Validate that sourceConnectorId exists in the connectors table
    const sourceConnectorExists = await db.select({ id: connectors.id }).from(connectors).where(eq(connectors.id, sourceConnectorId)).limit(1);
    if (!sourceConnectorExists.length) {
        return NextResponse.json({ message: "Source connector not found" }, { status: 404 });
    }
    // TODO: Optionally validate targetConnectorId within actions config against connectors table?

    const newAutomation = await db.insert(automations).values({
      name: name,
      sourceConnectorId: sourceConnectorId,
      enabled: enabled,
      configJson: config,
    }).returning();

    if (!newAutomation || newAutomation.length === 0) {
        throw new Error("Failed to create automation record in database.")
    }

    return NextResponse.json(newAutomation[0], { status: 201 });

  } catch (error) {
    console.error("Failed to create automation:", error);
    if (error instanceof z.ZodError) {
       return NextResponse.json({ message: "Invalid configuration data", errors: error.flatten().fieldErrors }, { status: 400 });
    }
    return NextResponse.json({ message: "Failed to create automation" }, { status: 500 });
  }
} 