import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/data/db';
import { automations } from '@/data/db/schema';
import { AutomationConfigSchema } from '@/lib/automation-schemas';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';

// Validation schema uses the updated AutomationConfigSchema implicitly
const PutBodySchema = z.object({
    name: z.string().min(1, { message: "Name is required" }),
    enabled: z.boolean().optional(), 
    config: AutomationConfigSchema, 
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

    // Select core automation fields
    const result = await db
      .select({
        id: automations.id,
        name: automations.name,
        enabled: automations.enabled,
        configJson: automations.configJson,
        createdAt: automations.createdAt,
        updatedAt: automations.updatedAt,
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
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json();

    const validationResult = PutBodySchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ message: "Invalid request body", errors: validationResult.error.flatten().fieldErrors }, { status: 400 });
    }

    const { name, enabled, config } = validationResult.data;
    
    // Update the automation record
    const updatedAutomation = await db
      .update(automations)
      .set({
        name: name,
        enabled: enabled,
        configJson: config,
        updatedAt: sql`(unixepoch('now', 'subsec') * 1000)`,
      })
      .where(eq(automations.id, id))
      .returning();

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
  request: Request,
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

    return new NextResponse(null, { status: 204 });

  } catch (error) {
    console.error(`Failed to delete automation:`, error);
    return NextResponse.json({ message: "Failed to delete automation" }, { status: 500 });
  }
} 