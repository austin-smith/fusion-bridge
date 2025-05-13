import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/data/db';
import { automations } from '@/data/db/schema';
import { AutomationConfigSchema } from '@/lib/automation-schemas';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';

// Schema for validating the PUT request body
const PutBodySchema = z.object({
    name: z.string().min(1, { message: "Name is required" }).optional(),
    enabled: z.boolean().optional(),
    config: AutomationConfigSchema.optional(),
    locationScopeId: z.string().uuid().nullable().optional(), // Add optional, nullable locationScopeId
}).refine(data => Object.keys(data).length > 0, { 
    message: "At least one field must be provided for update"
});

/**
 * GET /api/automations/{id}
 * Fetches a specific automation configuration by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ message: "Automation ID is required" }, { status: 400 });
    }

    // Select core automation fields
    const result = await db
      .select({
        id: automations.id,
        name: automations.name,
        enabled: automations.enabled,
        configJson: automations.configJson,
        createdAt: automations.createdAt,
        updatedAt: automations.updatedAt,
        locationScopeId: automations.locationScopeId,
      })
      .from(automations)
      .where(eq(automations.id, id))
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
 * Updates a specific connector-agnostic automation configuration.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ message: "Automation ID is required" }, { status: 400 });
    }

    const body = await request.json();
    const validationResult = PutBodySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ message: "Invalid request body", errors: validationResult.error.flatten().fieldErrors }, { status: 400 });
    }
    
    // Check if automation exists
    const [existing] = await db.select({ id: automations.id }).from(automations).where(eq(automations.id, id)).limit(1);
    if (!existing) {
      return NextResponse.json({ message: "Automation not found" }, { status: 404 });
    }

    // Extract validated data
    const updateData = validationResult.data;
    
    // Construct the update object, explicitly including nullable locationScopeId
    const updatePayload: Partial<typeof automations.$inferInsert> = {};
    if (updateData.name !== undefined) updatePayload.name = updateData.name;
    if (updateData.enabled !== undefined) updatePayload.enabled = updateData.enabled;
    if (updateData.config !== undefined) updatePayload.configJson = updateData.config;
    // Handle locationScopeId explicitly to allow setting it to null
    if ('locationScopeId' in updateData) { 
      updatePayload.locationScopeId = updateData.locationScopeId;
    }
    
    // Add updatedAt timestamp
    updatePayload.updatedAt = new Date();

    const [updatedAutomation] = await db
      .update(automations)
      .set(updatePayload)
      .where(eq(automations.id, id))
      .returning();
      
    // Fetch and return the full updated record including locationScopeId
    const result = await db
      .select({
        id: automations.id,
        name: automations.name,
        enabled: automations.enabled,
        createdAt: automations.createdAt,
        updatedAt: automations.updatedAt,
        configJson: automations.configJson,
        locationScopeId: automations.locationScopeId,
      })
      .from(automations)
      .where(eq(automations.id, updatedAutomation.id))
      .limit(1);

    return NextResponse.json(result[0]);

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ message: "Automation ID is required" }, { status: 400 });
    }

    // Check if automation exists before deleting
    const [existing] = await db.select({ id: automations.id }).from(automations).where(eq(automations.id, id)).limit(1);
    if (!existing) {
      return NextResponse.json({ message: "Automation not found" }, { status: 404 });
    }

    await db.delete(automations).where(eq(automations.id, id));

    return NextResponse.json({ message: "Automation deleted successfully" }, { status: 200 });

  } catch (error) {
    console.error(`Failed to delete automation:`, error);
    return NextResponse.json({ message: "Failed to delete automation" }, { status: 500 });
  }
} 