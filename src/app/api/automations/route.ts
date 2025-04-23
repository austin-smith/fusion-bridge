import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { automations, nodes } from '@/data/db/schema';
import { AutomationConfigSchema } from '@/lib/automation-schemas';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';

// Schema for validating the POST request body
const PostBodySchema = z.object({
    name: z.string().min(1, { message: "Name is required" }),
    sourceNodeId: z.string().uuid({ message: "Invalid source node ID" }),
    enabled: z.boolean().optional().default(true),
    config: AutomationConfigSchema, // Validate the nested config object
});

/**
 * GET /api/automations
 * Fetches all automation configurations.
 */
export async function GET(request: Request) {
  try {
    const allAutomations = await db
      .select({
        id: automations.id,
        name: automations.name,
        enabled: automations.enabled,
        sourceNodeId: automations.sourceNodeId,
        createdAt: automations.createdAt,
        updatedAt: automations.updatedAt,
        configJson: automations.configJson,
        // Optionally join with nodes to get names
        sourceNodeName: nodes.name,
      })
      .from(automations)
      .leftJoin(nodes, eq(automations.sourceNodeId, nodes.id)); // Only join source node

    // Since targetNodeId is now per-action within configJson, 
    // we can't easily display a single target node name at the top level.
    // The UI (AutomationTable) will need adjustment if it relied on this.
    const results = allAutomations.map(a => ({
      ...a,
      // Map source node name correctly (from the join)
      sourceNodeName: a.sourceNodeName,
      // targetNodeName: nodes.name, // Target node is now per-action, cannot join simply here
    }));

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
    
    // Validate request body
    const validationResult = PostBodySchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ message: "Invalid request body", errors: validationResult.error.flatten().fieldErrors }, { status: 400 });
    }
    
    // Destructure without the top-level targetNodeId
    const { name, sourceNodeId, enabled, config } = validationResult.data;

    // TODO: Optional - Validate that sourceNodeId and targetNodeId actually exist in the nodes table?

    // Insert into database
    const newAutomation = await db.insert(automations).values({
      name: name,
      sourceNodeId: sourceNodeId,
      enabled: enabled,
      configJson: config, // Store the validated config object directly
      // createdAt and updatedAt have default values
    }).returning(); // Return the newly created record

    if (!newAutomation || newAutomation.length === 0) {
        throw new Error("Failed to create automation record in database.")
    }

    return NextResponse.json(newAutomation[0], { status: 201 }); // 201 Created

  } catch (error) {
    console.error("Failed to create automation:", error);
    // Handle potential unique constraint errors or other DB issues if necessary
    if (error instanceof z.ZodError) {
       return NextResponse.json({ message: "Invalid configuration data", errors: error.flatten().fieldErrors }, { status: 400 });
    }
    return NextResponse.json({ message: "Failed to create automation" }, { status: 500 });
  }
} 