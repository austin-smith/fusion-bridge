import React from 'react';
import { Separator } from "@/components/ui/separator";
import AutomationForm from "@/components/automations/AutomationForm";
import { type AutomationConfig } from '@/lib/automation-schemas';
import type { MultiSelectOption } from "@/components/ui/multi-select-combobox";
import type { Metadata } from 'next';

// Core imports that were potentially missing from the broader file context
import { db } from "@/data/db";
import { devices, connectors } from "@/data/db/schema";
import { inArray, asc } from "drizzle-orm";
import { actionHandlers, type IDeviceActionHandler } from "@/lib/device-actions";
import { DeviceType } from "@/lib/mappings/definitions";
import { getDeviceTypeIconName } from "@/lib/mappings/presentation";

// Define AutomationFormData to match the structure expected by the form
interface AutomationFormData {
    id: string;
    name: string; 
    enabled: boolean; 
    configJson: AutomationConfig; 
    createdAt: Date; 
    updatedAt: Date; 
}

// Set page title metadata (assuming this is desired here)
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
        where: inArray(devices.type, rawTypesArray),
        orderBy: [asc(devices.name)]
    });
    return actionableDbDevices.map((d: typeof actionableDbDevices[number]) => {
        const stdType = d.standardizedDeviceType as DeviceType; 
        return {
            id: d.id,
            name: d.name,
            displayType: d.standardizedDeviceType || d.type || 'Unknown Type',
            iconName: d.standardizedDeviceType ? getDeviceTypeIconName(stdType) : getDeviceTypeIconName(DeviceType.Unmapped) 
        };
    });
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
  const [availableConnectorsData, availableTargetDevicesData, sourceDeviceTypeOptionsData] = await Promise.all([
    getAvailableConnectors(),
    getAvailableTargetDevices(),
    Promise.resolve(getSourceDeviceTypeOptions()) 
  ]);

  const initialData: AutomationFormData = {
    id: 'new',
    name: '',
    enabled: true,
    configJson: { 
      conditions: { any: [] },
      actions: [],
      temporalConditions: []
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
        />
      </div>
    </div>
  );
} 