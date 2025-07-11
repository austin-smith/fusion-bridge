import { db } from '@/data/db';
import { 
  alarmZones, 
  alarmZoneDevices, 
  alarmZoneTriggerOverrides, 
  alarmZoneAuditLog,
  devices, 
  connectors, 
  locations 
} from '@/data/db/schema';
import { eq, and, getTableColumns, exists, desc, inArray } from 'drizzle-orm';
import type { AlarmZone, AlarmZoneTriggerOverride, AlarmZoneAuditLogEntry } from '@/types';
import { ArmedState } from '@/lib/mappings/definitions';

/**
 * Organization-scoped Alarm Zones Repository
 * Handles security alarm groupings and state management
 */
export class AlarmZonesRepository {
  constructor(private readonly orgId: string) {}

  /**
   * Get all alarm zones for the organization
   */
  async findAll() {
    return db.select({
      ...getTableColumns(alarmZones),
      location: {
        id: locations.id,
        name: locations.name,
        path: locations.path
      }
    })
    .from(alarmZones)
    .innerJoin(locations, eq(alarmZones.locationId, locations.id))
    .where(eq(locations.organizationId, this.orgId))
    .orderBy(alarmZones.name);
  }

  /**
   * Get alarm zone by ID (org-scoped)
   */
  async findById(id: string) {
    const result = await db.select({
      ...getTableColumns(alarmZones),
      location: {
        id: locations.id,
        name: locations.name,
        path: locations.path
      }
    })
    .from(alarmZones)
    .innerJoin(locations, eq(alarmZones.locationId, locations.id))
    .where(and(
      eq(alarmZones.id, id),
      eq(locations.organizationId, this.orgId)
    ))
    .limit(1);

    return result[0] || null;
  }

  /**
   * Get alarm zones by location ID (org-scoped)
   */
  async findByLocation(locationId: string) {
    return db.select({
      ...getTableColumns(alarmZones),
      location: {
        id: locations.id,
        name: locations.name,
        path: locations.path
      }
    })
    .from(alarmZones)
    .innerJoin(locations, eq(alarmZones.locationId, locations.id))
    .where(and(
      eq(alarmZones.locationId, locationId),
      eq(locations.organizationId, this.orgId)
    ))
    .orderBy(alarmZones.name);
  }

  /**
   * Create an alarm zone (org-scoped via location)
   */
  async create(data: {
    locationId: string;
    name: string;
    description?: string;
    triggerBehavior?: 'standard' | 'custom';
  }) {
    // Verify location belongs to organization
    const locationExists = await this.verifyLocationAccess(data.locationId);
    if (!locationExists) {
      throw new Error('Location not found or not accessible');
    }

    const result = await db.insert(alarmZones)
      .values({
        locationId: data.locationId,
        name: data.name,
        description: data.description || null,
        triggerBehavior: data.triggerBehavior || 'standard',
        armedState: ArmedState.DISARMED,
      })
      .returning();

    const newZoneId = result[0].id;

    // Return the zone with location data
    return this.findById(newZoneId);
  }

  /**
   * Update an alarm zone (org-scoped)
   */
  async update(id: string, data: {
    name?: string;
    description?: string;
    triggerBehavior?: 'standard' | 'custom';
    locationId?: string;
  }) {
    // If locationId is being changed, verify new location belongs to org
    if (data.locationId) {
      const locationExists = await this.verifyLocationAccess(data.locationId);
      if (!locationExists) {
        throw new Error('Location not found or not accessible');
      }
    }

    const result = await db.update(alarmZones)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(
        eq(alarmZones.id, id),
        exists(
          db.select().from(locations)
            .where(and(
              eq(locations.id, alarmZones.locationId),
              eq(locations.organizationId, this.orgId)
            ))
        )
      ))
      .returning();

    return result[0] || null;
  }

  /**
   * Delete an alarm zone (org-scoped)
   */
  async delete(id: string) {
    return db.delete(alarmZones)
      .where(and(
        eq(alarmZones.id, id),
        exists(
          db.select().from(locations)
            .where(and(
              eq(locations.id, alarmZones.locationId),
              eq(locations.organizationId, this.orgId)
            ))
        )
      ));
  }

  /**
   * Assign devices to an alarm zone (enforces one device per zone)
   */
  async assignDevices(zoneId: string, deviceIds: string[]) {
    if (deviceIds.length === 0) {
      return [];
    }

    // Verify zone belongs to organization
    const zoneExists = await this.verifyZoneAccess(zoneId);
    if (!zoneExists) {
      throw new Error('Alarm zone not found or not accessible');
    }

    // Verify all devices belong to organization
    for (const deviceId of deviceIds) {
      const deviceExists = await this.verifyDeviceAccess(deviceId);
      if (!deviceExists) {
        throw new Error(`Device ${deviceId} not found or not accessible`);
      }
    }

    // Remove devices from any existing zones first (one device per zone constraint)
    await db.delete(alarmZoneDevices)
      .where(inArray(alarmZoneDevices.deviceId, deviceIds));

    // Add devices to zone
    const values = deviceIds.map(deviceId => ({
      zoneId,
      deviceId,
    }));

    const result = await db.insert(alarmZoneDevices)
      .values(values)
      .returning();

    return result;
  }

  /**
   * Remove devices from an alarm zone
   */
  async removeDevices(zoneId: string, deviceIds: string[]) {
    if (deviceIds.length === 0) {
      return;
    }

    // Verify zone belongs to organization
    const zoneExists = await this.verifyZoneAccess(zoneId);
    if (!zoneExists) {
      throw new Error('Alarm zone not found or not accessible');
    }

    return db.delete(alarmZoneDevices)
      .where(and(
        eq(alarmZoneDevices.zoneId, zoneId),
        inArray(alarmZoneDevices.deviceId, deviceIds)
      ));
  }

  /**
   * Get devices in an alarm zone (org-scoped)
   */
  async getZoneDevices(zoneId: string) {
    // Verify zone belongs to organization
    const zoneExists = await this.verifyZoneAccess(zoneId);
    if (!zoneExists) {
      throw new Error('Alarm zone not found or not accessible');
    }

    return db.select({
      ...getTableColumns(devices),
      connector: {
        id: connectors.id,
        name: connectors.name,
        category: connectors.category
      }
    })
    .from(alarmZoneDevices)
    .innerJoin(devices, eq(alarmZoneDevices.deviceId, devices.id))
    .innerJoin(connectors, eq(devices.connectorId, connectors.id))
    .where(and(
      eq(alarmZoneDevices.zoneId, zoneId),
      eq(connectors.organizationId, this.orgId)
    ))
    .orderBy(devices.name);
  }

  /**
   * Set armed state for an alarm zone with audit logging
   */
  async setArmedState(
    zoneId: string, 
    newState: ArmedState, 
    userId?: string, 
    reason?: string, 
    metadata?: Record<string, any>,
    triggerEventId?: string
  ) {
    // Verify zone belongs to organization
    const zoneExists = await this.verifyZoneAccess(zoneId);
    if (!zoneExists) {
      throw new Error('Alarm zone not found or not accessible');
    }

    // Get current state for audit log
    const currentZone = await this.findById(zoneId);
    if (!currentZone) {
      throw new Error('Alarm zone not found');
    }

    const previousState = currentZone.armedState;

    // Update zone state
    const result = await db.update(alarmZones)
      .set({
        armedState: newState,
        lastArmedStateChangeReason: reason || null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(alarmZones.id, zoneId),
        exists(
          db.select().from(locations)
            .where(and(
              eq(locations.id, alarmZones.locationId),
              eq(locations.organizationId, this.orgId)
            ))
        )
      ))
      .returning();

    // Create audit log entry
    await this.createAuditLogEntry({
      zoneId,
      userId: userId || null,
      action: this.getActionFromState(newState),
      previousState,
      newState,
      reason: reason || null,
      triggerEventId: triggerEventId || null,
      metadata: metadata || null,
    });

    return result[0] || null;
  }

  /**
   * Add or update a trigger override for custom zones
   */
  async addTriggerOverride(zoneId: string, eventType: string, shouldTrigger: boolean) {
    // Verify zone belongs to organization
    const zoneExists = await this.verifyZoneAccess(zoneId);
    if (!zoneExists) {
      throw new Error('Alarm zone not found or not accessible');
    }

    const result = await db.insert(alarmZoneTriggerOverrides)
      .values({
        zoneId,
        eventType,
        shouldTrigger,
      })
      .onConflictDoUpdate({
        target: [alarmZoneTriggerOverrides.zoneId, alarmZoneTriggerOverrides.eventType],
        set: {
          shouldTrigger,
          createdAt: new Date(), // Update timestamp
        }
      })
      .returning();

    return result[0];
  }

  /**
   * Remove a trigger override
   */
  async removeTriggerOverride(zoneId: string, eventType: string) {
    // Verify zone belongs to organization
    const zoneExists = await this.verifyZoneAccess(zoneId);
    if (!zoneExists) {
      throw new Error('Alarm zone not found or not accessible');
    }

    return db.delete(alarmZoneTriggerOverrides)
      .where(and(
        eq(alarmZoneTriggerOverrides.zoneId, zoneId),
        eq(alarmZoneTriggerOverrides.eventType, eventType)
      ));
  }

  /**
   * Get trigger overrides for a zone
   */
  async getTriggerOverrides(zoneId: string) {
    // Verify zone belongs to organization
    const zoneExists = await this.verifyZoneAccess(zoneId);
    if (!zoneExists) {
      throw new Error('Alarm zone not found or not accessible');
    }

    return db.select()
      .from(alarmZoneTriggerOverrides)
      .where(eq(alarmZoneTriggerOverrides.zoneId, zoneId))
      .orderBy(alarmZoneTriggerOverrides.eventType);
  }

  /**
   * Get audit log for a zone
   */
  async getZoneAuditLog(zoneId: string, limit: number = 100, offset: number = 0) {
    // Verify zone belongs to organization
    const zoneExists = await this.verifyZoneAccess(zoneId);
    if (!zoneExists) {
      throw new Error('Alarm zone not found or not accessible');
    }

    return db.select({
      ...getTableColumns(alarmZoneAuditLog),
      zone: {
        id: alarmZones.id,
        name: alarmZones.name
      },
      user: {
        id: alarmZoneAuditLog.userId,
        // Could join with user table here for name/email if needed
      }
    })
    .from(alarmZoneAuditLog)
    .leftJoin(alarmZones, eq(alarmZoneAuditLog.zoneId, alarmZones.id))
    .where(eq(alarmZoneAuditLog.zoneId, zoneId))
    .orderBy(desc(alarmZoneAuditLog.createdAt))
    .limit(limit)
    .offset(offset);
  }

  /**
   * Get the alarm zone for a specific device (one device per zone)
   */
  async getDeviceZone(deviceId: string) {
    // Verify device belongs to organization
    const deviceExists = await this.verifyDeviceAccess(deviceId);
    if (!deviceExists) {
      throw new Error('Device not found or not accessible');
    }

    const result = await db.select({
      ...getTableColumns(alarmZones),
      location: {
        id: locations.id,
        name: locations.name,
        path: locations.path
      }
    })
    .from(alarmZoneDevices)
    .innerJoin(alarmZones, eq(alarmZoneDevices.zoneId, alarmZones.id))
    .innerJoin(locations, eq(alarmZones.locationId, locations.id))
    .where(and(
      eq(alarmZoneDevices.deviceId, deviceId),
      eq(locations.organizationId, this.orgId)
    ))
    .limit(1);

    return result[0] || null;
  }

  /**
   * Create audit log entry
   */
  private async createAuditLogEntry(data: {
    zoneId: string;
    userId?: string | null;
    action: 'armed' | 'disarmed' | 'triggered' | 'acknowledged';
    previousState?: ArmedState | null;
    newState?: ArmedState | null;
    reason?: string | null;
    triggerEventId?: string | null;
    metadata?: Record<string, any> | null;
  }) {
    return db.insert(alarmZoneAuditLog)
      .values({
        zoneId: data.zoneId,
        userId: data.userId || null,
        action: data.action,
        previousState: data.previousState || null,
        newState: data.newState || null,
        reason: data.reason || null,
        triggerEventId: data.triggerEventId || null,
        metadata: data.metadata || null,
      })
      .returning();
  }

  /**
   * Convert armed state to audit log action
   */
  private getActionFromState(state: ArmedState): 'armed' | 'disarmed' | 'triggered' | 'acknowledged' {
    switch (state) {
      case ArmedState.ARMED:
        return 'armed';
      case ArmedState.DISARMED:
        return 'disarmed';
      case ArmedState.TRIGGERED:
        return 'triggered';
      default:
        return 'disarmed';
    }
  }

  /**
   * Check if zone exists and belongs to organization
   */
  private async verifyZoneAccess(zoneId: string): Promise<boolean> {
    const result = await db.select({ id: alarmZones.id })
      .from(alarmZones)
      .innerJoin(locations, eq(alarmZones.locationId, locations.id))
      .where(and(
        eq(alarmZones.id, zoneId),
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
 * Create organization-scoped alarm zones repository
 */
export function createAlarmZonesRepository(organizationId: string): AlarmZonesRepository {
  return new AlarmZonesRepository(organizationId);
} 