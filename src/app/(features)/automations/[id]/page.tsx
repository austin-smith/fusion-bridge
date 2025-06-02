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
    allAreasResult
  ] = await Promise.all([
    orgDb.automations.findById(id),
    orgDb.connectors.findAll(),
    orgDb.devices.findAll(),
    orgDb.locations.findAll(),
    orgDb.areas.findAll()
  ]);

  // Check if automation exists in this organization
  if (!automationResult || automationResult.length === 0) {
    notFound();
  }

  const automation = automationResult[0];
  const formAvailableConnectors = availableConnectorsResult.map(c => ({
    id: c.id,
    name: c.name,
    category: c.category,
  }));
  const formAllLocations = allLocationsResult.map(location => ({
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
  const formAllAreas = allAreasResult.map(area => ({
    id: area.id,
    name: area.name,
    locationId: area.location.id,
    armedState: area.armedState,
    createdAt: area.createdAt,
    updatedAt: area.updatedAt
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
  let formAvailableTargetDevices: Array<{ id: string; name: string; displayType: string; iconName: string; areaId?: string | null; }> = [];
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
                  areaId: d.areaId, // Include areaId, might be useful for display/context
              };
          });
  }

  // 2. Prepare Full List for Conditions (for RuleBuilder)
  // RuleBuilder expects: { id: string; name: string; areaId?: string | null; }
  // It uses the areaId to look up the area in the `allAreas` prop (which contains area.locationId)
  // to perform location-based scoping.
  const devicesForConditions = allDevicesResult.map((d: any) => ({
      id: d.id,
      name: d.name,
      areaId: d.areaId, // This is crucial for RuleBuilder's existing logic
  }));

  // --- END: Process allDevicesResult ---

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