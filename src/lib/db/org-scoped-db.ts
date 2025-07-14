import { db } from '@/data/db';
import { locations, devices, connectors, events, pikoServers, automations, keypadPins, user, spaces, spaceDevices, alarmZones, alarmZoneDevices } from '@/data/db/schema';
import { eq, and, exists, getTableColumns, desc, count, inArray, ne, type SQL } from 'drizzle-orm';

/**
 * Organization-scoped database client using proper JOIN-based filtering
 * 
 * Respects existing relationships:
 * organization → connectors → devices
 * organization → locations → spaces → devices
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
  
  readonly spaces = {
    findAll: () =>
      db.select({
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
      .orderBy(spaces.name),
      
    findById: (id: string) =>
      db.select({
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
      )),
      
    findByLocation: (locationId: string) =>
      db.select({
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
      )),
        
    create: async (data: any) => {
      // Verify location belongs to organization first
      const locationExists = await this.locations.exists(data.locationId);
      if (!locationExists) {
        throw new Error('Location not found or not accessible');
      }
      
      return db.insert(spaces)
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
      
      return db.update(spaces)
        .set(data)
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
    },
    
    delete: (id: string) =>
      db.delete(spaces)
        .where(and(
          eq(spaces.id, id),
          exists(
            db.select().from(locations)
              .where(and(
                eq(locations.id, spaces.locationId),
                eq(locations.organizationId, this.orgId)
              ))
          )
        )),
    
    exists: async (id: string): Promise<boolean> => {
      const result = await db.select({ id: spaces.id })
        .from(spaces)
        .innerJoin(locations, eq(spaces.locationId, locations.id))
        .where(and(
          eq(spaces.id, id),
          eq(locations.organizationId, this.orgId)
        ))
        .limit(1);
      return result.length > 0;
    }
  };
  
  // Alarm Zone methods (organization-scoped through locations)
  readonly alarmZones = {
    findAll: () =>
      db.select({
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
      .orderBy(alarmZones.name),
      
    findById: (id: string) =>
      db.select({
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
      )),
      
    findByLocation: (locationId: string) =>
      db.select({
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
      )),
      
    create: async (data: any) => {
      // Verify location belongs to organization first
      const locationExists = await this.locations.exists(data.locationId);
      if (!locationExists) {
        throw new Error('Location not found or not accessible');
      }
      
      return db.insert(alarmZones)
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
      
      return db.update(alarmZones)
        .set(data)
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
    },
    
    delete: (id: string) =>
      db.delete(alarmZones)
        .where(and(
          eq(alarmZones.id, id),
          exists(
            db.select().from(locations)
              .where(and(
                eq(locations.id, alarmZones.locationId),
                eq(locations.organizationId, this.orgId)
              ))
          )
        )),
    
    exists: async (id: string): Promise<boolean> => {
      const result = await db.select({ id: alarmZones.id })
        .from(alarmZones)
        .innerJoin(locations, eq(alarmZones.locationId, locations.id))
        .where(and(
          eq(alarmZones.id, id),
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
        // Include space info through spaceDevices junction
        spaceId: spaceDevices.spaceId,
        spaceName: spaces.name,
        locationId: spaces.locationId
      })
      .from(devices)
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .leftJoin(spaceDevices, eq(devices.id, spaceDevices.deviceId))
      .leftJoin(spaces, eq(spaceDevices.spaceId, spaces.id))
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
        spaceId: spaceDevices.spaceId,
        spaceName: spaces.name,
        locationId: spaces.locationId
      })
      .from(devices)
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .leftJoin(spaceDevices, eq(devices.id, spaceDevices.deviceId))
      .leftJoin(spaces, eq(spaceDevices.spaceId, spaces.id))
      .where(and(
        eq(devices.id, id),
        eq(connectors.organizationId, this.orgId)
      )),
      
    findBySpace: (spaceId: string) =>
      db.select({
        ...getTableColumns(devices),
        space: {
          id: spaces.id,
          name: spaces.name
        }
      })
      .from(devices)
      .innerJoin(spaceDevices, eq(devices.id, spaceDevices.deviceId))
      .innerJoin(spaces, eq(spaceDevices.spaceId, spaces.id))
      .innerJoin(locations, eq(spaces.locationId, locations.id))
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .where(and(
        eq(spaces.id, spaceId),
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
        space: {
          id: spaces.id,
          name: spaces.name
        },
        location: {
          id: locations.id,
          name: locations.name
        }
      })
      .from(devices)
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .innerJoin(spaceDevices, eq(devices.id, spaceDevices.deviceId))
      .innerJoin(spaces, eq(spaceDevices.spaceId, spaces.id))
      .innerJoin(locations, eq(spaces.locationId, locations.id))
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

      if (filters?.spaceId && filters.spaceId.toLowerCase() !== 'all' && filters.spaceId !== '') {
        conditions.push(eq(spaces.id, filters.spaceId));
      }

      // Base query structure
      const query = db.select({
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
        deviceInternalId: devices.id,
        deviceName: devices.name,
        rawDeviceType: devices.type,
        // Joined Connector fields (nullable)
        connectorName: connectors.name,
        connectorCategory: connectors.category,
        connectorConfig: connectors.cfg_enc,
        // Joined SpaceDevice -> Space fields (nullable)
        spaceId: spaceDevices.spaceId,
        spaceName: spaces.name,
        // Joined Space -> Location fields (nullable)
        locationId: spaces.locationId,
        locationName: locations.name,
        locationPath: locations.path,
        // Alarm zone fields (nullable) - include when alarm filtering is needed
        alarmZoneId: alarmZoneDevices.zoneId,
        alarmZoneName: alarmZones.name,
        alarmZoneTriggerBehavior: alarmZones.triggerBehavior,
      })
      .from(events)
      // Event -> Connector (organization filter applied in WHERE clause)
      .innerJoin(connectors, eq(connectors.id, events.connectorId))
      // Event -> Device (using external ID and connector ID) - LEFT JOIN
      .leftJoin(devices, and(
        eq(devices.connectorId, events.connectorId),
        eq(devices.deviceId, events.deviceId)
      ))
      // Device -> SpaceDevice (optional)
      .leftJoin(spaceDevices, eq(spaceDevices.deviceId, devices.id))
      // SpaceDevice -> Space (optional)
      .leftJoin(spaces, eq(spaces.id, spaceDevices.spaceId))
      // Space -> Location (optional)
      .leftJoin(locations, eq(locations.id, spaces.locationId))
      // Device -> AlarmZoneDevices (optional) - include for alarm evaluation
      .leftJoin(alarmZoneDevices, eq(alarmZoneDevices.deviceId, devices.id))
      // AlarmZoneDevices -> AlarmZones (optional)
      .leftJoin(alarmZones, eq(alarmZones.id, alarmZoneDevices.zoneId))
      .where(and(...conditions))
      .orderBy(desc(events.timestamp))
      .limit(limit + 1) // Fetch one extra to determine hasNextPage
      .offset(offset);

      return query;
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
        deviceInternalId: devices.id,
        deviceName: devices.name,
        rawDeviceType: devices.type,
        // Joined Connector fields
        connectorName: connectors.name,
        connectorCategory: connectors.category,
        connectorConfig: connectors.cfg_enc,
        // Joined Space fields (nullable)
        spaceId: spaceDevices.spaceId,
        spaceName: spaces.name,
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
      .leftJoin(spaceDevices, eq(spaceDevices.deviceId, devices.id))
      .leftJoin(spaces, eq(spaces.id, spaceDevices.spaceId))
      .leftJoin(locations, eq(locations.id, spaces.locationId))
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
        rawEventType: events.rawEventType,
        // Joined Device fields
        deviceInternalId: devices.id,
        deviceName: devices.name,
        rawDeviceType: devices.type,
        // Joined Connector fields
        connectorName: connectors.name,
        connectorCategory: connectors.category,
        // Joined Space fields (nullable)
        spaceId: spaceDevices.spaceId,
        spaceName: spaces.name,
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
      .leftJoin(spaceDevices, eq(spaceDevices.deviceId, devices.id))
      .leftJoin(spaces, eq(spaces.id, spaceDevices.spaceId))
      .leftJoin(locations, eq(locations.id, spaces.locationId))
      .where(ne(events.standardizedEventCategory, 'heartbeat'))
      .orderBy(desc(events.timestamp))
      .limit(limit),
      
    findAll: (limit: number = 1000) =>
      db.select({
        eventUuid: events.eventUuid,
        connectorId: events.connectorId,
        deviceId: events.deviceId,
        timestamp: events.timestamp,
        standardizedEventCategory: events.standardizedEventCategory,
        standardizedEventType: events.standardizedEventType,
        standardizedEventSubtype: events.standardizedEventSubtype,
        standardizedPayload: events.standardizedPayload,
        rawPayload: events.rawPayload,
        rawEventType: events.rawEventType,
        deviceInternalId: devices.id,
        deviceName: devices.name,
        connectorName: connectors.name,
        connectorCategory: connectors.category,
        spaceId: spaceDevices.spaceId,
        spaceName: spaces.name,
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
      .leftJoin(spaceDevices, eq(spaceDevices.deviceId, devices.id))
      .leftJoin(spaces, eq(spaces.id, spaceDevices.spaceId))
      .leftJoin(locations, eq(locations.id, spaces.locationId))
      .orderBy(desc(events.timestamp))
      .limit(limit),
      
    count: () =>
      db.select({ count: count() })
        .from(events)
        .innerJoin(connectors, and(
          eq(connectors.id, events.connectorId),
          eq(connectors.organizationId, this.orgId)
        ))
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
    
    create: (data: any) =>
      db.insert(automations)
        .values({ ...data, organizationId: this.orgId })
        .returning(),
    
    update: (id: string, data: any) =>
      db.update(automations)
        .set(data)
        .where(and(
          eq(automations.id, id),
          eq(automations.organizationId, this.orgId)
        ))
        .returning(),
    
    delete: (id: string) =>
      db.delete(automations)
        .where(and(
          eq(automations.id, id),
          eq(automations.organizationId, this.orgId)
        ))
  };
  
  // Keypad PIN methods (organization-scoped)
  readonly keypadPins = {
    findAll: () =>
      db.select().from(keypadPins)
        .where(eq(keypadPins.organizationId, this.orgId))
        .orderBy(keypadPins.createdAt),
    
    findByUser: (userId: string) =>
      db.select().from(keypadPins)
        .where(and(
          eq(keypadPins.userId, userId),
          eq(keypadPins.organizationId, this.orgId)
        )),
    
    getUserPin: (userId: string) =>
      db.select().from(keypadPins)
        .where(and(
          eq(keypadPins.userId, userId),
          eq(keypadPins.organizationId, this.orgId)
        )),
    
    setUserPin: async (userId: string, hashedPin: string) => {
      // First check if user already has a PIN
      const existing = await db.select().from(keypadPins)
        .where(and(
          eq(keypadPins.userId, userId),
          eq(keypadPins.organizationId, this.orgId)
        ));
      
      if (existing.length > 0) {
        // Update existing PIN
        return db.update(keypadPins)
          .set({ keypadPin: hashedPin, updatedAt: new Date() })
          .where(and(
            eq(keypadPins.userId, userId),
            eq(keypadPins.organizationId, this.orgId)
          ))
          .returning();
      } else {
        // Create new PIN
        return db.insert(keypadPins)
          .values({ 
            userId, 
            keypadPin: hashedPin, 
            organizationId: this.orgId 
          })
          .returning();
      }
    },
    
    removeUserPin: (userId: string) =>
      db.delete(keypadPins)
        .where(and(
          eq(keypadPins.userId, userId),
          eq(keypadPins.organizationId, this.orgId)
        )),
    
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
      )),
    
    create: (data: any) =>
      db.insert(keypadPins)
        .values({ ...data, organizationId: this.orgId })
        .returning(),
    
    update: (id: string, data: any) =>
      db.update(keypadPins)
        .set(data)
        .where(and(
          eq(keypadPins.id, id),
          eq(keypadPins.organizationId, this.orgId)
        ))
        .returning(),
    
    delete: (id: string) =>
      db.delete(keypadPins)
        .where(and(
          eq(keypadPins.id, id),
          eq(keypadPins.organizationId, this.orgId)
        ))
  };
  
  // Organization ID getter for debugging
  get organizationId() {
    return this.orgId;
  }
}

export function createOrgScopedDb(organizationId: string): OrgScopedDb {
  return new OrgScopedDb(organizationId);
} 