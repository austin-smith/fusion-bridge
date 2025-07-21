import { Separator } from "@/components/ui/separator";
import React from "react";
import AutomationForm from "@/components/features/automations/AutomationForm";
import { db } from "@/data/db"; 
import { connectors, devices, automations as automationsSchema, locations, spaces, alarmZones } from "@/data/db/schema";
import { eq, inArray, asc } from "drizzle-orm";
import { redirect, notFound } from 'next/navigation';
import { AutomationConfigSchema, type AutomationConfig, type AutomationAction, type TemporalCondition } from "@/lib/automation-schemas";
import { AutomationTriggerType } from "@/lib/automation-types";
import { DeviceType } from "@/lib/mappings/definitions";
import { actionHandlers, type IDeviceActionHandler } from "@/lib/device-actions";
import { getDeviceTypeIconName } from "@/lib/mappings/presentation";
import type { Location, Space, AlarmZone } from '@/types';
import { auth } from "@/lib/auth/server";
import { createOrgScopedDb } from "@/lib/db/org-scoped-db";
import { headers } from 'next/headers';

// Define specific params type for this page
interface EditAutomationPageParams {
  id: string;
}

// Define AutomationFormData based on its usage for the form
interface AutomationFormData {
  id: string;
  name: string;
  enabled: boolean;
  configJson: AutomationConfig;
  locationScopeId?: string | null;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Define the page component using the correct Next.js App Router pattern
export default async function EditAutomationPage({ params }: { params: Promise<EditAutomationPageParams> }) {
  const { id } = await params;
  
  // Get the session to check authentication and active organization
  const headersList = await headers();
  const plainHeaders: Record<string, string> = {};
  for (const [key, value] of headersList.entries()) {
    plainHeaders[key] = value;
  }
  
  const session = await auth.api.getSession({ headers: plainHeaders as any });
  
  if (!session?.user) {
    redirect('/login');
    return null;
  }
  
  const activeOrganizationId = session?.session?.activeOrganizationId;
  
  if (!activeOrganizationId) {
    throw new Error('No active organization found. Please select an organization first.');
  }
  
  // Create organization-scoped database client
  const orgDb = createOrgScopedDb(activeOrganizationId);
  
  // Calculate synchronous options outside Promise.all
  const formSourceDeviceTypeOptions = Object.values(DeviceType)
    .filter(type => type !== DeviceType.Unmapped)
    .sort((a, b) => a.localeCompare(b))
    .map(typeValue => ({ 
        value: typeValue, 
        label: typeValue 
    }));
    
  // Data fetching logic using organization-scoped database
  const [
    automationResult, 
    availableConnectorsResult, 
    allDevicesResult, 
    allLocationsResult, 
    allSpacesResult,
    allAlarmZonesResult
  ] = await Promise.all([
    orgDb.automations.findById(id),
    orgDb.connectors.findAll(),
    orgDb.devices.findAll(),
    orgDb.locations.findAll(),
    orgDb.spaces.findAll(),
    orgDb.alarmZones.findAll()
  ]);

  // Check if automation exists in this organization
  if (!automationResult || automationResult.length === 0) {
    notFound();
  }

  const automation = automationResult[0];
  const formAvailableConnectors = availableConnectorsResult.map((c: any) => ({
    id: c.id,
    name: c.name,
    category: c.category,
  }));
  const formAllLocations = allLocationsResult.map((location: any) => ({
    id: location.id,
    parentId: location.parentId,
    name: location.name,
    path: location.path,
    timeZone: location.timeZone,
    addressStreet: location.addressStreet,
    addressCity: location.addressCity,
    addressState: location.addressState,
    addressPostalCode: location.addressPostalCode,
    createdAt: location.createdAt,
    updatedAt: location.updatedAt
  }));
  const formAllSpaces = allSpacesResult.map((space: any) => ({
    id: space.id,
    name: space.name,
    locationId: space.locationId,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt
  }));
  const formAllAlarmZones: AlarmZone[] = allAlarmZonesResult.map((zone: any) => ({
    id: zone.id,
    locationId: zone.locationId,
    name: zone.name,
    description: zone.description,
    armedState: zone.armedState,
    lastArmedStateChangeReason: zone.lastArmedStateChangeReason,
    triggerBehavior: zone.triggerBehavior,
    createdAt: zone.createdAt,
    updatedAt: zone.updatedAt,
    // Don't include partial location data - let the component fetch full location if needed
    location: undefined
  }));
  
  let processedConfigJson: AutomationConfig;

  const defaultConfig: AutomationConfig = {
    trigger: { type: AutomationTriggerType.EVENT, conditions: { any: [] } },
    actions: [],
    temporalConditions: [],
  };

  if (automation.configJson && typeof automation.configJson === 'object') {
    const parseResult = AutomationConfigSchema.safeParse(automation.configJson);
    if (parseResult.success) {
      processedConfigJson = parseResult.data;
    } else {
      processedConfigJson = defaultConfig;
    }
  } else if (typeof automation.configJson === 'string') {
      try {
          const parsedDbJson = JSON.parse(automation.configJson);
          const parseResult = AutomationConfigSchema.safeParse(parsedDbJson);
          if (parseResult.success) {
              processedConfigJson = parseResult.data;
          } else {
              processedConfigJson = defaultConfig;
          }
      } catch (e) {
          processedConfigJson = defaultConfig;
      }
  } else {
    processedConfigJson = defaultConfig;
  }
  
  const initialFormData: AutomationFormData = {
      id: automation.id,
      name: automation.name ?? '', // Ensure name is not null
      enabled: automation.enabled ?? true, // Ensure enabled is not null
      locationScopeId: automation.locationScopeId ?? null,
      tags: automation.tags ?? [], // Include tags from database
      configJson: processedConfigJson,
      createdAt: automation.createdAt ?? new Date(), // Ensure createdAt is not null
      updatedAt: automation.updatedAt ?? new Date(), // Ensure updatedAt is not null
  };

  // --- START: Process allDevicesResult to create the two lists ---
  
  // Determine controllable raw types from action handlers
  const allSupportedRawTypesByAnyHandler = new Set<string>();
  actionHandlers.forEach((handler: IDeviceActionHandler) => {
      if (typeof handler.getControllableRawTypes === 'function') {
          const rawTypes = handler.getControllableRawTypes();
          rawTypes.forEach((rawType: string) => {
              allSupportedRawTypesByAnyHandler.add(rawType);
          });
      } 
  });
  const rawTypesArray = Array.from(allSupportedRawTypesByAnyHandler);

  // 1. Determine Targetable Devices (for Actions)
  let formAvailableTargetDevices: Array<{ id: string; name: string; displayType: string; iconName: string; spaceId?: string | null; locationId?: string | null; }> = [];
  if (rawTypesArray.length > 0) {
      formAvailableTargetDevices = allDevicesResult
          .filter((d: any) => rawTypesArray.includes(d.type)) // Filter by controllable raw types
          .map((d: any) => {
              const stdType = d.standardizedDeviceType as DeviceType;
              // This list is for Action targets, display fields are important.
              return {
                  id: d.id,
                  name: d.name,
                  displayType: d.standardizedDeviceType || d.type || 'Unknown Type',
                  iconName: d.standardizedDeviceType ? getDeviceTypeIconName(stdType) : getDeviceTypeIconName(DeviceType.Unmapped),
                  spaceId: d.spaceId, // Include spaceId for display/context
                  locationId: d.locationId, // Include locationId for scoping
              };
          });
  }

  // 2. Prepare Full List for Conditions (for RuleBuilder)
  // RuleBuilder expects: { id: string; name: string; spaceId?: string | null; locationId?: string | null; }
  // It uses the spaceId to look up the space in the `allSpaces` prop (which contains space.locationId)
  // to perform location-based scoping.
  const devicesForConditions = allDevicesResult.map((d: any) => ({
      id: d.id,
      name: d.name,
      spaceId: d.spaceId, // This is crucial for RuleBuilder's updated logic
      locationId: d.locationId, // Include locationId for scoping
  }));

  // --- END: Process allDevicesResult ---

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Edit Automation</h2>
        <p className="text-muted-foreground">
          Modify the rule: {initialFormData.name}
        </p>
      </div>
      <Separator />
      <div className="pt-4">
        <AutomationForm 
          initialData={initialFormData} 
          availableConnectors={formAvailableConnectors}
          sourceDeviceTypeOptions={formSourceDeviceTypeOptions}
          availableTargetDevices={formAvailableTargetDevices}
          devicesForConditions={devicesForConditions}
          allLocations={formAllLocations}
          allSpaces={formAllSpaces}
          allAlarmZones={formAllAlarmZones}
        />
      </div>
    </div>
  );
}
// --- END: App Router Page Component --- 