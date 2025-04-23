import { Separator } from "@/components/ui/separator";
import React from "react";
import AutomationForm from "@/components/automations/AutomationForm"; // Default import
import { db } from "@/data/db"; 
import { nodes } from "@/data/db/schema"; 
import { automations } from "@/data/db/schema"; // Import automations schema
import { eq } from "drizzle-orm";
import { deviceIdentifierMap } from "@/lib/device-mapping"; 
import type { MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { notFound } from 'next/navigation'; // For handling non-existent IDs
import { type AutomationConfig, type AutomationAction } from "@/lib/automation-schemas"; // Import necessary types 

// Define AutomationFormData based on its usage for the form
interface AutomationFormData {
  id: string;
  name: string;
  enabled: boolean;
  sourceNodeId: string;
  targetNodeId: string;
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
    notFound();
  }

  // Fetch all nodes for the dropdowns
  const availableNodes = await db.select({ 
      id: nodes.id,
      name: nodes.name,
      category: nodes.category,
    }).from(nodes);
    
  // Prepare options for the Source Device Types multi-select combobox
  const sourceDeviceTypeOptions: MultiSelectOption[] = Object.entries(deviceIdentifierMap.yolink)
    .map(([value, info]) => ({ // info is unused here, but kept for consistency
        value, 
        label: value // Use the device type string (value) as the label
    }))
    .sort((a, b) => a.label.localeCompare(b.label)); // Sort alphabetically by label
    
  // Prepare initial data structure from the fetched automation
  let configJsonData: AutomationConfig = { 
    sourceEntityTypes: [], 
    eventTypeFilter: '', 
    actions: [] 
  };
  
  // Check if configJson exists and is not null/undefined before trying to parse
  if (automation.configJson) {
    try {
      let parsedConfig: any;
      if (typeof automation.configJson === 'object') {
        // If it's already an object, use it directly
        parsedConfig = automation.configJson;
      } else if (typeof automation.configJson === 'string') {
        // If it's a string, try to parse it
        parsedConfig = JSON.parse(automation.configJson);
      }

      // IMPORTANT: Check if parsedConfig is a valid object and has the required arrays
      if (parsedConfig && 
          typeof parsedConfig === 'object' && 
          Array.isArray(parsedConfig.sourceEntityTypes) && 
          Array.isArray(parsedConfig.actions)) 
      {
         configJsonData = {
            sourceEntityTypes: parsedConfig.sourceEntityTypes,
            eventTypeFilter: parsedConfig.eventTypeFilter || '', // Provide default if missing
            actions: parsedConfig.actions as AutomationAction[], // Assuming actions are correctly structured
         };
      } else {
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
      sourceNodeId: automation.sourceNodeId,
      targetNodeId: automation.targetNodeId,
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
          sourceDeviceTypeOptions={sourceDeviceTypeOptions} // Use locally fetched data
        />
      </div>
    </div>
  );
} 