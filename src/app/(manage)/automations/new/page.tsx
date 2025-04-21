import { Separator } from "@/components/ui/separator";
import React from "react";
import AutomationForm from "@/components/automations/AutomationForm";
import { db } from "@/data/db"; // Import database instance
import { nodes } from "@/data/db/schema"; // Import nodes schema
import type { AutomationFormData } from "@/app/settings/automations/[id]/page"; // Reuse type
import { YOLINK_DEVICE_NAME_MAP } from "@/services/drivers/yolink"; // Import device map
import type { MultiSelectOption } from "@/components/ui/multi-select-combobox";

// Fetch data server-side
async function getFormData() {
  const allNodes = await db.select({ 
      id: nodes.id,
      name: nodes.name,
      category: nodes.category,
    }).from(nodes);
    
  // Prepare options for the Source Device Types multi-select combobox
  const sourceDeviceTypeOptions: MultiSelectOption[] = Object.entries(YOLINK_DEVICE_NAME_MAP)
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label)); // Sort alphabetically by label
    
  // Prepare initial data structure for a new automation
  const initialData: AutomationFormData = {
      id: 'new', // Special marker for new item
      name: '',
      enabled: true,
      sourceNodeId: null,
      targetNodeId: null,
      configJson: { // Default empty config
          sourceEntityTypes: [],
          eventTypeFilter: '',
          actions: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
  };

  return {
    availableNodes: allNodes,
    initialData,
    sourceDeviceTypeOptions,
  };
}

// Make the page component async to fetch data
export default async function NewAutomationPage() {
  // Fetch the necessary data
  const { availableNodes, initialData, sourceDeviceTypeOptions } = await getFormData();

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8 overflow-y-auto">
      {/* Heading */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Create New Automation</h2>
        <p className="text-muted-foreground">
          Define a new rule to automate actions based on events.
        </p>
      </div>
      <Separator />
      {/* Render the Automation Form Component */}
      <div className="pt-4">
        <AutomationForm 
          initialData={initialData}
          availableNodes={availableNodes}
          sourceDeviceTypeOptions={sourceDeviceTypeOptions}
        />
      </div>
    </div>
  );
} 