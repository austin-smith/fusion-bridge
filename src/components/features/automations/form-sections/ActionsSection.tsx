'use client';

import React from 'react';
import { UseFormReturn, useFieldArray } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { 
  Accordion,
} from "@/components/ui/accordion";
import { ActionItem, InsertableFieldNames } from './ActionItem'; // Adjust path as needed
import type { AutomationAction } from '@/lib/automation-schemas';
import { AutomationActionType, AutomationTriggerType } from '@/lib/automation-types';
import type { connectors } from '@/data/db/schema';
import type { AutomationFormValues } from '../AutomationForm'; // Adjust path as needed
import { ArmedState } from '@/lib/mappings/definitions'; // For default ArmAlarmZone params

// Define ZoneOption directly here for props
type ZoneOptionForActionsSection = {
    id: string;
    name: string;
    locationId: string;
    // Add any other fields from alarm zones if ActionItem needs them directly from sortedAvailableZones
    // For now, id and name are sufficient for MultiSelectComboBox options passed from ActionItem
};

type ConnectorSelect = typeof connectors.$inferSelect;
type TargetDeviceOption = {
    id: string;
    name: string;
    displayType: string;
    iconName: string;
    spaceId?: string | null;
    locationId?: string | null;
};

interface ActionsSectionProps {
    form: UseFormReturn<AutomationFormValues>;
    isLoading: boolean;
    triggerType: AutomationTriggerType; // Added triggerType prop
    handleInsertToken: (
        fieldName: InsertableFieldNames,
        actionIndex: number,
        token: string,
        context: 'action',
        headerIndex?: number
    ) => void;
    // Pass sorted lists directly
    sortedPikoConnectors: Pick<ConnectorSelect, 'id' | 'name' | 'category'>[];
    sortedAvailableTargetDevices: TargetDeviceOption[];
    // Add new props
    sortedAvailableZones: ZoneOptionForActionsSection[]; 
    currentRuleLocationScope?: { id: string; name: string } | null;
    allLocations: any[]; // Location data for hierarchy display
    allSpaces: any[]; // Space data for hierarchy display
}

export function ActionsSection({
    form,
    isLoading,
    triggerType, // Destructure triggerType
    handleInsertToken,
    sortedPikoConnectors,
    sortedAvailableTargetDevices,
    // Destructure new props
    sortedAvailableZones,
    currentRuleLocationScope,
    allLocations,
    allSpaces,
}: ActionsSectionProps) {
    const { fields: actionsFields, append: appendAction, remove: removeAction } = useFieldArray({
        control: form.control,
        name: "config.actions"
    });

    // State for accordion open items lives here
    const [openActionItems, setOpenActionItems] = React.useState<string[]>([]);

    // Initialize open items (e.g., if loading existing data)
    // This ensures items might be open on first render if needed
    // React.useEffect(() => {
    //     // Example: Keep first item open by default if needed
    //     // if (actionsFields.length > 0 && openActionItems.length === 0) {
    //     //     setOpenActionItems([`action-0`]);
    //     // }
    // }, [actionsFields.length]); // Only run when number of actions changes

    const handleActionAccordionChange = (value: string[]) => {
        setOpenActionItems(value);
    };

    const handleAddAction = () => {
        let defaultActionToAdd: AutomationAction;

        if (triggerType === AutomationTriggerType.SCHEDULED) {
            // Default to ARM_ALARM_ZONE for scheduled triggers
            defaultActionToAdd = {
                type: AutomationActionType.ARM_ALARM_ZONE,
                params: { 
                    scoping: 'ALL_ZONES_IN_SCOPE', // Sensible default
                    targetZoneIds: [] // Explicitly empty for ALL_ZONES_IN_SCOPE or to be filled for SPECIFIC
                }
            } as any; // Cast as any because AutomationAction is a union, and TS needs help here
        } else {
            // Default to CREATE_EVENT for event-based triggers (or any other preferred default)
            defaultActionToAdd = {
                type: AutomationActionType.CREATE_EVENT, 
                params: { sourceTemplate: '', captionTemplate: '', descriptionTemplate: '', targetConnectorId: '' }
            } as any; // Cast as any
        }

        const newIndex = actionsFields.length;
        appendAction(defaultActionToAdd);
        setOpenActionItems(prev => [...prev, `action-${newIndex}`]);
    };

    return (
        <> {/* Use fragment to avoid unnecessary div */} 
            <Accordion 
                type="multiple" 
                value={openActionItems}
                className="space-y-4"
                onValueChange={handleActionAccordionChange}
            >
                {actionsFields.map((fieldItem, index) => (
                    <ActionItem
                        key={fieldItem.id}
                        form={form}
                        index={index}
                        fieldItem={fieldItem as any} // fieldItem from useFieldArray is fine, but if ActionItem expects specific typed params, cast may be needed
                        isOpen={openActionItems.includes(`action-${index}`)} // Pass open state down
                        removeAction={removeAction}
                        handleInsertToken={handleInsertToken}
                        isLoading={isLoading}
                        triggerType={triggerType} // Pass triggerType down to ActionItem
                        sortedPikoConnectors={sortedPikoConnectors}
                        sortedAvailableTargetDevices={sortedAvailableTargetDevices}
                        // Pass down the new props
                        sortedAvailableZones={sortedAvailableZones}
                        currentRuleLocationScope={currentRuleLocationScope}
                        allLocations={allLocations}
                        allSpaces={allSpaces}
                    />
                ))}
            </Accordion>
            
            <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={handleAddAction}
                disabled={isLoading}
                className="mt-4"
            >
                <Plus className="h-4 w-4 mr-1" /> Add Action
            </Button>
        </> 
    );
} 