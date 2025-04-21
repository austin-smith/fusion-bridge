import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { nodes } from '@/data/db/schema';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

// Schema for node update
const updateNodeSchema = z.object({
  category: z.string().optional(),
  name: z.string().optional(),
  config: z.record(z.any()).optional(),
  yolinkHomeId: z.string().optional(),
  eventsEnabled: z.boolean().optional(),
});

// GET a single node
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const node = await db.select().from(nodes).where(eq(nodes.id, id));
    
    if (!node.length) {
      return NextResponse.json(
        { success: false, error: 'Node not found' },
        { status: 404 }
      );
    }
    
    // Parse the config from JSON string
    const nodeWithConfig = {
      ...node[0],
      config: JSON.parse(node[0].cfg_enc)
    };
    
    return NextResponse.json({ success: true, data: nodeWithConfig });
  } catch (error) {
    console.error('Error fetching node:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch node' },
      { status: 500 }
    );
  }
}

// PUT (update) a node
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    
    // Validate input
    const result = updateNodeSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid update data', details: result.error.format() },
        { status: 400 }
      );
    }
    
    // Check if node exists
    const existingNode = await db.select().from(nodes).where(eq(nodes.id, id));
    if (!existingNode.length) {
      return NextResponse.json(
        { success: false, error: 'Node not found' },
        { status: 404 }
      );
    }
    
    // Prepare update data
    const updateData: Partial<typeof nodes.$inferSelect> = {};
    const { category, name, config, yolinkHomeId, eventsEnabled } = result.data;
    
    if (category !== undefined) updateData.category = category;
    if (name !== undefined) updateData.name = name;
    if (yolinkHomeId !== undefined) updateData.yolinkHomeId = yolinkHomeId;
    if (eventsEnabled !== undefined) updateData.eventsEnabled = eventsEnabled;
    
    // If config is provided, store as JSON string
    if (config !== undefined) {
      updateData.cfg_enc = JSON.stringify(config);
    }
    
    // Update the node
    const updatedNode = await db
      .update(nodes)
      .set(updateData)
      .where(eq(nodes.id, id))
      .returning();
    
    // Return with parsed config
    const returnNode = {
      ...updatedNode[0],
      config: JSON.parse(updatedNode[0].cfg_enc)
    };
    
    return NextResponse.json({ success: true, data: returnNode });
  } catch (error) {
    console.error('Error updating node:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update node' },
      { status: 500 }
    );
  }
}

// DELETE a node
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    
    // Check if node exists
    const existingNode = await db.select().from(nodes).where(eq(nodes.id, id));
    if (!existingNode.length) {
      return NextResponse.json(
        { success: false, error: 'Node not found' },
        { status: 404 }
      );
    }
    
    // Delete the node
    await db.delete(nodes).where(eq(nodes.id, id));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting node:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete node' },
      { status: 500 }
    );
  }
} 