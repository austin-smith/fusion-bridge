import { Separator } from "@/components/ui/separator";
import React from "react";
import AutomationForm from "@/components/features/automations/AutomationForm";
import { db } from "@/data/db";
import { connectors, devices, locations, spaces } from "@/data/db/schema"; // Import locations and spaces
import { type AutomationConfig, type AutomationTrigger } from '@/lib/automation-schemas';
import { DeviceType, ArmedState } from "@/lib/mappings/definitions"; 
import type { Option as MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { actionHandlers, type IDeviceActionHandler } from "@/lib/device-actions"; // Import actionHandlers and IDeviceActionHandler
import { inArray, asc } from "drizzle-orm"; // Import inArray and asc
import type { Metadata } from 'next';
import { getDeviceTypeIconName } from '@/lib/mappings/presentation'; // Use getDeviceTypeIconName instead of getDeviceTypeIcon directly
import type { Location, Space, AlarmZone } from '@/types';
import { AutomationTriggerType } from '@/lib/automation-types';
import { auth } from "@/lib/auth/server";
import { createOrgScopedDb } from "@/lib/db/org-scoped-db";
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

// Define AutomationFormData to match the structure expected by the form
interface AutomationFormData {
    id: string;
    name: string; 
    enabled: boolean; 
    configJson: AutomationConfig; // Correctly use AutomationConfig here
    tags?: string[];
    createdAt: Date; 
    updatedAt: Date; 
}

// Set page title metadata
export const metadata: Metadata = {
  title: 'Add Automation // Fusion',
};

// --- BEGIN: Data fetching functions ---
async function getAvailableConnectors(orgDb: ReturnType<typeof createOrgScopedDb>) {
    const connectorsData = await orgDb.connectors.findAll();
    return connectorsData.map(c => ({
        id: c.id,
        name: c.name,
        category: c.category,
    }));
}

async function getAvailableTargetDevices(orgDb: ReturnType<typeof createOrgScopedDb>) {
    const allSupportedRawTypesByAnyHandler = new Set<string>();
    actionHandlers.forEach((handler: IDeviceActionHandler) => {
        if (typeof handler.getControllableRawTypes === 'function') {
            handler.getControllableRawTypes().forEach((rawType: string) => {
                allSupportedRawTypesByAnyHandler.add(rawType);
            });
        }
    });
    const rawTypesArray = Array.from(allSupportedRawTypesByAnyHandler);

    if (rawTypesArray.length === 0) {
        console.warn("[AutomationForm Data] No controllable raw types found. No devices will be targetable.");
        return [];
    }
    
    // Get all devices with space information
    const actionableDbDevices = await orgDb.devices.findAll();
    
    // Filter by supported raw types and map to the expected format
    const mappedDevices = actionableDbDevices
        .filter((d: any) => rawTypesArray.includes(d.type))
        .map((d: any) => {
            const stdType = d.standardizedDeviceType as DeviceType;
            return {
                id: d.id,
                name: d.name,
                displayType: d.standardizedDeviceType || d.type || 'Unknown Type',
                iconName: d.standardizedDeviceType
                    ? getDeviceTypeIconName(stdType)
                    : getDeviceTypeIconName(DeviceType.Unmapped),
                spaceId: d.spaceId,
                locationId: d.locationId
            };
        });
    return mappedDevices;
}

async function getDevicesForConditions(orgDb: ReturnType<typeof createOrgScopedDb>) {
    const conditionDevices = await orgDb.devices.findAll();
    
    return conditionDevices.map((d: any) => ({
        id: d.id,
        name: d.name,
        spaceId: d.spaceId,
        locationId: d.locationId
    }));
}

async function getAllLocations(orgDb: ReturnType<typeof createOrgScopedDb>): Promise<Location[]> {
    const dbLocations = await orgDb.locations.findAll();
    
    return dbLocations.map(location => ({
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
}

async function getAllSpaces(orgDb: ReturnType<typeof createOrgScopedDb>): Promise<Space[]> {
    const dbSpaces = await orgDb.spaces.findAll();
    
    return dbSpaces.map((space: any) => ({
        id: space.id,
        name: space.name,
        locationId: space.locationId,
        createdAt: space.createdAt,
        updatedAt: space.updatedAt
    }));
}

async function getAllAlarmZones(orgDb: ReturnType<typeof createOrgScopedDb>): Promise<AlarmZone[]> {
    const dbAlarmZones = await orgDb.alarmZones.findAll();
    
    return dbAlarmZones.map((zone: any) => ({
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
}

function getSourceDeviceTypeOptions(): MultiSelectOption[] {
    return Object.values(DeviceType)
        .filter(type => type !== DeviceType.Unmapped)
        .sort((a, b) => a.localeCompare(b))
        .map(typeValue => ({ 
            value: typeValue, 
            label: typeValue 
        }));
}
// --- END: Data fetching functions ---

export default async function NewAutomationPage() {
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
  
  // Fetch data concurrently
  const [
    availableConnectorsData, 
    availableTargetDevicesData, 
    sourceDeviceTypeOptionsData,
    devicesForConditionsData,
    allLocationsData,
    allSpacesData,
    allAlarmZonesData
  ] = await Promise.all([
    getAvailableConnectors(orgDb),
    getAvailableTargetDevices(orgDb),
    Promise.resolve(getSourceDeviceTypeOptions()), // Wrap sync function for Promise.all
    getDevicesForConditions(orgDb),
    getAllLocations(orgDb),
    getAllSpaces(orgDb),
    getAllAlarmZones(orgDb)
  ]);

  const initialData: AutomationFormData = {
    id: 'new', // Special ID for new automations
    name: '', // Start with an empty name
    enabled: true, // Default to enabled
    tags: [], // Default to no tags
    configJson: { 
      trigger: {
        type: AutomationTriggerType.EVENT,
        conditions: { any: [] },
      } as AutomationTrigger, // Explicitly cast to AutomationTrigger
      actions: [], // Default to no actions
      temporalConditions: [] // Default to no temporal conditions
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8 overflow-y-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Create New Automation</h2>
        <p className="text-muted-foreground">
          Set up a new rule to automate tasks.
        </p>
      </div>
      <Separator />
      <div className="pt-4">
        <AutomationForm 
          initialData={initialData} 
          availableConnectors={availableConnectorsData}
          sourceDeviceTypeOptions={sourceDeviceTypeOptionsData}
          availableTargetDevices={availableTargetDevicesData}
          devicesForConditions={devicesForConditionsData}
          allLocations={allLocationsData}
          allSpaces={allSpacesData}
          allAlarmZones={allAlarmZonesData}
        />
      </div>
    </div>
  );
} 