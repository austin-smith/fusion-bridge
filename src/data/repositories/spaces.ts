import { db } from '@/data/db';
import { spaces, spaceDevices, devices, connectors, locations } from '@/data/db/schema';
import { eq, and, getTableColumns, exists, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Space } from '@/types';
import { DeviceType } from '@/lib/mappings/definitions';

/**
 * Organization-scoped Spaces Repository
 * Handles physical proximity groupings of devices
 */
export class SpacesRepository {
  constructor(private readonly orgId: string) {}

  /**
   * Get all spaces for the organization
   */
  async findAll() {
    return db.select({
      ...getTableColumns(spaces),
      location: {
        id: locations.id,
        name: locations.name,
        path: locations.path
      }
    })
    .from(spaces)
    .innerJoin(locations, eq(spaces.locationId, locations.id))
    .where(eq(locations.organizationId, this.orgId))
    .orderBy(spaces.name);
  }

  /**
   * Get all spaces with their device IDs for the organization
   */
  async findAllWithDevices() {
    // First get all spaces
    const spacesResult = await this.findAll();
    
    // Get device IDs for all spaces in one query
    const spaceDevicesResult = await db.select({
      spaceId: spaceDevices.spaceId,
      deviceId: spaceDevices.deviceId,
    })
    .from(spaceDevices)
    .innerJoin(spaces, eq(spaceDevices.spaceId, spaces.id))
    .innerJoin(locations, eq(spaces.locationId, locations.id))
    .innerJoin(devices, eq(spaceDevices.deviceId, devices.id))
    .innerJoin(connectors, eq(devices.connectorId, connectors.id))
    .where(eq(locations.organizationId, this.orgId));

    // Group device IDs by space ID
    const devicesBySpace = spaceDevicesResult.reduce((acc, row) => {
      if (!acc[row.spaceId]) {
        acc[row.spaceId] = [];
      }
      acc[row.spaceId].push(row.deviceId);
      return acc;
    }, {} as Record<string, string[]>);

    // Add device IDs to each space
    return spacesResult.map(space => ({
      ...space,
      deviceIds: devicesBySpace[space.id] || []
    }));
  }

  /**
   * Get space by ID (org-scoped)
   */
  async findById(id: string) {
    const result = await db.select({
      ...getTableColumns(spaces),
      location: {
        id: locations.id,
        name: locations.name,
        path: locations.path
      }
    })
    .from(spaces)
    .innerJoin(locations, eq(spaces.locationId, locations.id))
    .where(and(
      eq(spaces.id, id),
      eq(locations.organizationId, this.orgId)
    ))
    .limit(1);

    return result[0] || null;
  }

  /**
   * Get spaces by location ID (org-scoped)
   */
  async findByLocation(locationId: string) {
    return db.select({
      ...getTableColumns(spaces),
      location: {
        id: locations.id,
        name: locations.name,
        path: locations.path
      }
    })
    .from(spaces)
    .innerJoin(locations, eq(spaces.locationId, locations.id))
    .where(and(
      eq(spaces.locationId, locationId),
      eq(locations.organizationId, this.orgId)
    ))
    .orderBy(spaces.name);
  }

  /**
   * Get spaces by location ID with their device IDs (org-scoped)
   */
  async findByLocationWithDevices(locationId: string) {
    // First get spaces for the location
    const spacesResult = await this.findByLocation(locationId);
    
    // Get device IDs for these spaces
    const spaceDevicesResult = await db.select({
      spaceId: spaceDevices.spaceId,
      deviceId: spaceDevices.deviceId,
    })
    .from(spaceDevices)
    .innerJoin(spaces, eq(spaceDevices.spaceId, spaces.id))
    .innerJoin(locations, eq(spaces.locationId, locations.id))
    .innerJoin(devices, eq(spaceDevices.deviceId, devices.id))
    .innerJoin(connectors, eq(devices.connectorId, connectors.id))
    .where(and(
      eq(spaces.locationId, locationId),
      eq(locations.organizationId, this.orgId)
    ));

    // Group device IDs by space ID
    const devicesBySpace = spaceDevicesResult.reduce((acc, row) => {
      if (!acc[row.spaceId]) {
        acc[row.spaceId] = [];
      }
      acc[row.spaceId].push(row.deviceId);
      return acc;
    }, {} as Record<string, string[]>);

    // Add device IDs to each space
    return spacesResult.map(space => ({
      ...space,
      deviceIds: devicesBySpace[space.id] || []
    }));
  }

  /**
   * Create a space (org-scoped via location)
   */
  async create(data: {
    locationId: string;
    name: string;
    description?: string;
  }) {
    // Verify location belongs to organization
    const locationExists = await this.verifyLocationAccess(data.locationId);
    if (!locationExists) {
      throw new Error('Location not found or not accessible');
    }

    const result = await db.insert(spaces)
      .values({
        locationId: data.locationId,
        name: data.name,
        description: data.description || null,
      })
      .returning();

    const newSpaceId = result[0].id;

    // Return the space with location data
    return this.findById(newSpaceId);
  }

  /**
   * Update a space (org-scoped)
   */
  async update(id: string, data: {
    name?: string;
    description?: string;
    locationId?: string;
  }) {
    // If locationId is being changed, verify new location belongs to org
    if (data.locationId) {
      const locationExists = await this.verifyLocationAccess(data.locationId);
      if (!locationExists) {
        throw new Error('Location not found or not accessible');
      }
    }

    const result = await db.update(spaces)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(
        eq(spaces.id, id),
        exists(
          db.select().from(locations)
            .where(and(
              eq(locations.id, spaces.locationId),
              eq(locations.organizationId, this.orgId)
            ))
        )
      ))
      .returning();

    return result[0] || null;
  }

  /**
   * Delete a space (org-scoped)
   */
  async delete(id: string) {
    return db.delete(spaces)
      .where(and(
        eq(spaces.id, id),
        exists(
          db.select().from(locations)
            .where(and(
              eq(locations.id, spaces.locationId),
              eq(locations.organizationId, this.orgId)
            ))
        )
      ));
  }

  /**
   * Assign a device to a space (enforces one device per space)
   */
  async assignDevice(deviceId: string, spaceId: string) {
    // Verify space belongs to organization
    const spaceExists = await this.verifySpaceAccess(spaceId);
    if (!spaceExists) {
      throw new Error('Space not found or not accessible');
    }

    // Verify device belongs to organization
    const deviceExists = await this.verifyDeviceAccess(deviceId);
    if (!deviceExists) {
      throw new Error('Device not found or not accessible');
    }

    // Remove device from any existing space first (one device per space constraint)
    await db.delete(spaceDevices)
      .where(eq(spaceDevices.deviceId, deviceId));

    // Add to space
    const result = await db.insert(spaceDevices)
      .values({
        spaceId,
        deviceId,
      })
      .returning();

    return result[0];
  }

  /**
   * Remove device from space
   */
  async removeDevice(deviceId: string) {
    // Verify device belongs to organization
    const deviceExists = await this.verifyDeviceAccess(deviceId);
    if (!deviceExists) {
      throw new Error('Device not found or not accessible');
    }

    return db.delete(spaceDevices)
      .where(eq(spaceDevices.deviceId, deviceId));
  }

  /**
   * Get devices in a space (org-scoped)
   */
  async getSpaceDevices(spaceId: string) {
    // Verify space belongs to organization
    const spaceExists = await this.verifySpaceAccess(spaceId);
    if (!spaceExists) {
      throw new Error('Space not found or not accessible');
    }

    return db.select({
      ...getTableColumns(devices),
      connector: {
        id: connectors.id,
        name: connectors.name,
        category: connectors.category
      }
    })
    .from(spaceDevices)
    .innerJoin(devices, eq(spaceDevices.deviceId, devices.id))
    .innerJoin(connectors, eq(devices.connectorId, connectors.id))
    .where(and(
      eq(spaceDevices.spaceId, spaceId),
      eq(connectors.organizationId, this.orgId)
    ))
    .orderBy(devices.name);
  }

  /**
   * Get cameras that are in the same space (space-based physical proximity)
   */
  async getCamerasInSpace(spaceId: string) {
    // Verify space belongs to organization
    const spaceExists = await this.verifySpaceAccess(spaceId);
    if (!spaceExists) {
      throw new Error('Space not found or not accessible');
    }

    return db.select({
      ...getTableColumns(devices),
      connector: {
        id: connectors.id,
        name: connectors.name,
        category: connectors.category
      }
    })
    .from(spaceDevices)
    .innerJoin(devices, eq(spaceDevices.deviceId, devices.id))
    .innerJoin(connectors, eq(devices.connectorId, connectors.id))
          .where(and(
        eq(spaceDevices.spaceId, spaceId),
        eq(connectors.category, 'piko'),
        eq(devices.standardizedDeviceType, DeviceType.Camera),
        eq(connectors.organizationId, this.orgId)
      ))
    .orderBy(devices.name);
  }

  /**
   * Get space for a device (org-scoped)
   */
  async getDeviceSpace(deviceId: string) {
    // Verify device belongs to organization
    const deviceExists = await this.verifyDeviceAccess(deviceId);
    if (!deviceExists) {
      throw new Error('Device not found or not accessible');
    }

    const result = await db.select({
      ...getTableColumns(spaces),
      location: {
        id: locations.id,
        name: locations.name,
        path: locations.path
      }
    })
    .from(spaceDevices)
    .innerJoin(spaces, eq(spaceDevices.spaceId, spaces.id))
    .innerJoin(locations, eq(spaces.locationId, locations.id))
    .where(and(
      eq(spaceDevices.deviceId, deviceId),
      eq(locations.organizationId, this.orgId)
    ))
    .limit(1);

    return result[0] || null;
  }

  /**
   * Check if space exists and belongs to organization
   */
  private async verifySpaceAccess(spaceId: string): Promise<boolean> {
    const result = await db.select({ id: spaces.id })
      .from(spaces)
      .innerJoin(locations, eq(spaces.locationId, locations.id))
      .where(and(
        eq(spaces.id, spaceId),
        eq(locations.organizationId, this.orgId)
      ))
      .limit(1);
    return result.length > 0;
  }

  /**
   * Check if location exists and belongs to organization
   */
  private async verifyLocationAccess(locationId: string): Promise<boolean> {
    const result = await db.select({ id: locations.id })
      .from(locations)
      .where(and(
        eq(locations.id, locationId),
        eq(locations.organizationId, this.orgId)
      ))
      .limit(1);
    return result.length > 0;
  }

  /**
   * Check if device exists and belongs to organization
   */
  private async verifyDeviceAccess(deviceId: string): Promise<boolean> {
    const result = await db.select({ id: devices.id })
      .from(devices)
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .where(and(
        eq(devices.id, deviceId),
        eq(connectors.organizationId, this.orgId)
      ))
      .limit(1);
    return result.length > 0;
  }
}

/**
 * Create organization-scoped spaces repository
 */
export function createSpacesRepository(organizationId: string): SpacesRepository {
  return new SpacesRepository(organizationId);
} 