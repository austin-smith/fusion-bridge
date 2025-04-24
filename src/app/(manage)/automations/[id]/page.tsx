import { Separator } from "@/components/ui/separator";
import React from "react";
import AutomationForm from "@/components/automations/AutomationForm"; // Default import
import { db } from "@/data/db"; 
import { nodes } from "@/data/db/schema"; 
import { automations } from "@/data/db/schema"; // Import automations schema
import { eq } from "drizzle-orm";
import { deviceIdentifierMap } from "@/lib/mappings/identification"; // Corrected path
import type { MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { redirect } from 'next/navigation'; // For handling non-existent IDs
import { type AutomationConfig, type AutomationAction } from "@/lib/automation-schemas"; // Import necessary types 
import { DeviceType } from "@/lib/mappings/definitions"; // <-- Ensure DeviceType is imported

// Define AutomationFormData based on its usage for the form
interface AutomationFormData {
  id: string;
  name: string;
  enabled: boolean;
  sourceNodeId: string;
  configJson: AutomationConfig; // Use the imported AutomationConfig type
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

  // Fetch all nodes for the dropdowns
  const availableNodes = await db.select({ 
      id: nodes.id,
      name: nodes.name,
      category: nodes.category,
    }).from(nodes);
    
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
    sourceEntityTypes: [], 
    eventTypeFilter: '', 
    actions: [] 
  };
  
  // Check if configJson exists and is not null/undefined before trying to parse
  if (automation.configJson) {
    try {
      // Define a potential structure for the parsed config
      // This helps avoid 'any' and provides better type checking
      type PotentialConfig = {
          sourceEntityTypes?: unknown[]; // Allow unknown initially
          eventTypeFilter?: unknown;
          actions?: unknown[]; // Allow unknown initially
      };
      
      let parsedConfig: PotentialConfig | null = null; // Start with null
      
      if (typeof automation.configJson === 'object' && automation.configJson !== null) {
        // If it's already an object (and not null), assume it fits the potential structure
        // We still need runtime checks below
        parsedConfig = automation.configJson as PotentialConfig; 
      } else if (typeof automation.configJson === 'string') {
        // If it's a string, try to parse it
        const parsed = JSON.parse(automation.configJson);
        // Basic check if the parsed result is an object
        if (typeof parsed === 'object' && parsed !== null) {
            parsedConfig = parsed as PotentialConfig;
        } else {
             console.warn(`Parsed configJson string was not a valid object for automation ${automation.id}.`);
        }
      }

      // IMPORTANT: Check if parsedConfig is a valid object and has the required arrays
      // Now checks against the PotentialConfig type and validates array types
      if (parsedConfig && 
          Array.isArray(parsedConfig.sourceEntityTypes) && 
          Array.isArray(parsedConfig.actions)) 
      {
         configJsonData = {
            // Ensure sourceEntityTypes contains only strings if possible, or handle mixed types if needed
            sourceEntityTypes: parsedConfig.sourceEntityTypes.filter(item => typeof item === 'string') as string[], 
            // Safely access eventTypeFilter, default to empty string if not a string or missing
            eventTypeFilter: typeof parsedConfig.eventTypeFilter === 'string' ? parsedConfig.eventTypeFilter : '', 
            // Assume actions are correctly structured - potential area for more specific validation/typing
            actions: parsedConfig.actions as AutomationAction[], 
         };
      } else if (parsedConfig) { // Only warn if parsedConfig was created but failed validation
          console.warn(`Parsed configJson for automation ${automation.id} is invalid or missing required fields (sourceEntityTypes/actions arrays). Using default empty config.`);
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
      sourceNodeId: automation.sourceNodeId,
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
          initialData={initialData} // Use locally fetched data
          availableNodes={availableNodes} // Use locally fetched data
          sourceDeviceTypeOptions={sourceDeviceTypeOptions} // Pass corrected options
        />
      </div>
    </div>
  );
} 