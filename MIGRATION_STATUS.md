# Alarm & Area System Overhaul - Migration Status

## 🎯 Project Overview

This document tracks the progress of splitting the legacy "Areas" system into two distinct concepts:
- **Spaces**: Physical locations where devices coexist (one device per space)
- **Alarm Zones**: Logical security groupings (devices can belong to multiple zones)

The goal is to eliminate the conceptual confusion where "areas" tried to represent both physical proximity AND alarm groupings.

## ✅ **COMPLETED PHASES (1-6)**

### Phase 1: Database & Core Models ✅
- ✅ New database tables created: `spaces`, `spaceDevices`, `alarmZones`, `alarmZoneDevices`, `alarmZoneTriggerOverrides`, `alarmZoneAuditLog`
- ✅ TypeScript types defined for all new entities in `src/types/index.ts`
- ✅ Organization-scoped database access patterns established in `src/lib/db/org-scoped-db.ts`
- ✅ Repository functions implemented for spaces and alarm zones

### Phase 2: Space Management ✅
- ✅ Complete API routes: `/api/spaces`, `/api/spaces/[id]/devices`
- ✅ One-space-per-device constraint enforced via database PRIMARY KEY
- ✅ Zustand store integration for space management (`src/stores/store.ts`)
- ✅ Camera association logic updated to use spaces instead of areas

### Phase 3: Alarm Zone Core ✅
- ✅ Complete API routes: `/api/alarm-zones`, `/api/alarm-zones/[id]/*`
- ✅ Zone-based arming/disarming logic implemented
- ✅ Event processing updated to check zones instead of areas
- ✅ Multi-zone device support working

### Phase 4: Trigger Configuration ✅
- ✅ ALARM_EVENT_TYPES constant defined in code (not database)
- ✅ Efficient trigger behavior: 'standard' vs 'custom' zones
- ✅ Override management for advanced trigger rules
- ✅ Complete audit logging for all zone state changes
- ✅ DISARMED zones ignore all events (no trigger evaluation)

### Phase 5: UI Migration - Spaces ✅
- ✅ Complete space management UI in `src/app/(features)/spaces/page.tsx`
- ✅ Space CRUD operations with location filtering
- ✅ Device assignment interface with search/filtering
- ✅ Device detail views updated to show space information
- ✅ Camera wall component created (`space-camera-wall-dialog.tsx`)

### Phase 6: UI Migration - Alarm Zones ✅
- ✅ Complete alarm zone management UI in `src/app/(features)/alarm-zones/page.tsx`
- ✅ Zone list with armed status badges (Armed/Disarmed/Triggered)
- ✅ Zone CRUD operations with sophisticated filtering
- ✅ Device assignment dialog with multi-select (`alarm-zone-device-assignment-dialog.tsx`)
- ✅ Trigger rule configuration dialog (`alarm-zone-trigger-rules-dialog.tsx`)
- ✅ Audit log viewer (`alarm-zone-audit-log-dialog.tsx`)
- ✅ Manual arm/disarm controls with proper state management
- ✅ Navigation updated with "Spaces" and "Alarm Zones" menu items

## 🔄 **REMAINING WORK (Phases 7-8)**

### Phase 7: Automation System Updates 🚧 NOT STARTED
The automation system still references the old area concepts and needs updating:

**Required Changes:**
- Update automation conditions to use spaces/alarm zones instead of areas
- Add space-based conditions for physical proximity automations  
- Add alarm zone conditions for security automations
- Update automation actions to arm/disarm zones instead of areas
- Create migration guide for existing area-based automations

**Files Likely Affected:**
- `src/app/api/automations/` - Automation API routes
- `src/components/features/automations/` - Automation UI components  
- `src/services/automation-*` - Automation services
- `src/types/automation-*` - Automation type definitions

### Phase 8: Area Cleanup & Removal 🚧 CRITICAL - NOT STARTED

⚠️ **MAJOR TASK**: The codebase still contains extensive legacy area references that must be systematically removed.

**Database Cleanup:**
- Remove area references from device queries in `src/lib/db/org-scoped-db.ts`
- Drop `areas` and `areaDevices` tables (after confirming no dependencies)
- Clean up schema.ts imports and definitions

**Code Cleanup Tasks:**
1. **API Routes**: Remove area-related endpoints
   - `src/app/api/areas/` directory and all routes
   - Any area references in other API routes

2. **Component Cleanup**: Remove area UI components
   - `src/components/features/locations-areas/areas/` directory
   - Area references in other components

3. **Service Layer**: Update services that still reference areas
   - Event processing services
   - Device services  
   - Any other business logic

4. **Type Definitions**: Remove area types and update imports
   - Remove Area types from `src/types/index.ts`
   - Update DeviceWithConnector to remove areaId/area references
   - Fix all TypeScript errors from removed types

5. **Store Management**: Remove area state from Zustand
   - Remove area-related state from `src/stores/store.ts`
   - Remove area action methods

**Search Strategy for Next Agent:**
```bash
# Find files with area references
grep -r "areas\." src/ --include="*.ts" --include="*.tsx"
grep -r "areaDevices" src/ --include="*.ts" --include="*.tsx"  
grep -r "areaId" src/ --include="*.ts" --include="*.tsx"
grep -r "Area" src/ --include="*.ts" --include="*.tsx" | grep -v "AlarmZone"

# Find API routes
find src/app/api -name "*area*"

# Find components  
find src/components -name "*area*" -o -name "*Area*"
```

## 🏗️ **ARCHITECTURAL DECISIONS MADE**

### Key Design Choices
1. **One Device = One Space**: Enforced via database constraint, devices cannot be in multiple physical locations
2. **Location-Scoped Zones**: Alarm zones belong to specific locations, not organization-wide
3. **Efficient Trigger Logic**: Most zones use 'standard' behavior (predefined event list), avoiding database lookups
4. **No Automated Migration**: Legacy area data must be manually transferred if needed
5. **Audit Everything**: All alarm zone state changes are logged with user context

### Database Schema Highlights
- `spaceDevices.deviceId` has PRIMARY KEY constraint (one space per device)
- `alarmZones.locationId` ensures location-specific security zones
- `alarmZoneTriggerOverrides` only used for 'custom' trigger behavior
- Efficient indexing on audit log for performance

### Performance Considerations
- In-memory ALARM_EVENT_TYPES checking for standard zones
- Indexed database queries for custom trigger rules
- DISARMED zones skip all trigger evaluation
- Optimized device queries with proper joins

## 🔧 **TECHNICAL NOTES FOR NEXT AGENT**

### Critical Files Modified
- `src/lib/db/org-scoped-db.ts` - Updated all device queries to include space information
- `src/services/event-thumbnail-resolver.ts` - Changed from area-based to space-based camera associations  
- `src/lib/events/eventProcessor.ts` - Updated to use space cameras instead of area cameras
- `src/types/index.ts` - Added all new space/alarm zone types
- `src/stores/store.ts` - Added complete state management for spaces and alarm zones

### Zustand Store State
The store now includes:
```typescript
// Spaces
spaces: Space[]
isLoadingSpaces: boolean
errorSpaces: string | null

// Alarm Zones  
alarmZones: AlarmZone[]
isLoadingAlarmZones: boolean
errorAlarmZones: string | null
```

### API Endpoints Available
- `GET/POST /api/spaces` - Space CRUD
- `GET/POST /api/spaces/[id]/devices` - Device assignment
- `GET/POST /api/alarm-zones` - Zone CRUD  
- `PATCH /api/alarm-zones/[id]` - Zone updates including arm state
- `GET/POST /api/alarm-zones/[id]/devices` - Zone device assignment

### Component Structure
```
src/components/features/locations-areas/
├── spaces/
│   ├── SpaceCard.tsx (main space display)
│   ├── space-edit-dialog.tsx (create/edit)
│   ├── space-device-assignment-dialog.tsx
│   └── space-camera-wall-dialog.tsx
└── alarm-zones/
    ├── alarm-zone-card.tsx (main zone display)
    ├── alarm-zone-edit-dialog.tsx (create/edit)
    ├── alarm-zone-device-assignment-dialog.tsx
    ├── alarm-zone-trigger-rules-dialog.tsx
    └── alarm-zone-audit-log-dialog.tsx
```

## ⚠️ **WARNINGS & CAUTIONS**

1. **Backward Compatibility**: NO automated migration provided - legacy area data will be lost unless manually transferred

2. **Database Constraints**: The one-device-per-space constraint is enforced at database level - be careful with bulk device operations

3. **Event Processing**: Event processor has been updated to use spaces instead of areas - verify no area references remain

4. **Type Safety**: Many types still reference areas - expect TypeScript errors during cleanup that must be systematically resolved

5. **Testing**: The user prefers not to add test automation, so manual testing is critical during cleanup

## 🎯 **SUCCESS CRITERIA FOR COMPLETION**

### Phase 7 Complete When:
- [ ] All automation conditions/actions work with spaces/zones
- [ ] No automation references to legacy areas remain
- [ ] Migration guide created for existing automations

### Phase 8 Complete When:
- [ ] Zero area references in codebase (except historical comments)
- [ ] All TypeScript compilation errors resolved
- [ ] All API endpoints working without area dependencies
- [ ] Database schema cleaned up (areas/areaDevices tables removed)
- [ ] Manual testing confirms all functionality works

### Final Validation:
- [ ] Can create spaces and assign devices (one per space)
- [ ] Can create alarm zones and assign multiple devices
- [ ] Can arm/disarm zones with proper audit logging
- [ ] Camera associations work based on space proximity
- [ ] Event processing triggers zones correctly
- [ ] No console errors or TypeScript warnings

## 📋 **NEXT AGENT CHECKLIST**

1. **Start with Phase 7**: Update automation system to use new concepts
2. **Then Phase 8**: Systematically remove all area references
3. **Use search commands** above to find remaining area code
4. **Test thoroughly** after each major cleanup
5. **Update documentation** as you go
6. **Don't break existing space/alarm zone functionality**

The foundation is solid - now it's time to finish the migration! 🚀 