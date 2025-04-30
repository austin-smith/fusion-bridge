import { Separator } from "@/components/ui/separator";
import React from "react";
import AutomationForm from "@/components/automations/AutomationForm";
import { db } from "@/data/db"; // Import database instance
import { connectors } from "@/data/db/schema";
import { deviceIdentifierMap } from "@/lib/mappings/identification";
import type { MultiSelectOption } from "@/components/ui/multi-select-combobox";
import type { Metadata } from 'next';
import { type AutomationConfig } from '@/lib/automation-schemas';
import { DeviceType, DeviceSubtype } from "@/lib/mappings/definitions"; // Import both enums
import { getDeviceTypeIconName } from '@/lib/mappings/presentation'; // Use getDeviceTypeIconName instead of getDeviceTypeIcon directly

// Define AutomationFormData locally to match the structure expected by the form
interface AutomationFormData {
    id: string;
    name: string; // Expect non-null for form
    enabled: boolean; // Expect non-null for form
    configJson: AutomationConfig; // Expect non-null for form
    createdAt: Date; // Expect non-null for form
    updatedAt: Date; // Expect non-null for form
}

// Update MultiSelectOption to expect iconName (align with combobox definition change later)
// Note: Could import MultiSelectOption from combobox and extend/omit, but simple interface is fine here.
interface PageMultiSelectOption {
  value: string;
  label: string;
  iconName?: string;
}

// Set page title metadata
export const metadata: Metadata = {
  title: 'Add Automation // Fusion Bridge',
};

// Fetch data server-side
async function getFormData() {
  // Fetch connectors needed for Action configuration
  const allConnectors = await db.select({ 
      id: connectors.id,
      name: connectors.name,
      category: connectors.category,
    }).from(connectors);
    
  // Prepare options for the Standardized Device Types dropdowns
  const sourceDeviceTypeOptions: PageMultiSelectOption[] = [];
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
                  sourceDeviceTypeOptions.push({ value, label, iconName });
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
          sourceDeviceTypeOptions.push({ value, label, iconName });
          addedValues.add(value);
      }
  });

  sourceDeviceTypeOptions.sort((a, b) => a.label.localeCompare(b.label));
    
  // Prepare initial (empty) data structure for a new automation
  const initialData: AutomationFormData = {
      id: 'new', 
      name: '', 
      enabled: true,
      configJson: { 
          conditions: { all: [] }, // Default to empty all conditions
          temporalConditions: [], // Optional array of temporal conditions
          actions: [],
      },
      createdAt: new Date(), // Use current date for new form
      updatedAt: new Date(), // Use current date for new form
  };

  return {
    availableConnectors: allConnectors,
    initialData,
    sourceDeviceTypeOptions, // Return the formatted options
  };
}

// Page component
export default async function NewAutomationPage() {
  const { availableConnectors, initialData, sourceDeviceTypeOptions } = await getFormData();

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8 overflow-y-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Create New Automation</h2>
        <p className="text-muted-foreground">
          Define a new rule based on standardized event and device types.
        </p>
      </div>
      <Separator />
      <div className="pt-4">
        <AutomationForm 
          initialData={initialData} // Pass the prepared initial data
          availableConnectors={availableConnectors}
          sourceDeviceTypeOptions={sourceDeviceTypeOptions}
        />
      </div>
    </div>
  );
} 