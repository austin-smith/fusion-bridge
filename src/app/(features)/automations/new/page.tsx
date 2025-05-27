import { Separator } from "@/components/ui/separator";
import React from "react";
import AutomationForm from "@/components/features/automations/AutomationForm";
import { db } from "@/data/db";
import { connectors, devices, locations, areas } from "@/data/db/schema"; // Import locations and areas
import { type AutomationConfig, type AutomationTrigger } from '@/lib/automation-schemas';
import { DeviceType, ArmedState } from "@/lib/mappings/definitions"; 
import type { Option as MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { actionHandlers, type IDeviceActionHandler } from "@/lib/device-actions"; // Import actionHandlers and IDeviceActionHandler
import { inArray, asc } from "drizzle-orm"; // Import inArray and asc
import type { Metadata } from 'next';
import { getDeviceTypeIconName } from '@/lib/mappings/presentation'; // Use getDeviceTypeIconName instead of getDeviceTypeIcon directly
import type { Location, Area } from '@/types';
import { AutomationTriggerType } from '@/lib/automation-types';

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
async function getAvailableConnectors() {
    return db.select({ 
        id: connectors.id,
        name: connectors.name,
        category: connectors.category,
      }).from(connectors).orderBy(asc(connectors.name));
}

async function getAvailableTargetDevices() {
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
    const actionableDbDevices = await db.query.devices.findMany({
        columns: {
            id: true,
            name: true,
            standardizedDeviceType: true,
            type: true
        },
        with: {
            areaDevices: {
                columns: {
                    areaId: true
                }
            }
        },
        where: inArray(devices.type, rawTypesArray),
        orderBy: [asc(devices.name)]
    });
    
    const mappedDevices = actionableDbDevices.map((d: any) => {
        const stdType = d.standardizedDeviceType as DeviceType;
        return {
            id: d.id,
            name: d.name,
            displayType: d.standardizedDeviceType || d.type || 'Unknown Type',
            iconName: d.standardizedDeviceType
                ? getDeviceTypeIconName(stdType)
                : getDeviceTypeIconName(DeviceType.Unmapped),
            areaId: d.areaDevices && d.areaDevices.length > 0 ? d.areaDevices[0].areaId : null,
            locationId: null // We'll need to join with areas to get this later if needed
        };
    });
    return mappedDevices;
}

async function getDevicesForConditions() {
    const conditionDevices = await db.query.devices.findMany({
        columns: {
            id: true,
            name: true
        },
        with: {
            areaDevices: {
                columns: {
                    areaId: true
                }
            }
        },
        orderBy: [asc(devices.name)]
    });
    
    return conditionDevices.map((d: any) => ({
        id: d.id,
        name: d.name,
        areaId: d.areaDevices && d.areaDevices.length > 0 ? d.areaDevices[0].areaId : null,
        locationId: null // We'll need to join with areas to get this later if needed
    }));
}

async function getAllLocations(): Promise<Location[]> {
    const dbLocations = await db.select({
        id: locations.id,
        parentId: locations.parentId,
        name: locations.name,
        path: locations.path,
        timeZone: locations.timeZone,
        addressStreet: locations.addressStreet,
        addressCity: locations.addressCity,
        addressState: locations.addressState, 
        addressPostalCode: locations.addressPostalCode,
        createdAt: locations.createdAt,
        updatedAt: locations.updatedAt
    }).from(locations).orderBy(asc(locations.name));
    
    return dbLocations;
}

async function getAllAreas(): Promise<Area[]> {
    const dbAreas = await db.select({
        id: areas.id,
        name: areas.name,
        locationId: areas.locationId,
        armedState: areas.armedState,
        createdAt: areas.createdAt,
        updatedAt: areas.updatedAt
    }).from(areas).orderBy(asc(areas.name));
    
    return dbAreas;
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
  // Fetch data concurrently
  const [
    availableConnectorsData, 
    availableTargetDevicesData, 
    sourceDeviceTypeOptionsData,
    devicesForConditionsData,
    allLocationsData,
    allAreasData
  ] = await Promise.all([
    getAvailableConnectors(),
    getAvailableTargetDevices(),
    Promise.resolve(getSourceDeviceTypeOptions()), // Wrap sync function for Promise.all
    getDevicesForConditions(),
    getAllLocations(),
    getAllAreas()
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
          allAreas={allAreasData}
        />
      </div>
    </div>
  );
} 