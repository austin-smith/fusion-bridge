import { Separator } from "@/components/ui/separator";
import React from "react";
import AutomationForm from "@/components/automations/AutomationForm"; // Default import
import { db } from "@/data/db"; 
import { nodes } from "@/data/db/schema"; 
import { automations } from "@/data/db/schema"; // Import automations schema
import { eq } from "drizzle-orm";
import { YOLINK_DEVICE_NAME_MAP } from "@/services/drivers/yolink"; 
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
  const sourceDeviceTypeOptions: MultiSelectOption[] = Object.entries(YOLINK_DEVICE_NAME_MAP)
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label)); 
    
  // Prepare initial data structure from the fetched automation
  let configJsonData: AutomationConfig = { 
    sourceEntityTypes: [], 
    eventTypeFilter: '', 
    actions: [] 
  };
  try {
    let parsedConfig: any;
    if (automation.configJson && typeof automation.configJson === 'object') {
      parsedConfig = automation.configJson;
    } else if (typeof automation.configJson === 'string') {
      parsedConfig = JSON.parse(automation.configJson);
    }

    if (parsedConfig && Array.isArray(parsedConfig.sourceEntityTypes) && Array.isArray(parsedConfig.actions)) {
       configJsonData = {
          sourceEntityTypes: parsedConfig.sourceEntityTypes,
          eventTypeFilter: parsedConfig.eventTypeFilter || '',
          actions: parsedConfig.actions as AutomationAction[],
       };
    }

  } catch (e) {
     console.error("Failed to parse automation config JSON:", e);
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