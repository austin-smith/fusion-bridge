import { Separator } from "@/components/ui/separator";
import React from "react";
import AutomationForm from "@/components/automations/AutomationForm";
import { db } from "@/data/db"; 
import { connectors, devices, automations as automationsSchema } from "@/data/db/schema";
import { eq, inArray, asc } from "drizzle-orm";
import type { MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { redirect, notFound } from 'next/navigation';
import { type AutomationConfig, type AutomationAction, type TemporalCondition } from "@/lib/automation-schemas";
import { DeviceType } from "@/lib/mappings/definitions";
import { actionHandlers, type IDeviceActionHandler } from "@/lib/device-actions";
import { getDeviceTypeIconName } from "@/lib/mappings/presentation";

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
  createdAt: Date;
  updatedAt: Date;
}

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
    console.log(`[DEBUG EDIT_PAGE] Collected rawTypesArray for DB query:`, rawTypesArray);

    if (rawTypesArray.length === 0) {
        console.warn("[AutomationForm Data / (manage)] No controllable raw types found. No devices will be targetable.");
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
    console.log(`[DEBUG EDIT_PAGE] Returning devices for dropdown (count: ${mappedDevices.length}):`, JSON.stringify(mappedDevices.slice(0,3)));
    return mappedDevices;
}

// Define the page component using the correct Next.js App Router pattern
export default async function EditAutomationPage({ params }: { params: Promise<EditAutomationPageParams> }) {
  const { id } = await params;
  
  // Data fetching logic (Promise.all, etc.) remains here
  const [automationResult, availableConnectorsResult, availableTargetDevicesResult, sourceDeviceTypeOptionsResult] = await Promise.all([
    db.query.automations.findFirst({
      where: eq(automationsSchema.id, id),
    }),
    db.select({ 
        id: connectors.id,
        name: connectors.name,
        category: connectors.category,
      }).from(connectors).orderBy(asc(connectors.name)),
    getAvailableTargetDevices(), // This function needs to be defined above or imported
    Promise.resolve( 
      Object.values(DeviceType)
        .filter(type => type !== DeviceType.Unmapped)
        .sort((a, b) => a.localeCompare(b))
        .map(typeValue => ({ 
            value: typeValue, 
            label: typeValue 
        }))
    )
  ]);

  if (!automationResult) {
    notFound();
  }

  const automation = automationResult;
  const formAvailableConnectors = availableConnectorsResult;
  const formAvailableTargetDevices = availableTargetDevicesResult;
  const formSourceDeviceTypeOptions = sourceDeviceTypeOptionsResult;
  
  let configJsonData: AutomationConfig = { 
    conditions: { all: [] }, 
    actions: [],
  };
  
  if (automation.configJson) {
    try {
      type PotentialConfig = {
          conditions?: unknown;
          actions?: unknown[]; 
          temporalConditions?: unknown[]; 
      };
      let parsedConfig: PotentialConfig | null = null;
      if (typeof automation.configJson === 'object' && automation.configJson !== null) {
        parsedConfig = automation.configJson as PotentialConfig; 
      } else if (typeof automation.configJson === 'string') {
        try {
            const parsed = JSON.parse(automation.configJson);
            if (typeof parsed === 'object' && parsed !== null) {
                parsedConfig = parsed as PotentialConfig;
            }
        } catch (jsonParseError) {
            console.error(`JSON parsing error for automation ${automation.id}:`, jsonParseError);
        }
      }
      if (parsedConfig && typeof parsedConfig === 'object' && Array.isArray(parsedConfig.actions)) {
         configJsonData = {
            conditions: parsedConfig.conditions ?? { all: [] },
            temporalConditions: Array.isArray(parsedConfig.temporalConditions) 
                                ? parsedConfig.temporalConditions as TemporalCondition[]
                                : undefined,
            actions: parsedConfig.actions as AutomationAction[],
         };
      }
    } catch (e) {
       console.error(`Failed to process configJson for automation ${automation.id}:`, e);
    }
  }
  
  const initialFormData: AutomationFormData = {
      id: automation.id,
      name: automation.name ?? '', // Ensure name is not null
      enabled: automation.enabled ?? true, // Ensure enabled is not null
      configJson: configJsonData,
      createdAt: automation.createdAt ?? new Date(), // Ensure createdAt is not null
      updatedAt: automation.updatedAt ?? new Date(), // Ensure updatedAt is not null
  };

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
        />
      </div>
    </div>
  );
}
// --- END: App Router Page Component --- 