'use client';

import React from 'react';
import { UseFormReturn, useFieldArray } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { TemporalConditionItem } from './TemporalConditionItem'; // Adjust path as needed
import { type TemporalCondition, JsonRuleGroupSchema } from '@/lib/automation-schemas';
import type { Location, Space, AlarmZone } from '@/types';
import type { AutomationFormValues } from '../AutomationForm'; // Adjust path as needed

const defaultEventFilterRuleGroup = JsonRuleGroupSchema.parse({ all: [] });
const defaultTemporalCondition: Omit<TemporalCondition, 'id'> = {
    type: 'eventOccurred',
    scoping: 'anywhere',
    eventFilter: defaultEventFilterRuleGroup,
    timeWindowSecondsBefore: 60,
    timeWindowSecondsAfter: 60,
};

// Helper function to add internal IDs for stable keys in RuleBuilder
// Cloned from AutomationForm - consider moving to a util if used elsewhere
const addInternalIds = (node: any): any => {
    if (!node) return node;
    if (node._internalId === undefined) { 
        node._internalId = crypto.randomUUID();
    }
    if (node.all || node.any) {
        const groupType = node.all ? 'all' : 'any';
        const children = node[groupType] || []; 
        node[groupType] = children.map(addInternalIds);
    }
    return node;
};

// Helper to get a deep clone of an event filter or a cloned default
const getClonedEventFilter = (eventFilter?: any) => {
    if (eventFilter && (eventFilter.all || eventFilter.any) && (eventFilter.all?.length || eventFilter.any?.length)) {
        return JSON.parse(JSON.stringify(eventFilter));
    }
    return JSON.parse(JSON.stringify(defaultEventFilterRuleGroup));
};

interface TemporalConditionsSectionProps {
    form: UseFormReturn<AutomationFormValues>;
    isLoading: boolean;
    initialExpanded: boolean; // Pass initial expanded state from parent
    watchedLocationScopeId: string | null | undefined;
    allLocations: Location[];
    allSpaces: Space[];
    allAlarmZones: AlarmZone[];
    devicesForConditions: Array<{ id: string; name: string; spaceId?: string | null; locationId?: string | null; }>;
    allConnectors: Array<{ id: string; name: string; category: string; }>;
}

export function TemporalConditionsSection({
    form,
    isLoading,
    initialExpanded,
    watchedLocationScopeId,
    allLocations,
    allSpaces,
    allAlarmZones,
    devicesForConditions,
    allConnectors,
}: TemporalConditionsSectionProps) {
    const { fields: temporalConditionsFields, append: appendTemporalCondition, remove: removeTemporalCondition } = useFieldArray({
        control: form.control,
        name: "config.temporalConditions"
    });

    // State for accordion lives within this component now
    const [isExpanded, setIsExpanded] = React.useState<boolean>(initialExpanded);

    const handleAddTemporalCondition = () => {
        const newConditionBase = JSON.parse(JSON.stringify(defaultTemporalCondition));
        // Ensure the event filter gets its own internal IDs upon creation
        const conditionWithIds = {
             id: crypto.randomUUID(),
             ...newConditionBase,
             eventFilter: addInternalIds(getClonedEventFilter(newConditionBase.eventFilter))
        };
        appendTemporalCondition(conditionWithIds);
        // Optionally expand if adding the first condition
        if (!isExpanded) {
            setIsExpanded(true);
        }
    };

    return (
        <div>
            <h3 className="text-sm font-semibold mb-3">Temporal Conditions (and if...)</h3>
            
            <Accordion 
                type="single"
                collapsible
                value={isExpanded ? "temporal-conditions" : undefined}
                onValueChange={(value) => setIsExpanded(!!value)}
            >
                <AccordionItem value="temporal-conditions" className="border-0">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                            {temporalConditionsFields.length > 0 
                                ? `${temporalConditionsFields.length} temporal condition${temporalConditionsFields.length > 1 ? 's' : ''} configured` 
                                : "Optionally add conditions based on other events happening near the trigger time."}
                        </p>
                        <AccordionTrigger className="py-0" />
                    </div>
                    <AccordionContent>
                        <div className="pt-4">
                            <div className="space-y-4">
                                {/* --- Map Temporal Conditions --- */}
                                {temporalConditionsFields.map((fieldItem, index) => (
                                    <TemporalConditionItem
                                        key={fieldItem.id}
                                        form={form}
                                        index={index}
                                        fieldItem={fieldItem}
                                        removeTemporalCondition={removeTemporalCondition}
                                        isLoading={isLoading}
                                        watchedLocationScopeId={watchedLocationScopeId}
                                        allLocations={allLocations}
                                        allSpaces={allSpaces}
                                        allAlarmZones={allAlarmZones}
                                        devicesForConditions={devicesForConditions}
                                        allConnectors={allConnectors}
                                    />
                                ))}
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={handleAddTemporalCondition} 
                                    disabled={isLoading}
                                >
                                    <Plus className="h-4 w-4 mr-1" /> Add Temporal Condition
                                </Button>
                            </div>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
} 