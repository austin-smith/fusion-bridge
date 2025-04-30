import { Separator } from "@/components/ui/separator";
import React from "react";
import AutomationForm from "@/components/automations/AutomationForm";
import { db } from "@/data/db"; 
import { connectors } from "@/data/db/schema";
import { automations } from "@/data/db/schema";
import { eq } from "drizzle-orm";
import { deviceIdentifierMap } from "@/lib/mappings/identification";
import type { MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { redirect } from 'next/navigation';
import { type AutomationConfig, type AutomationAction, type TemporalCondition } from "@/lib/automation-schemas";
import { DeviceType } from "@/lib/mappings/definitions";

// Define AutomationFormData based on its usage for the form
interface AutomationFormData {
  id: string;
  name: string;
  enabled: boolean;
  configJson: AutomationConfig;
  createdAt: Date;
  updatedAt: Date;
}

interface EditAutomationPageProps {
  // Explicitly type params as a Promise
  params: Promise<{ 
    id: string; // ID from the URL
  }>;
}

// Make the page component async to fetch data
export default async function EditAutomationPage({ params }: EditAutomationPageProps) {
  
  // --- START: Integrated getFormDataForEdit logic --- 
  // Await the params promise and destructure id
  const { id } = await params;

  // Fetch the specific automation by ID, using the awaited id
  const automation = await db.query.automations.findFirst({
    where: eq(automations.id, id), // Use the awaited id
  });

  // If automation not found, trigger a 404
  if (!automation) {
    redirect('/');
  }

  // Fetch all connectors for the dropdowns
  const availableConnectors = await db.select({ 
      id: connectors.id,
      name: connectors.name,
      category: connectors.category,
    }).from(connectors);
    
  // --- CORRECTED: Prepare options using DeviceType enum --- 
  const sourceDeviceTypeOptions: MultiSelectOption[] = Object.values(DeviceType)
    .filter(type => type !== DeviceType.Unmapped)
    .sort((a, b) => a.localeCompare(b))
    .map(typeValue => ({ 
        value: typeValue, 
        label: typeValue 
    }));
    
  // Prepare initial data structure from the fetched automation
  let configJsonData: AutomationConfig = { 
    // Structure should match AutomationConfig schema
    conditions: { all: [] }, // Default to empty all conditions
    actions: [],
    // temporalConditions can be added later if needed
  };
  
  // Check if configJson exists and is not null/undefined before trying to parse
  if (automation.configJson) {
    try {
      // Define a potential structure for the parsed config
      // This helps avoid 'any' and provides better type checking
      type PotentialConfig = {
          conditions?: unknown;
          actions?: unknown[]; 
          temporalConditions?: unknown[]; 
      };
      
      let parsedConfig: PotentialConfig | null = null; // Start with null
      
      if (typeof automation.configJson === 'object' && automation.configJson !== null) {
        parsedConfig = automation.configJson as PotentialConfig; 
      } else if (typeof automation.configJson === 'string') {
        const parsed = JSON.parse(automation.configJson);
        if (typeof parsed === 'object' && parsed !== null) {
            parsedConfig = parsed as PotentialConfig;
        } else {
             console.warn(`Parsed configJson string was not a valid object for automation ${automation.id}.`);
        }
      }

      if (parsedConfig && 
          typeof parsedConfig === 'object' &&
          Array.isArray(parsedConfig.actions)) 
      {
         configJsonData = {
            conditions: parsedConfig.conditions ?? { all: [] }, // Default to empty all conditions if none exist
            temporalConditions: Array.isArray(parsedConfig.temporalConditions) 
                                ? parsedConfig.temporalConditions as TemporalCondition[]
                                : undefined,
            actions: parsedConfig.actions as AutomationAction[],
         };
      } else if (parsedConfig) {
          console.warn(`Parsed configJson for automation ${automation.id} is invalid or missing required fields. Using default empty config.`);
      }

    } catch (e) {
       console.error(`Failed to parse configJson for automation ${automation.id}:`, e);
       // Keep the default empty configJsonData on error
    }
  } else {
      console.warn(`configJson is null or empty for automation ${automation.id}. Using default empty config.`);
  }
  
  const initialData: AutomationFormData = {
      id: automation.id, // Use the ID fetched from the database record
      name: automation.name,
      enabled: automation.enabled,
      configJson: configJsonData,
      createdAt: automation.createdAt, 
      updatedAt: automation.updatedAt,
  };
  // --- END: Integrated getFormDataForEdit logic ---

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      {/* Heading */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Edit Automation</h2>
        <p className="text-muted-foreground">
          Modify the rule: {initialData.name}
        </p>
      </div>
      <Separator />
      {/* Render the Automation Form Component */}
      <div className="pt-4">
        <AutomationForm 
          initialData={initialData} 
          availableConnectors={availableConnectors}
          sourceDeviceTypeOptions={sourceDeviceTypeOptions}
        />
      </div>
    </div>
  );
} 