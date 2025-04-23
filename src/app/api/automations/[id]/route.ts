import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/data/db';
import { automations, nodes } from '@/data/db/schema';
import { AutomationConfigSchema } from '@/lib/automation-schemas';
import { z } from 'zod';
import { eq, sql, and } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

// Re-use the schema from the POST route for PUT validation
// Ensures the entire configuration is provided on update
const PutBodySchema = z.object({
    name: z.string().min(1, { message: "Name is required" }),
    sourceNodeId: z.string().uuid({ message: "Invalid source node ID" }),
    enabled: z.boolean().optional(), // Make optional for PUT
    config: AutomationConfigSchema, // Validate the nested config object
});

/**
 * GET /api/automations/{id}
 * Fetches a specific automation configuration by ID.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // Fetch automation and join with nodes to get names directly
    // Use aliases for joining the same table twice
    const sourceNodeAlias = alias(nodes, "sourceNode");

    const result = await db
      .select({
        id: automations.id,
        name: automations.name,
        enabled: automations.enabled,
        sourceNodeId: automations.sourceNodeId,
        configJson: automations.configJson,
        createdAt: automations.createdAt,
        updatedAt: automations.updatedAt,
        sourceNodeName: sourceNodeAlias.name,
      })
      .from(automations)
      .where(eq(automations.id, id))
      .leftJoin(sourceNodeAlias, eq(automations.sourceNodeId, sourceNodeAlias.id))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json({ message: "Automation not found" }, { status: 404 });
    }

    return NextResponse.json(result[0]);

  } catch (error) {
    console.error(`Failed to fetch automation:`, error);
    return NextResponse.json({ message: "Failed to fetch automation" }, { status: 500 });
  }
}

/**
 * PUT /api/automations/{id}
 * Updates a specific automation configuration.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json();

    // Validate request body
    const validationResult = PutBodySchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ message: "Invalid request body", errors: validationResult.error.flatten().fieldErrors }, { status: 400 });
    }

    const { name, sourceNodeId, enabled, config } = validationResult.data;

    // TODO: Optional - Validate that sourceNodeId exists?

    // Update the record
    const updatedAutomation = await db
      .update(automations)
      .set({
        name: name,
        sourceNodeId: sourceNodeId,
        enabled: enabled, // Use validated value (could be undefined if optional allows)
        configJson: config,
        updatedAt: sql`(unixepoch('now', 'subsec') * 1000)`, // Manually update timestamp
      })
      .where(eq(automations.id, id))
      .returning(); // Return the updated record

    if (!updatedAutomation || updatedAutomation.length === 0) {
      return NextResponse.json({ message: "Automation not found or failed to update" }, { status: 404 });
    }

    return NextResponse.json(updatedAutomation[0]);

  } catch (error) {
    console.error(`Failed to update automation:`, error);
    if (error instanceof z.ZodError) {
       return NextResponse.json({ message: "Invalid configuration data", errors: error.flatten().fieldErrors }, { status: 400 });
    }
    return NextResponse.json({ message: "Failed to update automation" }, { status: 500 });
  }
}

/**
 * DELETE /api/automations/{id}
 * Deletes a specific automation configuration.
 */
export async function DELETE(
  request: Request, // Assuming request might be needed later, keep it
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const deleted = await db
        .delete(automations)
        .where(eq(automations.id, id))
        .returning({ deletedId: automations.id });

    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ message: "Automation not found" }, { status: 404 });
    }

    // Return 204 No Content for successful deletion
    return new NextResponse(null, { status: 204 });

  } catch (error) {
    console.error(`Failed to delete automation:`, error);
    // Handle potential foreign key constraints if they exist and cause errors
    return NextResponse.json({ message: "Failed to delete automation" }, { status: 500 });
  }
} 