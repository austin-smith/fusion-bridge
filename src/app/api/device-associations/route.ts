import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { cameraAssociations, devices, connectors } from '@/data/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';

// Schema for validating the PUT request body
const updateAssociationsSchema = z.object({
  deviceId: z.string(),
  pikoCameraIds: z.array(z.string()), // Expecting an array of Piko camera device IDs
});

/**
 * GET /api/device-associations?deviceId={id} OR ?pikoCameraId={id}
 * Fetches associated device IDs.
 * - If deviceId is provided, returns an array of associated pikoCameraId strings.
 * - If pikoCameraId is provided, returns an array of associated deviceId strings.
 * Requires exactly one query parameter.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceIdParam = searchParams.get('deviceId');
  const pikoCameraId = searchParams.get('pikoCameraId');

  // Validate query parameters: exactly one must be provided
  if ((deviceIdParam && pikoCameraId) || (!deviceIdParam && !pikoCameraId)) {
    return NextResponse.json(
      { success: false, error: 'Exactly one of deviceId or pikoCameraId must be provided' },
      { status: 400 }
    );
  }

  try {
    if (deviceIdParam) {
      // First get the internal UUID for the generic device
      const device = await db
        .select({ id: devices.id })
        .from(devices)
        .where(eq(devices.deviceId, deviceIdParam))
        .limit(1);

      if (!device.length) {
        return NextResponse.json(
          { success: false, error: `Device with ID ${deviceIdParam} not found` },
          { status: 404 }
        );
      }

      // Get associations using the internal UUID
      const associations = await db
        .select({
          pikoCameraDeviceId: devices.deviceId
        })
        .from(cameraAssociations)
        .innerJoin(
          devices,
          eq(devices.id, cameraAssociations.pikoCameraId)
        )
        .where(eq(cameraAssociations.deviceId, device[0].id));
      
      const pikoCameraIds = associations.map(a => a.pikoCameraDeviceId);
      return NextResponse.json({ success: true, data: pikoCameraIds });

    } else { // pikoCameraId must be defined here due to the initial check
      // First get the internal UUID for the Piko camera
      const pikoCamera = await db
        .select({ id: devices.id })
        .from(devices)
        .where(eq(devices.deviceId, pikoCameraId!))
        .limit(1);

      if (!pikoCamera.length) {
        return NextResponse.json(
          { success: false, error: `Piko camera with ID ${pikoCameraId} not found` },
          { status: 404 }
        );
      }

      // Get associations using the internal UUID
      const associations = await db
        .select({
          associatedDeviceId: devices.deviceId
        })
        .from(cameraAssociations)
        .innerJoin(
          devices,
          eq(devices.id, cameraAssociations.deviceId)
        )
        .where(eq(cameraAssociations.pikoCameraId, pikoCamera[0].id));

      const associatedDeviceIds = associations.map(a => a.associatedDeviceId);
      return NextResponse.json({ success: true, data: associatedDeviceIds });
    }
  } catch (error: unknown) {
    console.error(`Error fetching associations (query: ${searchParams.toString()}):`, error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch device associations';
    return NextResponse.json(
      { success: false, error: 'Failed to fetch device associations' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/device-associations
 * Updates the associations for a given generic device (previously YoLink only).
 * Expects body: { deviceId: string, pikoCameraIds: string[] }
 * Deletes existing associations for the device and inserts the new ones.
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    console.log('API PUT /api/device-associations: Received body:', JSON.stringify(body)); 

    const validation = updateAssociationsSchema.safeParse(body);

    if (!validation.success) {
      console.error('API PUT Validation Error:', validation.error.format());
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: validation.error.format() },
        { status: 400 }
      );
    }

    // Assign validated data using the new name
    const { deviceId, pikoCameraIds } = validation.data;
    console.log(`API PUT Validated: deviceId=${deviceId}, pikoCameraIds=[${pikoCameraIds.join(', ')}]`);

    // First get the internal UUID for the generic device
    const genericDevice = await db
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.deviceId, deviceId))
      .limit(1);

    if (!genericDevice.length) {
      console.error(`API PUT Error: Device ${deviceId} not found.`);
      return NextResponse.json(
        { success: false, error: `Device with ID ${deviceId} not found` },
        { status: 404 }
      );
    }

    // Get internal UUIDs for all Piko cameras
    const pikoCameras = await db
      .select({ id: devices.id })
      .from(devices)
      .innerJoin(
        connectors,
        eq(devices.connectorId, connectors.id)
      )
      .where(and(
        eq(connectors.category, 'piko'),
        inArray(devices.deviceId, pikoCameraIds)
      ));

    if (pikoCameras.length !== pikoCameraIds.length) {
      const foundCameraExternalIds = pikoCameras.map(async (pc) => {
          const foundDevice = await db.select({deviceId: devices.deviceId}).from(devices).where(eq(devices.id, pc.id)).limit(1);
          return foundDevice[0]?.deviceId;
      });
      const resolvedFoundCameraExternalIds = (await Promise.all(foundCameraExternalIds)).filter(id => !!id);
      const missingIds = pikoCameraIds.filter(id => !resolvedFoundCameraExternalIds.includes(id));
      return NextResponse.json(
        { success: false, error: `Some Piko cameras not found: ${missingIds.join(', ')}` },
        { status: 404 }
      );
    }

    // --- Perform Update (Delete then Insert) ---
    console.log(`API PUT: Deleting existing associations for ${deviceId}...`);
    const deleteResult = await db
      .delete(cameraAssociations)
      .where(eq(cameraAssociations.deviceId, genericDevice[0].id));
    console.log('API PUT: Deletion result:', deleteResult);

    // 2. Insert new associations if any are provided
    if (pikoCameraIds.length > 0) {
      const newAssociationData = pikoCameras.map(pikoCamera => ({
        deviceId: genericDevice[0].id,
        pikoCameraId: pikoCamera.id,
      }));
      console.log(`API PUT: Inserting ${newAssociationData.length} new associations...`);
      const insertResult = await db.insert(cameraAssociations).values(newAssociationData);
      console.log('API PUT: Insertion result:', insertResult);
    } else {
      console.log(`API PUT: No new associations to insert.`);
    }

    console.log(`API PUT: Successfully updated associations.`);
    return NextResponse.json({ success: true, message: `Associations updated for ${deviceId}` });

  } catch (error: unknown) {
    console.error('API PUT Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update device associations';
    return NextResponse.json(
      { success: false, error: 'Failed to update device associations' },
      { status: 500 }
    );
  }
} 