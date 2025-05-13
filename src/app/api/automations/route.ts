import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { automations } from '@/data/db/schema';
import { AutomationConfigSchema } from '@/lib/automation-schemas';
import { z } from 'zod';

// Schema for validating the POST request body
const PostBodySchema = z.object({
    name: z.string().min(1, { message: "Name is required" }),
    enabled: z.boolean().optional().default(true),
    config: AutomationConfigSchema,
    locationScopeId: z.string().uuid().nullable().optional(),
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
        createdAt: automations.createdAt,
        updatedAt: automations.updatedAt,
        configJson: automations.configJson,
        locationScopeId: automations.locationScopeId,
      })
      .from(automations);

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
    
    const { name, enabled, config, locationScopeId } = validationResult.data;

    const newAutomation = await db.insert(automations).values({
      name: name,
      enabled: enabled,
      configJson: config,
      locationScopeId: locationScopeId,
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