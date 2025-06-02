import { db } from '@/data/db';
import { locations, areas, devices, areaDevices, connectors, events, pikoServers, cameraAssociations, automations, keypadPins, user } from '@/data/db/schema';
import { eq, and, exists, getTableColumns, desc, count, inArray, ne, type SQL } from 'drizzle-orm';

/**
 * Organization-scoped database client using proper JOIN-based filtering
 * 
 * Respects existing relationships:
 * organization → connectors → devices
 * organization → locations → areas → devices
 * organization → connectors → events
 * 
 */
export class OrgScopedDb {
  constructor(private readonly orgId: string) {}
  
  readonly locations = {
    findAll: () => 
      db.select().from(locations)
        .where(eq(locations.organizationId, this.orgId))
        .orderBy(locations.path),
        
    findById: (id: string) =>
      db.select().from(locations)
        .where(and(
          eq(locations.id, id),
          eq(locations.organizationId, this.orgId)
        )),
        
    create: (data: any) =>
      db.insert(locations)
        .values({ ...data, organizationId: this.orgId })
        .returning(),
        
    update: (id: string, data: any) =>
      db.update(locations)
        .set(data)
        .where(and(
          eq(locations.id, id),
          eq(locations.organizationId, this.orgId)
        ))
        .returning(),
        
    delete: (id: string) =>
      db.delete(locations)
        .where(and(
          eq(locations.id, id),
          eq(locations.organizationId, this.orgId)
        )),
        
    exists: async (id: string): Promise<boolean> => {
      const result = await db.select({ id: locations.id })
        .from(locations)
        .where(and(
          eq(locations.id, id),
          eq(locations.organizationId, this.orgId)
        ))
        .limit(1);
      return result.length > 0;
    }
  };
  
  readonly areas = {
    findAll: () =>
      db.select({
        ...getTableColumns(areas),
        location: {
          id: locations.id,
          name: locations.name,
          path: locations.path
        }
      })
      .from(areas)
      .innerJoin(locations, eq(areas.locationId, locations.id))
      .where(eq(locations.organizationId, this.orgId))
      .orderBy(areas.name),
      
    findById: (id: string) =>
      db.select({
        ...getTableColumns(areas),
        location: {
          id: locations.id,
          name: locations.name,
          path: locations.path
        }
      })
      .from(areas)
      .innerJoin(locations, eq(areas.locationId, locations.id))
      .where(and(
        eq(areas.id, id),
        eq(locations.organizationId, this.orgId)
      )),
      
    findByLocation: (locationId: string) =>
      db.select({
        ...getTableColumns(areas),
        location: {
          id: locations.id,
          name: locations.name,
          path: locations.path
        }
      })
      .from(areas)
      .innerJoin(locations, eq(areas.locationId, locations.id))
      .where(and(
        eq(areas.locationId, locationId),
        eq(locations.organizationId, this.orgId)
      )),
        
    create: async (data: any) => {
      // Verify location belongs to organization first
      const locationExists = await this.locations.exists(data.locationId);
      if (!locationExists) {
        throw new Error('Location not found or not accessible');
      }
      
      return db.insert(areas)
        .values(data)
        .returning();
    },
    
    update: async (id: string, data: any) => {
      // If locationId is being changed, verify new location belongs to org
      if (data.locationId) {
        const locationExists = await this.locations.exists(data.locationId);
        if (!locationExists) {
          throw new Error('Location not found or not accessible');
        }
      }
      
      return db.update(areas)
        .set(data)
        .where(and(
          eq(areas.id, id),
          exists(
            db.select().from(locations)
              .where(and(
                eq(locations.id, areas.locationId),
                eq(locations.organizationId, this.orgId)
              ))
          )
        ))
        .returning();
    },
    
    delete: (id: string) =>
      db.delete(areas)
        .where(and(
          eq(areas.id, id),
          exists(
            db.select().from(locations)
              .where(and(
                eq(locations.id, areas.locationId),
                eq(locations.organizationId, this.orgId)
              ))
          )
        )),
    
    exists: async (id: string): Promise<boolean> => {
      const result = await db.select({ id: areas.id })
        .from(areas)
        .innerJoin(locations, eq(areas.locationId, locations.id))
        .where(and(
          eq(areas.id, id),
          eq(locations.organizationId, this.orgId)
        ))
        .limit(1);
      return result.length > 0;
    }
  };
  
  // Device methods (organization-scoped through connectors)
  readonly devices = {
    findAll: () =>
      db.select({
        ...getTableColumns(devices),
        connector: {
          id: connectors.id,
          name: connectors.name,
          category: connectors.category
        },
        // Include area/location info through areaDevices junction
        areaId: areaDevices.areaId,
        locationId: areas.locationId
      })
      .from(devices)
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .leftJoin(areaDevices, eq(devices.id, areaDevices.deviceId))
      .leftJoin(areas, eq(areaDevices.areaId, areas.id))
      .where(eq(connectors.organizationId, this.orgId))
      .orderBy(devices.name),
      
    findById: (id: string) =>
      db.select({
        ...getTableColumns(devices),
        connector: {
          id: connectors.id,
          name: connectors.name,
          category: connectors.category
        },
        areaId: areaDevices.areaId,
        locationId: areas.locationId
      })
      .from(devices)
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .leftJoin(areaDevices, eq(devices.id, areaDevices.deviceId))
      .leftJoin(areas, eq(areaDevices.areaId, areas.id))
      .where(and(
        eq(devices.id, id),
        eq(connectors.organizationId, this.orgId)
      )),
      
    findByExternalId: (deviceId: string) =>
      db.select({
        ...getTableColumns(devices),
        connector: {
          id: connectors.id,
          name: connectors.name,
          category: connectors.category
        },
        areaId: areaDevices.areaId,
        locationId: areas.locationId
      })
      .from(devices)
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .leftJoin(areaDevices, eq(devices.id, areaDevices.deviceId))
      .leftJoin(areas, eq(areaDevices.areaId, areas.id))
      .where(and(
        eq(devices.deviceId, deviceId),
        eq(connectors.organizationId, this.orgId)
      ))
      .limit(1),

    findByArea: (areaId: string) =>
      db.select({
        ...getTableColumns(devices),
        area: {
          id: areas.id,
          name: areas.name
        }
      })
      .from(devices)
      .innerJoin(areaDevices, eq(devices.id, areaDevices.deviceId))
      .innerJoin(areas, eq(areaDevices.areaId, areas.id))
      .innerJoin(locations, eq(areas.locationId, locations.id))
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .where(and(
        eq(areas.id, areaId),
        eq(locations.organizationId, this.orgId),
        eq(connectors.organizationId, this.orgId)
      )),
      
    findByConnector: (connectorId: string) =>
      db.select({
        ...getTableColumns(devices),
        connector: {
          id: connectors.id,
          name: connectors.name,
          category: connectors.category
        }
      })
      .from(devices)
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .where(and(
        eq(devices.connectorId, connectorId),
        eq(connectors.organizationId, this.orgId)
      )),
      
    findAllInOrganization: () =>
      db.select({
        ...getTableColumns(devices),
        connector: {
          id: connectors.id,
          name: connectors.name,
          category: connectors.category
        }
      })
      .from(devices)
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .where(eq(connectors.organizationId, this.orgId))
      .orderBy(devices.name),
      
    findInOrganization: () =>
      db.select({
        ...getTableColumns(devices),
        area: {
          id: areas.id,
          name: areas.name
        },
        location: {
          id: locations.id,
          name: locations.name
        }
      })
      .from(devices)
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .innerJoin(areaDevices, eq(devices.id, areaDevices.deviceId))
      .innerJoin(areas, eq(areaDevices.areaId, areas.id))
      .innerJoin(locations, eq(areas.locationId, locations.id))
      .where(and(
        eq(locations.organizationId, this.orgId),
        eq(connectors.organizationId, this.orgId)
      )),
      
    update: (id: string, data: any) =>
      db.update(devices)
        .set(data)
        .where(and(
          eq(devices.id, id),
          exists(
            db.select().from(connectors)
              .where(and(
                eq(connectors.id, devices.connectorId),
                eq(connectors.organizationId, this.orgId)
              ))
          )
        ))
        .returning(),
        
    exists: async (id: string): Promise<boolean> => {
      const result = await db.select({ id: devices.id })
        .from(devices)
        .innerJoin(connectors, eq(devices.connectorId, connectors.id))
        .where(and(
          eq(devices.id, id),
          eq(connectors.organizationId, this.orgId)
        ))
        .limit(1);
      return result.length > 0;
    },
    
    // Device associations (organization-scoped)
    findAssociations: async (deviceId: string, category: string) => {
      // Verify device exists in organization first
      const deviceExists = await this.devices.exists(deviceId);
      if (!deviceExists) {
        throw new Error('Device not found or not accessible');
      }
      
      if (category === 'piko') {
        // If it's a Piko camera, find devices associated TO it
        return db.select({
          deviceId: devices.deviceId,
          deviceName: devices.name
        })
        .from(cameraAssociations)
        .innerJoin(devices, eq(devices.id, cameraAssociations.deviceId))
        .innerJoin(connectors, eq(devices.connectorId, connectors.id))
        .where(and(
          eq(cameraAssociations.pikoCameraId, deviceId),
          eq(connectors.organizationId, this.orgId)
        ));
      } else {
        // For other devices, find Piko cameras associated FROM it
        return db.select({
          deviceId: devices.deviceId,
          deviceName: devices.name
        })
        .from(cameraAssociations)
        .innerJoin(devices, eq(devices.id, cameraAssociations.pikoCameraId))
        .innerJoin(connectors, eq(devices.connectorId, connectors.id))
        .where(and(
          eq(cameraAssociations.deviceId, deviceId),
          eq(connectors.organizationId, this.orgId)
        ));
      }
    }
  };
  
  // Event methods (organization-scoped through connectors)
  readonly events = {
    findRecent: (limit: number = 100, offset: number = 0, filters?: any) => {
      // Build dynamic WHERE conditions based on filters
      const conditions: SQL[] = [
        eq(connectors.organizationId, this.orgId)
      ];

      if (filters?.eventCategories && filters.eventCategories.length > 0) {
        conditions.push(inArray(events.standardizedEventCategory, filters.eventCategories));
      }

      if (filters?.connectorCategory && filters.connectorCategory.toLowerCase() !== 'all' && filters.connectorCategory !== '') {
        conditions.push(eq(connectors.category, filters.connectorCategory));
      }

      if (filters?.locationId && filters.locationId.toLowerCase() !== 'all' && filters.locationId !== '') {
        conditions.push(eq(locations.id, filters.locationId));
      }

      return db.select({
        // Event fields
        id: events.id,
        eventUuid: events.eventUuid,
        deviceId: events.deviceId,
        timestamp: events.timestamp,
        standardizedEventCategory: events.standardizedEventCategory,
        standardizedEventType: events.standardizedEventType,
        standardizedEventSubtype: events.standardizedEventSubtype,
        standardizedPayload: events.standardizedPayload,
        rawPayload: events.rawPayload,
        rawEventType: events.rawEventType,
        connectorId: events.connectorId,
        // Joined Device fields (nullable)
        deviceName: devices.name,
        rawDeviceType: devices.type,
        // Joined Connector fields (nullable)
        connectorName: connectors.name,
        connectorCategory: connectors.category,
        connectorConfig: connectors.cfg_enc,
        // Joined AreaDevice -> Area fields (nullable)
        areaId: areaDevices.areaId,
        areaName: areas.name,
        // Joined Area -> Location fields (nullable)
        locationId: areas.locationId,
        locationName: locations.name,
        locationPath: locations.path,
      })
      .from(events)
      // Event -> Connector (organization filter applied in WHERE clause)
      .innerJoin(connectors, eq(connectors.id, events.connectorId))
      // Event -> Device (using external ID and connector ID) - LEFT JOIN
      .leftJoin(devices, and(
        eq(devices.connectorId, events.connectorId),
        eq(devices.deviceId, events.deviceId)
      ))
      // Device -> AreaDevice (optional)
      .leftJoin(areaDevices, eq(areaDevices.deviceId, devices.id))
      // AreaDevice -> Area (optional)
      .leftJoin(areas, eq(areas.id, areaDevices.areaId))
      // Area -> Location (optional)
      .leftJoin(locations, eq(locations.id, areas.locationId))
      .where(and(...conditions))
      .orderBy(desc(events.timestamp))
      .limit(limit + 1) // Fetch one extra to determine hasNextPage
      .offset(offset);
    },
      
    findById: (eventUuid: string) =>
      db.select({
        // Event fields
        id: events.id,
        eventUuid: events.eventUuid,
        deviceId: events.deviceId,
        timestamp: events.timestamp,
        standardizedEventCategory: events.standardizedEventCategory,
        standardizedEventType: events.standardizedEventType,
        standardizedEventSubtype: events.standardizedEventSubtype,
        standardizedPayload: events.standardizedPayload,
        rawPayload: events.rawPayload,
        rawEventType: events.rawEventType,
        connectorId: events.connectorId,
        // Joined Device fields
        deviceName: devices.name,
        rawDeviceType: devices.type,
        // Joined Connector fields
        connectorName: connectors.name,
        connectorCategory: connectors.category,
        connectorConfig: connectors.cfg_enc,
        // Joined Area fields (nullable)
        areaId: areaDevices.areaId,
        areaName: areas.name,
        // Joined Location fields (nullable)
        locationId: locations.id,
        locationName: locations.name
      })
      .from(events)
      .innerJoin(connectors, and(
        eq(connectors.id, events.connectorId),
        eq(connectors.organizationId, this.orgId)
      ))
      .leftJoin(devices, and(
        eq(devices.connectorId, events.connectorId),
        eq(devices.deviceId, events.deviceId)
      ))
      .leftJoin(areaDevices, eq(areaDevices.deviceId, devices.id))
      .leftJoin(areas, eq(areas.id, areaDevices.areaId))
      .leftJoin(locations, eq(locations.id, areas.locationId))
      .where(eq(events.eventUuid, eventUuid))
      .limit(1),
      
    findDashboard: (limit: number = 100) =>
      db.select({
        // Event fields
        eventUuid: events.eventUuid,
        connectorId: events.connectorId,
        deviceId: events.deviceId,
        timestamp: events.timestamp,
        standardizedEventCategory: events.standardizedEventCategory,
        standardizedEventType: events.standardizedEventType,
        standardizedEventSubtype: events.standardizedEventSubtype,
        standardizedPayload: events.standardizedPayload,
        rawPayload: events.rawPayload,
        // Joined Device fields (nullable)
        internalDeviceId: devices.id,
        deviceName: devices.name,
        rawDeviceType: devices.type,
        // Joined Connector fields (nullable)
        connectorName: connectors.name,
        connectorCategory: connectors.category,
        // Joined AreaDevice -> Area fields (nullable)
        areaId: areaDevices.areaId,
        areaName: areas.name,
        // Joined Area -> Location fields (nullable)
        locationId: areas.locationId,
        locationName: locations.name,
        locationPath: locations.path,
      })
      .from(events)
      // Event -> Connector (organization filter applied here)
      .innerJoin(connectors, and(
        eq(connectors.id, events.connectorId),
        eq(connectors.organizationId, this.orgId)
      ))
      // Event -> Device (using external ID and connector ID) - LEFT JOIN
      .leftJoin(devices, and(
        eq(devices.connectorId, events.connectorId),
        eq(devices.deviceId, events.deviceId)
      ))
      // Device -> AreaDevice (optional)
      .leftJoin(areaDevices, eq(areaDevices.deviceId, devices.id))
      // AreaDevice -> Area (optional)
      .leftJoin(areas, eq(areas.id, areaDevices.areaId))
      // Area -> Location (optional)
      .leftJoin(locations, eq(locations.id, areas.locationId))
      .orderBy(desc(events.timestamp))
      .limit(limit)
  };
  
  // Connector methods (organization-scoped)
  readonly connectors = {
    findAll: () => 
      db.select().from(connectors)
        .where(eq(connectors.organizationId, this.orgId))
        .orderBy(connectors.name),
        
    findById: (id: string) =>
      db.select().from(connectors)
        .where(and(
          eq(connectors.id, id),
          eq(connectors.organizationId, this.orgId)
        )),
        
    create: (data: any) =>
      db.insert(connectors)
        .values({ ...data, organizationId: this.orgId })
        .returning(),
        
    update: (id: string, data: any) =>
      db.update(connectors)
        .set(data)
        .where(and(
          eq(connectors.id, id),
          eq(connectors.organizationId, this.orgId)
        ))
        .returning(),
        
    delete: (id: string) =>
      db.delete(connectors)
        .where(and(
          eq(connectors.id, id),
          eq(connectors.organizationId, this.orgId)
        )),
        
    exists: async (id: string): Promise<boolean> => {
      const result = await db.select({ id: connectors.id })
        .from(connectors)
        .where(and(
          eq(connectors.id, id),
          eq(connectors.organizationId, this.orgId)
        ))
        .limit(1);
      return result.length > 0;
    }
  };
  
  // Automation methods (organization-scoped)
  readonly automations = {
    findAll: () =>
      db.select().from(automations)
        .where(eq(automations.organizationId, this.orgId))
        .orderBy(automations.name),
        
    findById: (id: string) =>
      db.select().from(automations)
        .where(and(
          eq(automations.id, id),
          eq(automations.organizationId, this.orgId)
        )),
        
    findEnabled: () =>
      db.select().from(automations)
        .where(and(
          eq(automations.organizationId, this.orgId),
          eq(automations.enabled, true)
        ))
        .orderBy(automations.name),
        
    create: async (data: any) => {
      // If locationScopeId is provided, verify it belongs to the organization
      if (data.locationScopeId) {
        const locationExists = await this.locations.exists(data.locationScopeId);
        if (!locationExists) {
          throw new Error('Location not found or not accessible');
        }
      }
      
      return db.insert(automations)
        .values({ ...data, organizationId: this.orgId })
        .returning();
    },
        
    update: async (id: string, data: any) => {
      // If locationScopeId is being changed, verify new location belongs to org
      if (data.locationScopeId) {
        const locationExists = await this.locations.exists(data.locationScopeId);
        if (!locationExists) {
          throw new Error('Location not found or not accessible');
        }
      }
      
      return db.update(automations)
        .set(data)
        .where(and(
          eq(automations.id, id),
          eq(automations.organizationId, this.orgId)
        ))
        .returning();
    },
        
    delete: (id: string) =>
      db.delete(automations)
        .where(and(
          eq(automations.id, id),
          eq(automations.organizationId, this.orgId)
        )),
        
    exists: async (id: string): Promise<boolean> => {
      const result = await db.select({ id: automations.id })
        .from(automations)
        .where(and(
          eq(automations.id, id),
          eq(automations.organizationId, this.orgId)
        ))
        .limit(1);
      return result.length > 0;
    }
  };
  
  // Keypad PIN methods (organization-scoped)
  readonly keypadPins = {
    findByPin: (hashedPin: string) =>
      db.select({
        ...getTableColumns(keypadPins),
        user: {
          id: user.id,
          name: user.name,
          email: user.email
        }
      })
      .from(keypadPins)
      .innerJoin(user, eq(keypadPins.userId, user.id))
      .where(and(
        eq(keypadPins.keypadPin, hashedPin),
        eq(keypadPins.organizationId, this.orgId)
      ))
      .limit(1),
      
    getUserPin: (userId: string) =>
      db.select().from(keypadPins)
        .where(and(
          eq(keypadPins.userId, userId),
          eq(keypadPins.organizationId, this.orgId)
        ))
        .limit(1),
        
    setUserPin: async (userId: string, hashedPin: string) => {
      // Check if PIN is unique within organization (excluding current user)
      const existingPin = await db.select({ id: keypadPins.id })
        .from(keypadPins)
        .where(and(
          eq(keypadPins.keypadPin, hashedPin),
          eq(keypadPins.organizationId, this.orgId),
          // Exclude current user in case they're updating their own PIN to the same value
          // This won't work because we might be creating a new record, but the unique constraint will handle it
        ))
        .limit(1);
      
      if (existingPin.length > 0) {
        throw new Error('PIN already exists in this organization');
      }
      
      // Use upsert pattern - insert or update existing record
      return db.insert(keypadPins)
        .values({
          userId,
          organizationId: this.orgId,
          keypadPin: hashedPin,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: [keypadPins.userId, keypadPins.organizationId],
          set: {
            keypadPin: hashedPin,
            updatedAt: new Date()
          }
        })
        .returning();
    },
    
    removeUserPin: (userId: string) =>
      db.delete(keypadPins)
        .where(and(
          eq(keypadPins.userId, userId),
          eq(keypadPins.organizationId, this.orgId)
        )),
        
    checkPinUnique: async (hashedPin: string, excludeUserId?: string): Promise<boolean> => {
      const conditions = [
        eq(keypadPins.keypadPin, hashedPin),
        eq(keypadPins.organizationId, this.orgId)
      ];
      
      // Exclude a specific user if provided (useful for updates)
      if (excludeUserId) {
        conditions.push(ne(keypadPins.userId, excludeUserId));
      }
      
      const result = await db.select({ id: keypadPins.id })
        .from(keypadPins)
        .where(and(...conditions))
        .limit(1);
      
      return result.length === 0; // true if unique (no results found)
    },
    
    exists: async (userId: string): Promise<boolean> => {
      const result = await db.select({ id: keypadPins.id })
        .from(keypadPins)
        .where(and(
          eq(keypadPins.userId, userId),
          eq(keypadPins.organizationId, this.orgId)
        ))
        .limit(1);
      return result.length > 0;
    }
  };
  
  get organizationId() {
    return this.orgId;
  }
}

export function createOrgScopedDb(organizationId: string): OrgScopedDb {
  return new OrgScopedDb(organizationId);
} 