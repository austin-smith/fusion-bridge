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
import { type AutomationConfig, type AutomationAction, type SecondaryCondition } from "@/lib/automation-schemas";
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
    primaryTrigger: { 
      sourceEntityTypes: [], 
      // eventTypeFilter should be array based on schema update
      eventTypeFilter: [], 
    },
    actions: [] 
    // secondaryConditions can be added later if needed for default
  };
  
  // Check if configJson exists and is not null/undefined before trying to parse
  if (automation.configJson) {
    try {
      // Define a potential structure for the parsed config
      // This helps avoid 'any' and provides better type checking
      type PotentialConfig = {
          primaryTrigger?: unknown;
          actions?: unknown[]; // Allow unknown initially
          secondaryConditions?: unknown[]; // Allow unknown initially
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
          parsedConfig.primaryTrigger && // Check if primaryTrigger exists
          typeof parsedConfig.primaryTrigger === 'object' && // Check if it's an object
          !Array.isArray(parsedConfig.primaryTrigger) && // Ensure it's not an array
          Array.isArray((parsedConfig.primaryTrigger as any).sourceEntityTypes) && 
          Array.isArray(parsedConfig.actions)) 
      {
         // Type cast primaryTrigger safely after checks
         const trigger = parsedConfig.primaryTrigger as { 
             sourceEntityTypes?: unknown[]; 
             eventTypeFilter?: unknown;
         };
         
         // Helper to ensure eventTypeFilter is an array of strings
         const ensureEventFilterArray = (filter: unknown): string[] => {
             if (Array.isArray(filter)) {
                 return filter.filter(item => typeof item === 'string') as string[];
             }
             // Handle legacy single string filter (or invalid types)
             if (typeof filter === 'string' && filter.trim() !== '') {
                 return [filter.trim()];
             }
             return []; // Default to empty array
         };

         configJsonData = {
            primaryTrigger: {
              // Ensure sourceEntityTypes contains only strings 
              sourceEntityTypes: trigger.sourceEntityTypes?.filter(item => typeof item === 'string') as string[] ?? [], 
              // Ensure eventTypeFilter is array of strings
              eventTypeFilter: ensureEventFilterArray(trigger.eventTypeFilter), 
            },
            // Assume actions are correctly structured - potential area for more specific validation/typing
            actions: parsedConfig.actions as AutomationAction[], 
            // Add basic validation for secondaryConditions
            secondaryConditions: Array.isArray(parsedConfig.secondaryConditions) 
                                ? parsedConfig.secondaryConditions as SecondaryCondition[]
                                : undefined,
         };
      } else if (parsedConfig) { // Only warn if parsedConfig was created but failed validation
          console.warn(`Parsed configJson for automation ${automation.id} is invalid or missing required fields (primaryTrigger object with sourceEntityTypes array, actions array). Using default empty config.`);
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