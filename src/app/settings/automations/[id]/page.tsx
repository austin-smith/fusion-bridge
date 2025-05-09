import React from 'react';
import { db } from '@/data/db';
import { automations, connectors, devices } from '@/data/db/schema';
import { eq, inArray, asc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import AutomationForm from '@/components/automations/AutomationForm';
import type { AutomationConfig, AutomationAction, TemporalCondition } from '@/lib/automation-schemas';
import { deviceIdentifierMap } from '@/lib/mappings/identification';
import type { MultiSelectOption } from '@/components/ui/multi-select-combobox';
import { DeviceType, DeviceSubtype } from '@/lib/mappings/definitions';
import type { Connector } from '@/lib/types';
import { getDeviceTypeIconName } from '@/lib/mappings/presentation';
import { Separator } from "@/components/ui/separator";
import { actionHandlers, type IDeviceActionHandler } from "@/lib/device-actions";

// Type definition for the data needed by this page/form
// Should align with what getAutomationData returns and AutomationForm expects
export type AutomationPageData = {
  id: string;
  name: string | null;
  enabled: boolean | null;
  configJson: AutomationConfig | null; 
  createdAt: Date | null;
  updatedAt: Date | null;
};

// Fetch connectors needed for Action dropdowns
async function getAvailableConnectors(): Promise<Pick<Connector, 'id' | 'name' | 'category'>[]> {
    return db.select({ 
        id: connectors.id, 
        name: connectors.name, 
        category: connectors.category 
    }).from(connectors);
}

// Update MultiSelectOption to expect iconName (align with combobox definition change later)
interface PageMultiSelectOption {
  value: string;
  label: string;
  iconName?: string;
}

// Generates the options for Standardized Device Type dropdowns
function getStandardizedDeviceTypeOptions(): PageMultiSelectOption[] {
    const options: PageMultiSelectOption[] = []; 
    const addedValues = new Set<string>();
    const baseTypesEncountered = new Set<DeviceType>();

    // 1. Add specific Type.Subtype options ONLY
    Object.values(deviceIdentifierMap).forEach(categoryMap => {
        Object.values(categoryMap).forEach(mapping => {
            if (mapping.type === DeviceType.Unmapped) return;
            
            baseTypesEncountered.add(mapping.type);
            
            if (mapping.subtype) { 
                const value = `${mapping.type}.${mapping.subtype}`; 
                const label = `${mapping.type} / ${mapping.subtype}`;
                const iconName = getDeviceTypeIconName(mapping.type);
                
                if (!addedValues.has(value)) {
                    options.push({ value, label, iconName });
                    addedValues.add(value);
                }
            }
        });
    });

    // 2. Add "Type.*" options for all base types encountered
    baseTypesEncountered.forEach(type => {
        const value = `${type}.*`; // Use wildcard convention
        const label = `${type} (All)`; 
        const iconName = getDeviceTypeIconName(type);

        if (!addedValues.has(value)) {
            options.push({ value, label, iconName });
            addedValues.add(value);
        }
    });

    options.sort((a, b) => a.label.localeCompare(b.label));
    return options;
}

// Fetches existing automation data or returns structure for a new one
async function getAutomationData(id: string): Promise<AutomationPageData | null> {
    if (id === 'new') {
        // Return default structure for a new automation
        return {
            id: 'new',
            name: null,
            enabled: true,
            configJson: { // Default connector-agnostic config
                conditions: { all: [] }, // Default to empty all conditions
                temporalConditions: [], // Optional array of temporal conditions
                actions: [],
            },
            createdAt: null,
            updatedAt: null,
        };
    }

    // Fetch existing automation data
    try {
        const result = await db
            .select({
                id: automations.id,
                name: automations.name,
                enabled: automations.enabled,
                configJson: automations.configJson,
                createdAt: automations.createdAt,
                updatedAt: automations.updatedAt,
            })
            .from(automations)
            .where(eq(automations.id, id))
            .limit(1);

        if (result.length === 0) {
            return null; // Not found
        }
        
        const data = result[0];
        return {
            id: data.id,
            name: data.name,
            enabled: data.enabled,
            configJson: data.configJson as AutomationConfig | null, 
            createdAt: data.createdAt as Date | null,
            updatedAt: data.updatedAt as Date | null,
        };

    } catch (error) {
        console.error(`Failed to fetch automation ${id}:`, error);
        throw new Error("Failed to fetch automation data."); 
    }
}

// Copied getAvailableTargetDevices function (ensure it's identical to the tested one)
async function getAvailableTargetDevices() {
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

    if (rawTypesArray.length === 0) {
        console.warn("[AutomationForm Data /settings] No controllable raw types found. No devices will be targetable.");
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
    const mappedDevices = actionableDbDevices.map((d: typeof actionableDbDevices[number]) => {
        const stdType = d.standardizedDeviceType as DeviceType;
        return {
            id: d.id,
            name: d.name,
            displayType: d.standardizedDeviceType || d.type || 'Unknown Type',
            iconName: d.standardizedDeviceType ? getDeviceTypeIconName(stdType) : getDeviceTypeIconName(DeviceType.Unmapped) 
        };
    });
    return mappedDevices;
}

// Page Component for editing or creating an automation
export default async function AutomationSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: automationId } = await params; 
  const standardizedDeviceTypes = getStandardizedDeviceTypeOptions(); 

  // Fetch automation data and available connectors concurrently
  const [initialData, availableConnectors] = await Promise.all([
    getAutomationData(automationId),
    getAvailableConnectors(),
  ]);

  // Handle case where an existing automation ID was not found
  if (!initialData && automationId !== 'new') {
    notFound();
  }

  // Handle case where fetching failed even for 'new' (should be rare)
  if (!initialData) {
     return <div>Error loading automation configuration. Failed to fetch initial data.</div>;
  }

  const title = automationId === 'new' ? 'Create New Automation' : `Edit Automation: ${initialData.name ?? '[Untitled]'}`;

  // Prepare the final data structure for the form, ensuring non-null values where the form expects them
  const formData = {
    id: initialData.id, 
    name: initialData.name ?? '', 
    enabled: initialData.enabled ?? true, 
    // Provide a default config if null (for 'new' case)
    configJson: initialData.configJson ?? {
        conditions: { all: [] }, // Default to empty all conditions
        temporalConditions: [], // Optional array of temporal conditions
        actions: [],
    },
    createdAt: initialData.createdAt ?? new Date(), 
    updatedAt: initialData.updatedAt ?? new Date(),
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">{title}</h1>
      {/* Pass the options with iconName */}
      <AutomationForm 
        initialData={formData as any} 
        availableConnectors={availableConnectors} 
        sourceDeviceTypeOptions={standardizedDeviceTypes}
        availableTargetDevices={await getAvailableTargetDevices()}
      />
    </div>
  );
} 