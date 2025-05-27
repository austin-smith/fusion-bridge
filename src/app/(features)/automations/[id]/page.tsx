import { Separator } from "@/components/ui/separator";
import React from "react";
import AutomationForm from "@/components/features/automations/AutomationForm";
import { db } from "@/data/db"; 
import { connectors, devices, automations as automationsSchema, locations, areas, areaDevices } from "@/data/db/schema";
import { eq, inArray, asc } from "drizzle-orm";
import { redirect, notFound } from 'next/navigation';
import { AutomationConfigSchema, type AutomationConfig, type AutomationAction, type TemporalCondition } from "@/lib/automation-schemas";
import { AutomationTriggerType } from "@/lib/automation-types";
import { DeviceType } from "@/lib/mappings/definitions";
import { actionHandlers, type IDeviceActionHandler } from "@/lib/device-actions";
import { getDeviceTypeIconName } from "@/lib/mappings/presentation";
import type { Location, Area } from '@/types';

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
  
  // Calculate synchronous options outside Promise.all
  const formSourceDeviceTypeOptions = Object.values(DeviceType)
    .filter(type => type !== DeviceType.Unmapped)
    .sort((a, b) => a.localeCompare(b))
    .map(typeValue => ({ 
        value: typeValue, 
        label: typeValue 
    }));
    
  // Data fetching logic
  const [
    automationResult, 
    availableConnectorsResult, 
    // We will fetch all devices here and then process them
    allDbDevicesWithJoins, 
    allLocationsResult, 
    allAreasResult
  ] = await Promise.all([
    db.query.automations.findFirst({
      where: eq(automationsSchema.id, id),
    }),
    db.select({ 
        id: connectors.id,
        name: connectors.name,
        category: connectors.category,
      }).from(connectors).orderBy(asc(connectors.name)),
    // NEW: Fetch all devices with necessary fields including join for areaId
    db.select({
        id: devices.id,
        name: devices.name,
        type: devices.type, // The device type string from the database, used by actionHandlers to determine controllability
        standardizedDeviceType: devices.standardizedDeviceType, // For displaying target devices
        areaId: areaDevices.areaId, // Joined from areaDevices - Used by RuleBuilder via allAreas prop
    }).from(devices)
      .leftJoin(areaDevices, eq(devices.id, areaDevices.deviceId))
      // No need to join 'areas' here; RuleBuilder uses areaId + allAreas prop.
      .orderBy(asc(devices.name)),
    db.query.locations.findMany({ orderBy: [asc(locations.name)] }) as Promise<Location[]>,
    db.query.areas.findMany({ orderBy: [asc(areas.name)] }) as Promise<Area[]>,
  ]);

  if (!automationResult) {
    notFound();
  }

  const automation = automationResult;
  const formAvailableConnectors = availableConnectorsResult;
  const formAllLocations = allLocationsResult;
  const formAllAreas = allAreasResult;
  
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

  // --- START: Process allDbDevicesWithJoins to create the two lists ---
  
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
  let formAvailableTargetDevices: Array<{ id: string; name: string; displayType: string; iconName: string; areaId?: string | null; }> = [];
  if (rawTypesArray.length > 0) {
      formAvailableTargetDevices = allDbDevicesWithJoins
          .filter(d => rawTypesArray.includes(d.type)) // Filter by controllable raw types
          .map(d => {
              const stdType = d.standardizedDeviceType as DeviceType;
              // This list is for Action targets, display fields are important.
              return {
                  id: d.id,
                  name: d.name,
                  displayType: d.standardizedDeviceType || d.type || 'Unknown Type',
                  iconName: d.standardizedDeviceType ? getDeviceTypeIconName(stdType) : getDeviceTypeIconName(DeviceType.Unmapped),
                  areaId: d.areaId, // Include areaId, might be useful for display/context
              };
          });
  }

  // 2. Prepare Full List for Conditions (for RuleBuilder)
  // RuleBuilder expects: { id: string; name: string; areaId?: string | null; }
  // It uses the areaId to look up the area in the `allAreas` prop (which contains area.locationId)
  // to perform location-based scoping.
  const devicesForConditions = allDbDevicesWithJoins.map(d => ({
      id: d.id,
      name: d.name,
      areaId: d.areaId, // This is crucial for RuleBuilder's existing logic
  }));

  // --- END: Process allDbDevicesWithJoins ---

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Edit Automation</h2>
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
          allAreas={formAllAreas}
        />
      </div>
    </div>
  );
}
// --- END: App Router Page Component --- 