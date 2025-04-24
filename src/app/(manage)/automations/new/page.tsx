import { Separator } from "@/components/ui/separator";
import React from "react";
import AutomationForm from "@/components/automations/AutomationForm";
import { db } from "@/data/db"; // Import database instance
import { connectors } from "@/data/db/schema";
import { deviceIdentifierMap } from "@/lib/mappings/identification";
import type { MultiSelectOption } from "@/components/ui/multi-select-combobox";
import type { Metadata } from 'next';
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { useRouter } from 'next/navigation';
import { type AutomationConfig, AutomationConfigSchema, type AutomationAction } from '@/lib/automation-schemas';
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DeviceType } from "@/lib/mappings/definitions"; // <-- Import DeviceType

// Define AutomationFormData locally to match the structure expected by the form
interface AutomationFormData {
    id: string;
    name: string; // Ensure name is string, not string | null
    enabled: boolean;
    sourceConnectorId: string | null; // Corrected field name
    configJson: AutomationConfig;
    createdAt: Date;
    updatedAt: Date;
}

// Set page title metadata
export const metadata: Metadata = {
  title: 'Add Automation // Fusion Bridge',
};

// Fetch data server-side
async function getFormData() {
  // Fetch connectors
  const allConnectors = await db.select({ 
      id: connectors.id,
      name: connectors.name,
      category: connectors.category,
    }).from(connectors);
    
  // Prepare options for the Source Device Types
  const sourceDeviceTypeOptions: MultiSelectOption[] = Object.values(DeviceType)
    .filter(type => type !== DeviceType.Unmapped)
    .sort((a, b) => a.localeCompare(b))
    .map(typeValue => ({ 
        value: typeValue, 
        label: typeValue 
    }));
    
  // Prepare initial data structure for a new automation
  const initialData: AutomationFormData = {
      id: 'new', 
      name: '', // Ensure name is an empty string, not null
      enabled: true,
      sourceConnectorId: null, // Use the corrected field name
      configJson: { 
          sourceEntityTypes: [],
          eventTypeFilter: '',
          actions: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
  };

  return {
    availableConnectors: allConnectors, // Rename to availableConnectors
    initialData,
    sourceDeviceTypeOptions,
  };
}

// Make the page component async to fetch data
export default async function NewAutomationPage() {
  // Fetch the necessary data, using the renamed variable
  const { availableConnectors, initialData, sourceDeviceTypeOptions } = await getFormData();

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
      {/* Render the Automation Form Component, passing renamed prop */}
      <div className="pt-4">
        <AutomationForm 
          initialData={initialData}
          availableConnectors={availableConnectors} // Pass availableConnectors
          sourceDeviceTypeOptions={sourceDeviceTypeOptions}
        />
      </div>
    </div>
  );
} 