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
import { AutomationActionType } from '@/lib/automation-types';
import type { connectors } from '@/data/db/schema';
import type { AutomationFormValues } from '../AutomationForm'; // Adjust path as needed

type ConnectorSelect = typeof connectors.$inferSelect;
type TargetDeviceOption = {
    id: string;
    name: string;
    displayType: string;
    iconName: string;
    areaId?: string | null;
    locationId?: string | null;
};

// Default action to append
const defaultAction: AutomationAction = {
    type: AutomationActionType.CREATE_EVENT, 
    params: { sourceTemplate: '', captionTemplate: '', descriptionTemplate: '', targetConnectorId: '' }
};

interface ActionsSectionProps {
    form: UseFormReturn<AutomationFormValues>;
    isLoading: boolean;
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
}

export function ActionsSection({
    form,
    isLoading,
    handleInsertToken,
    sortedPikoConnectors,
    sortedAvailableTargetDevices,
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
        const newIndex = actionsFields.length;
        appendAction(defaultAction);
        // Automatically open the newly added action item
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
                        fieldItem={fieldItem}
                        isOpen={openActionItems.includes(`action-${index}`)} // Pass open state down
                        removeAction={removeAction}
                        handleInsertToken={handleInsertToken}
                        isLoading={isLoading}
                        sortedPikoConnectors={sortedPikoConnectors}
                        sortedAvailableTargetDevices={sortedAvailableTargetDevices}
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