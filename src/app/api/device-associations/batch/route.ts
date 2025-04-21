import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { cameraAssociations, devices, nodes } from '@/data/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';

// Schema for a single update item
const singleUpdateSchema = z.object({
  deviceId: z.string(), // External device ID 
  pikoCameraIds: z.array(z.string()), // Array of external Piko camera device IDs
});

// Schema for the batch update request body
const batchUpdateSchema = z.object({
  updates: z.array(singleUpdateSchema),
});

/**
 * PUT /api/device-associations/batch
 * Updates associations for multiple devices in a single request.
 * Expects body: { updates: [{ deviceId: string, pikoCameraIds: string[] }, ...] }
 * For each item in updates, deletes existing associations for the deviceId and inserts the new ones.
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    console.log('API BATCH PUT /api/device-associations/batch: Received body:', JSON.stringify(body));

    const validation = batchUpdateSchema.safeParse(body);

    if (!validation.success) {
      console.error('API BATCH PUT Validation Error:', validation.error.format());
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { updates } = validation.data;

    if (!updates || updates.length === 0) {
        return NextResponse.json({ success: true, message: 'No updates provided.' });
    }
    
    // --- Perform Updates within a Transaction (if possible) ---
    // Note: Drizzle doesn't have built-in transaction support for all drivers in the same way.
    // We'll perform operations sequentially and rely on error handling. 
    // For critical applications, consider database-level transactions or a more robust ORM feature.

    let errors: { deviceId: string, error: string }[] = [];
    let successCount = 0;

    for (const update of updates) {
      const { deviceId, pikoCameraIds } = update;
      try {
        // 1. Get internal ID for the primary device
        const genericDevice = await db
          .select({ id: devices.id })
          .from(devices)
          .where(eq(devices.deviceId, deviceId))
          .limit(1);

        if (!genericDevice.length) {
          throw new Error(`Device with ID ${deviceId} not found`);
        }
        const internalDeviceId = genericDevice[0].id;

        // 2. Get internal IDs for all provided Piko cameras
        let internalPikoCameraIds: string[] = [];
        if (pikoCameraIds.length > 0) {
            const pikoCameras = await db
              .select({ id: devices.id, deviceId: devices.deviceId }) // Select external ID too for error reporting
              .from(devices)
              .innerJoin(nodes, eq(devices.connectorId, nodes.id))
              .where(and(
                eq(nodes.category, 'piko'),
                inArray(devices.deviceId, pikoCameraIds)
              ));

            const foundExternalIds = new Set(pikoCameras.map(pc => pc.deviceId));
            const missingIds = pikoCameraIds.filter(id => !foundExternalIds.has(id));

            if (missingIds.length > 0) {
              throw new Error(`Some Piko cameras not found: ${missingIds.join(', ')}`);
            }
            internalPikoCameraIds = pikoCameras.map(pc => pc.id);
        }
        
        // 3. Delete existing associations for this device
        await db
          .delete(cameraAssociations)
          .where(eq(cameraAssociations.deviceId, internalDeviceId));

        // 4. Insert new associations if any are provided
        if (internalPikoCameraIds.length > 0) {
          const newAssociationData = internalPikoCameraIds.map(pikoCameraInternalId => ({
            deviceId: internalDeviceId,
            pikoCameraId: pikoCameraInternalId,
          }));
          await db.insert(cameraAssociations).values(newAssociationData);
        }
        successCount++;
        console.log(`API BATCH PUT: Successfully processed update for ${deviceId}`);

      } catch (error: any) {
        console.error(`API BATCH PUT Error processing update for ${deviceId}:`, error);
        errors.push({ deviceId: deviceId, error: error.message || 'Unknown processing error' });
        // Continue processing other updates even if one fails
      }
    } // End loop through updates

    // --- Report Results ---
    if (errors.length > 0) {
      // Partial success or complete failure
      return NextResponse.json(
        { 
          success: false, 
          message: `Processed ${successCount} updates successfully, ${errors.length} failed.`,
          errors: errors 
        },
        { status: errors.length === updates.length ? 500 : 207 } // 207 Multi-Status if partially successful
      );
    } else {
      // Complete success
      console.log(`API BATCH PUT: Successfully processed all ${successCount} updates.`);
      return NextResponse.json({ success: true, message: `Successfully processed all ${successCount} updates.` });
    }

  } catch (error: any) {
    // Catch potential errors like JSON parsing issues before the loop
    console.error('API BATCH PUT Top-Level Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process batch update request' },
      { status: 500 }
    );
  }
} 