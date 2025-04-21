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
    targetNodeId: z.string().uuid({ message: "Invalid target node ID" }),
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
        // Select specific fields to avoid exposing too much
        id: automations.id,
        name: automations.name,
        enabled: automations.enabled,
        sourceNodeId: automations.sourceNodeId,
        targetNodeId: automations.targetNodeId,
        createdAt: automations.createdAt,
        updatedAt: automations.updatedAt,
        configJson: automations.configJson,
        // Optionally join with nodes to get names
        sourceNodeName: nodes.name,
        targetNodeName: nodes.name, // Needs alias to differentiate
      })
      .from(automations)
      .leftJoin(nodes, eq(automations.sourceNodeId, nodes.id))
      // How to join the target node and alias its name?
      // Drizzle syntax for joining the same table twice with aliases might be complex.
      // For now, just fetch IDs. UI can fetch node details separately if needed.
      // .leftJoin(nodes as TargetNodesAlias, eq(automations.targetNodeId, TargetNodesAlias.id))
      ;

    // Fetch target node names separately for simplicity for now
    const targetNodeIds = allAutomations.map(a => a.targetNodeId);
    let targetNodesMap: Record<string, string> = {};
    if (targetNodeIds.length > 0) {
        const targetNodes = await db.select({ id: nodes.id, name: nodes.name}).from(nodes).where(inArray(nodes.id, targetNodeIds));
        targetNodesMap = targetNodes.reduce((acc, node) => {
            acc[node.id] = node.name;
            return acc;
        }, {} as Record<string, string>);
    }

    const results = allAutomations.map(a => ({
        ...a,
        // Map source node name correctly (from the first join)
        sourceNodeName: a.sourceNodeName,
        // Add target node name from the separate query
        targetNodeName: targetNodesMap[a.targetNodeId] || null
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
    
    const { name, sourceNodeId, targetNodeId, enabled, config } = validationResult.data;

    // TODO: Optional - Validate that sourceNodeId and targetNodeId actually exist in the nodes table?

    // Insert into database
    const newAutomation = await db.insert(automations).values({
      name: name,
      sourceNodeId: sourceNodeId,
      targetNodeId: targetNodeId,
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