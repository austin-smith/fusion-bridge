import React from 'react';
import { db } from '@/data/db';
import { automations, nodes } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { notFound } from 'next/navigation';
import AutomationForm from '@/components/automations/AutomationForm';
import type { AutomationConfig } from '@/lib/automation-schemas';
import type { Node } from '@/lib/types'; // Import Node type from central types file
import { deviceIdentifierMap } from '@/lib/mappings/identification'; // Corrected path
import type { MultiSelectOption } from '@/components/ui/multi-select-combobox'; // Import type
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DeviceType } from '@/lib/mappings/definitions'; // <-- Import DeviceType

// Define the shape of the data expected by the form
// Includes joined node names and allows configJson to be potentially null for 'new'
export type AutomationFormData = {
  id: string;
  name: string | null;
  enabled: boolean | null;
  sourceNodeId: string | null;
  configJson: AutomationConfig | null; // Allow null for 'new' case
  createdAt: Date | null; // Drizzle returns Date objects for timestamp_ms
  updatedAt: Date | null;
  sourceNodeName?: string | null;
};

// Fetch all available nodes for dropdowns
async function getAvailableNodes(): Promise<Pick<Node, 'id' | 'name' | 'category'>[]> {
    // Select only necessary fields 
    return db.select({ 
        id: nodes.id, 
        name: nodes.name, 
        category: nodes.category 
    }).from(nodes);
}

// Get AVAILABLE Standardized Device Types for multi-select
function getStandardizedDeviceTypeOptions(): MultiSelectOption[] {
    // Use DeviceType enum values
    return Object.values(DeviceType)
        // Optionally filter out types you don't want selectable (like Unmapped?)
        .filter(type => type !== DeviceType.Unmapped) 
        .sort((a, b) => a.localeCompare(b)) // Sort alphabetically
        .map(typeValue => ({
            value: typeValue, // e.g., "Sensor"
            label: typeValue, // e.g., "Sensor"
        }));
}

// Fetch automation data for a specific ID
async function getAutomationData(id: string): Promise<AutomationFormData | null> {
    if (id === 'new') {
        // Return default structure for creating a new automation
        return {
            id: 'new',
            name: null,
            enabled: true,
            sourceNodeId: null,
            configJson: null,
            createdAt: null,
            updatedAt: null,
        };
    }

    try {
        const sourceNodeAlias = alias(nodes, "sourceNode");

        const result = await db
            .select({
                id: automations.id,
                name: automations.name,
                enabled: automations.enabled,
                sourceNodeId: automations.sourceNodeId,
                configJson: automations.configJson,
                createdAt: automations.createdAt,
                updatedAt: automations.updatedAt,
                sourceNodeName: sourceNodeAlias.name,
            })
            .from(automations)
            .where(eq(automations.id, id))
            .leftJoin(sourceNodeAlias, eq(automations.sourceNodeId, sourceNodeAlias.id))
            .limit(1);

        if (result.length === 0) {
            return null; // Indicate not found
        }
        
        // Drizzle might return Date objects for timestamp_ms
        // Ensure the structure matches AutomationFormData
        const data = result[0];
        return {
            ...data,
            // Explicitly cast/convert if necessary, though types should align
            createdAt: data.createdAt as Date | null,
            updatedAt: data.updatedAt as Date | null,
        };

    } catch (error) {
        console.error(`Failed to fetch automation ${id}:`, error);
        // Re-throw or handle differently if needed
        throw new Error("Failed to fetch automation data."); 
    }
}

export default async function AutomationSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: automationId } = await params; // Await params and destructure id
  const standardizedDeviceTypes = getStandardizedDeviceTypeOptions(); // Use the new function to get standardized types

  // Fetch initial data and available nodes in parallel
  const [initialData, availableNodes] = await Promise.all([
    getAutomationData(automationId),
    getAvailableNodes(),
  ]);

  // Handle not found case for existing IDs
  if (!initialData && automationId !== 'new') {
    notFound();
  }

  // Handle potential error during fetch (e.g., if getAutomationData throws)
  if (!initialData && automationId === 'new') {
    // This case might occur if getAutomationData had an error even for 'new'
    // Or handle more gracefully depending on expected errors
    return <div>Error loading automation configuration.</div>;
  }

  const title = automationId === 'new' ? 'Create New Automation' : `Edit Automation: ${initialData?.name}`;

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">{title}</h1>
      {/* Pass initialData which matches AutomationFormData */}
      <AutomationForm 
        initialData={initialData!} // Use non-null assertion as we handled null cases
        availableNodes={availableNodes} 
        sourceDeviceTypeOptions={standardizedDeviceTypes} // Pass the standardized types to the form
       />
    </div>
  );
} 