import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { db } from '@/data/db';
import { devices, cameraAssociations, connectors } from '@/data/db/schema';
import { eq, inArray, and } from 'drizzle-orm';
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
export const GET = withOrganizationAuth(async (request, authContext: OrganizationAuthContext) => {
  const { searchParams } = new URL(request.url);
  const deviceIdParam = searchParams.get('deviceId');
  const pikoCameraId = searchParams.get('pikoCameraId');
  const category = searchParams.get('category') || 'unknown';

  if (!deviceIdParam && !pikoCameraId) {
    return NextResponse.json(
      { success: false, error: 'Either deviceId or pikoCameraId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const orgDb = createOrgScopedDb(authContext.organizationId);

    if (deviceIdParam) {
      // Find associations for a generic device (organization-scoped)
      const deviceResult = await orgDb.devices.findByExternalId(deviceIdParam);
      
      if (deviceResult.length === 0) {
        return NextResponse.json(
          { success: false, error: `Device with ID ${deviceIdParam} not found` },
          { status: 404 }
        );
      }

      const device = deviceResult[0];
      
      // Get associations using organization-scoped method
      const associations = await orgDb.devices.findAssociations(device.id, category);
      
      const associatedDeviceIds = associations.map(a => a.deviceId);
      return NextResponse.json({ success: true, data: associatedDeviceIds });

    } else { // pikoCameraId must be defined here due to the initial check
      // Find associations for a Piko camera (organization-scoped)
      const pikoCameraResult = await orgDb.devices.findByExternalId(pikoCameraId!);
      
      if (pikoCameraResult.length === 0) {
        return NextResponse.json(
          { success: false, error: `Piko camera with ID ${pikoCameraId} not found` },
          { status: 404 }
        );
      }

      const pikoCamera = pikoCameraResult[0];
      
      // Get associations using organization-scoped method
      const associations = await orgDb.devices.findAssociations(pikoCamera.id, 'piko');
      
      const associatedDeviceIds = associations.map(a => a.deviceId);
      return NextResponse.json({ success: true, data: associatedDeviceIds });
    }
  } catch (error) {
    console.error(`Error fetching associations (deviceId: ${deviceIdParam}, pikoCameraId: ${pikoCameraId}):`, error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch device associations';
    return NextResponse.json(
      { success: false, error: 'Failed to fetch device associations' },
      { status: 500 }
    );
  }
});

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