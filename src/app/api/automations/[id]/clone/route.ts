import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/data/db';
import { automations } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import type { AutomationConfig } from '@/lib/automation-schemas';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const originalId = resolvedParams.id;

  if (!originalId) {
    return NextResponse.json({ message: 'Automation ID is required' }, { status: 400 });
  }

  try {
    // 1. Fetch the original automation
    const originalAutomation = await db.query.automations.findFirst({
      where: eq(automations.id, originalId),
    });

    if (!originalAutomation) {
      return NextResponse.json({ message: 'Automation not found' }, { status: 404 });
    }

    // 2. Prepare the new automation data
    // Ensure a deep copy of configJson
    const newConfigJson = JSON.parse(JSON.stringify(originalAutomation.configJson)) as AutomationConfig;
    
    const newAutomationData = {
      name: `${originalAutomation.name} (Copy)`,
      enabled: false, // Cloned automations are disabled by default
      configJson: newConfigJson,
      locationScopeId: originalAutomation.locationScopeId, // Retain location scope
      // id, createdAt, updatedAt will be handled by the database/Drizzle default functions
    };

    // 3. Insert the new automation
    // Drizzle's insert().values().returning() is convenient if your driver supports it.
    // For SQLite with Drizzle Kit, it might be simpler to insert and then query if needed,
    // or rely on the fact that a new UUID will be generated.
    // The `returning()` method will give us the inserted record, including the new ID.
    const inserted = await db.insert(automations).values(newAutomationData).returning();
    
    if (!inserted || inserted.length === 0) {
        throw new Error("Failed to insert the cloned automation.");
    }

    const newAutomation = inserted[0];

    return NextResponse.json(newAutomation, { status: 201 });

  } catch (error) {
    console.error('Failed to clone automation:', error);
    let errorMessage = 'Internal server error';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return NextResponse.json({ message: 'Failed to clone automation', error: errorMessage }, { status: 500 });
  }
} 