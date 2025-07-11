# Alarm & Area System Overhaul Plan

## Executive Summary

This plan outlines the complete overhaul of our current "Areas" system, splitting it into two distinct concepts:
- **Spaces**: Physical locations where devices coexist
- **Alarm Zones**: Logical groupings for security management

## Current State Analysis

### Problems with Current Implementation
1. **Conceptual Confusion**: Areas try to represent both physical proximity AND alarm groupings
2. **Device Mixing**: Non-security devices (lights, switches) are mixed with security devices in alarm contexts
3. **Camera Association Issues**: Camera relationships should be based on physical proximity, not alarm grouping
4. **Limited Flexibility**: Cannot have devices in multiple alarm groups or configure per-zone trigger rules

### What We're Removing
- `areas` table and all references
- `areaDevices` junction table
- Area-based arming/disarming logic
- Area-based camera associations
- All UI components related to areas

## New Architecture

### 1. Spaces (Physical Proximity)

**Purpose**: Define which devices are physically co-located
- One device = One space (enforced constraint)
- Camera associations based on physical proximity
- Foundation for location-based automations

**Database Schema**:
```sql
spaces:
  - id (UUID)
  - locationId (FK to locations)
  - name (e.g., "Lobby", "Vault Room", "Server Room")
  - description (optional)
  - metadata (JSON - floor plan coordinates, etc.)
  - createdAt
  - updatedAt

spaceDevices:
  - spaceId (FK)
  - deviceId (FK)
  - PRIMARY KEY (deviceId) -- Ensures one device per space
  - createdAt
```

### 2. Alarm Zones (Location-Specific Security Groups)

**Purpose**: Group devices for coordinated security management within a location
- Devices can belong to multiple zones
- Per-zone event trigger configuration
- Zone-based arming/disarming
- Zones are scoped to specific locations

**FINAL Database Schema**:
```sql
alarmZones:
  - id (UUID)
  - locationId (FK to locations) -- Zones belong to locations
  - name (e.g., "Vault Security", "Perimeter", "ATMs")
  - description
  - armedState (DISARMED, ARMED, TRIGGERED)
  - lastArmedStateChangeReason (who/what changed the state)
  - triggerBehavior ('standard', 'custom') -- How zone evaluates events
  - createdAt
  - updatedAt

alarmZoneDevices:
  - zoneId (FK)
  - deviceId (FK)
  - PRIMARY KEY (zoneId, deviceId)
  - createdAt

alarmZoneTriggerOverrides:
  - id (UUID)
  - zoneId (FK)
  - eventType (from EventType enum)
  - shouldTrigger (boolean)
  - createdAt
  - INDEX (zoneId, eventType) -- Fast lookup
  - UNIQUE constraint prevents duplicate rules
  - Indexed for efficient lookups

**NEW: Audit Logging for Alarm Zones**:
```sql
alarmZoneAuditLog:
  - id (UUID)
  - zoneId (FK)
  - userId (FK to users table)
  - action ('armed', 'disarmed', 'triggered', 'acknowledged')
  - previousState (ArmedState)
  - newState (ArmedState)
  - reason (text - e.g., 'manual', 'scheduled', 'automation', 'security_event')
  - triggerEventId (FK to events table, nullable - only for 'triggered' actions)
  - metadata (JSON - additional context like IP address, automation ID, etc.)
  - createdAt
  - INDEX on (zoneId, createdAt) for efficient zone history queries
  - INDEX on (userId, createdAt) for user activity queries
```

**REVISED Schema Explanation**:

1. **Location-Scoped Zones**: 
   - Each zone belongs to a specific location (not organization-wide)
   - Different locations can have their own security configurations
   - A bank branch in NYC can have different zones than one in LA

2. **Simplified Trigger Logic**:
   - **triggerBehavior** on zone: 
     - 'standard' = Alarm events trigger based on predefined list (default)
     - 'custom' = Check overrides table for exceptions
   - Most zones will use 'standard' and never need database lookups
   - **DISARMED zones don't evaluate triggers at all** - that's the whole point of disarming!

3. **Efficient Override Table** (only for 'custom' zones):
   - Simple key-value: eventType → shouldTrigger
   - Only stores EXCEPTIONS to normal behavior
   - Example: Zone triggers on everything EXCEPT battery events
   
4. **Event Processing** (much more efficient):
   ```python
   # Pseudocode for event processing
   
   # First check: Is zone even armed?
   if zone.armedState != 'ARMED':
       return  # Disarmed zones don't process events!
   
   # Only armed zones evaluate triggers
   if zone.triggerBehavior == 'standard':
       if event.type in ALARM_EVENT_TYPES:  # Fast in-memory lookup
           trigger_alarm(zone)
   elif zone.triggerBehavior == 'custom':
       override = get_override(zone.id, event.type)  # Single indexed SQL query
       if override and override.shouldTrigger:
           trigger_alarm(zone)
       elif event.type in ALARM_EVENT_TYPES:
           trigger_alarm(zone)  # Fall back to defaults if no override
   ```

5. **Pre-defined Alarm Event Types** (in code, not database):
   ```typescript
   const ALARM_EVENT_TYPES = [
     EventType.STATE_CHANGED,
     EventType.DOOR_FORCED_OPEN,
     EventType.DOOR_HELD_OPEN,
     EventType.ACCESS_DENIED,
     EventType.INTRUSION,
     EventType.ARMED_PERSON,
     EventType.TAILGATING,
     EventType.LOITERING,
     EventType.OBJECT_REMOVED,
   ];
   ```

**Design Rationale**:
- No scheduling (manual control only per your requirement)
- Efficient rule matching via indexed database queries
- Flexible rules that can match on any combination of device/event characteristics
- Location-specific zones for multi-location organizations

## Implementation Phases

### Phase 1: Database & Core Models
**Goal**: Create new schema without breaking existing functionality

1. **Database Changes**:
   - Create new tables: `spaces`, `spaceDevices`, `alarmZones`, `alarmZoneDevices`, `alarmZoneTriggerOverrides`, `alarmZoneAuditLog`
   - Update schema.ts with new table definitions
   - Create TypeScript types for new entities

2. **Data Access Layer**:
   - Create repository functions for spaces
   - Create repository functions for alarm zones
   - Implement organization-scoped database access

3. **Migration Strategy**:
   - No automated migration needed (per requirements)
   - Document manual data transfer process if needed
   - Keep areas functional during transition

**Deliverables**:
- New database tables created
- TypeScript types defined
- Basic CRUD operations ready

### Phase 2: Space Management
**Goal**: Implement physical space functionality

1. **API Routes**:
   - `/api/spaces` - CRUD operations
   - `/api/spaces/[id]/devices` - Device assignment
   - `/api/spaces/[id]/cameras` - Get cameras in space

2. **Business Logic**:
   - Enforce one-space-per-device constraint
   - Calculate camera associations based on space
   - Space-based device queries

3. **Store Integration**:
   - Add space management to Zustand store
   - Implement space-device relationship management

**Deliverables**:
- Complete API for space management
- Device-to-space assignment working
- Camera association logic updated

### Phase 3: Alarm Zone Core
**Goal**: Implement basic alarm zone functionality

1. **API Routes**:
   - `/api/alarm-zones` - CRUD operations
   - `/api/alarm-zones/[id]/devices` - Device assignment
   - `/api/alarm-zones/[id]/arm-state` - Arming/disarming
   - `/api/alarm-zones/[id]/trigger-rules` - Rule management

2. **Security Logic**:
   - Port alarm logic from areas to zones
   - Implement zone-based arming/disarming
   - Basic trigger evaluation (all events trigger initially)

3. **Event Processing**:
   - Update event processor to check zones instead of areas
   - Implement zone triggering logic
   - Handle multi-zone scenarios

**Deliverables**:
- Basic alarm zones functional
- Can arm/disarm zones
- Events trigger zones appropriately

### Phase 4: Trigger Configuration
**Goal**: Implement efficient event trigger configuration

1. **Core Alarm Event Definition**:
   - Define ALARM_EVENT_TYPES constant in code
   - Covers common alarm events (STATE_CHANGED, INTRUSION, etc.)
   - No database lookups for 99% of zones

2. **Trigger Behavior Implementation**:
   - Simple enum check for 'standard' zones (most common)
   - 'custom' only queries override table when needed
   - DISARMED state prevents all trigger evaluation

3. **Override Management** (for advanced users):
   - Simple API to add/remove event type overrides
   - Only used by zones with triggerBehavior='custom'
   - Efficient indexed lookup by (zoneId, eventType)

4. **Audit Logging Implementation**:
   - Log all arm/disarm actions with user context
   - Log trigger events with reference to causing event
   - Include metadata (IP, automation ID if applicable, etc.)
   - Create API endpoints for viewing audit history

**Deliverables**:
- Efficient rule matching via SQL queries
- Rule management API
- Audit logging for all zone state changes

### Phase 5: UI Migration - Spaces
**Goal**: Build UI for space management

1. **Components**:
   - Space list/grid view
   - Space creation/editing dialog
   - Device assignment interface (drag & drop)
   - Space details with device list

2. **Integration Points**:
   - Update device detail views to show space
   - Camera wall filtered by space
   - Remove area references

**Deliverables**:
- Complete space management UI
- Device assignment working
- Camera associations visible

### Phase 6: UI Migration - Alarm Zones
**Goal**: Build UI for alarm zone management

1. **Components**:
   - Zone list with armed status
   - Zone creation/editing dialog
   - Device assignment (multi-select)
   - Trigger rule configuration
   - Zone status dashboard

2. **Zone Management UI**:
   - List zones with armed state badges
   - Create/edit zone dialogs
   - Device assignment interface
   - Manual arm/disarm controls
   - **CRITICAL**: Show actual enabled event types for 'standard' zones
     - Display the full ALARM_EVENT_TYPES list with checkmarks (read-only)
     - Users must SEE what events will trigger (not just "using defaults")
     - This transparency helps users understand and adjust behavior
     - To modify: user must switch to 'custom' trigger behavior

2. **Alarm Features**:
   - Active alarms view (triggered zones)
   - Zone arming controls
   - Schedule management per zone
   - Bulk operations

**Deliverables**:
- Complete alarm zone UI
- Trigger rule configuration
- Armed state management

### Phase 7: Automation System Updates
**Goal**: Update automations to work with new system

1. **Condition Updates**:
   - Add space-based conditions
   - Add zone-based conditions
   - Update existing area conditions

2. **Action Updates**:
   - Arm/disarm zones instead of areas
   - Space-based device actions

3. **Migration Path**:
   - Document how to recreate area-based automations
   - Provide examples and templates

**Deliverables**:
- Automations work with spaces/zones
- Migration guide for existing automations

### Phase 8: Cleanup & Removal
**Goal**: Remove all area-related code

1. **Database Cleanup**:
   - Drop `areas` and `areaDevices` tables
   - Remove area references from other tables
   - Clean up schema.ts

2. **Code Cleanup**:
   - Remove area-related API routes
   - Remove area components
   - Remove area logic from services
   - Update all imports and references

3. **Documentation**:
   - Update all documentation
   - Remove area references
   - Add space/zone documentation

**Deliverables**:
- All area code removed
- System fully migrated
- Documentation updated

## Technical Considerations

### Performance
- Efficient queries for multi-zone devices
- Indexed database lookups (no caching for now)
- Bulk operations for device assignments
- In-memory alarm event type checking for standard zones

### Security
- Location-scoped access for zones (zones belong to locations)
- Permission model for zone management
- Audit trail for arming/disarming

### Scalability
- Handle hundreds of zones per location
- Thousands of devices across zones
- Real-time trigger evaluation without caching overhead

### API Design
- RESTful endpoints for CRUD
- Bulk operations where appropriate
- Consistent error handling

## Risk Mitigation

### Risks
1. **Data Loss**: Users might lose area configurations
   - **Mitigation**: Document manual migration process

2. **Feature Parity**: Missing functionality during transition
   - **Mitigation**: Keep areas working until Phase 8

3. **User Confusion**: New concepts might confuse users
   - **Mitigation**: Clear documentation and UI guidance

4. **Performance**: More complex queries with two systems
   - **Mitigation**: Optimize queries, add indexes

## Success Criteria

1. **Spaces**:
   - Every device can be assigned to exactly one space
   - Camera associations work based on space proximity
   - Space-based automations function correctly

2. **Alarm Zones**:
   - Devices can belong to multiple zones
   - ARMED zones evaluate triggers, DISARMED zones ignore all events
   - Standard zones use predefined alarm event list
   - Custom zones can override specific event types
   - Multi-zone triggering handled correctly
   - Flat structure - no zone hierarchy or grouping
   - Complete audit log of all arm/disarm/trigger actions

3. **User Experience**:
   - Clear distinction between spaces and zones
   - Intuitive UI for both concepts
   - No loss of critical functionality