'use client';

import React from 'react';
import { ControllerRenderProps } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Trash2, Plus, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { JsonRuleGroup, JsonRuleCondition, JsonRulesEngineOperatorsSchema } from '@/lib/automation-schemas';
import { AVAILABLE_AUTOMATION_FACTS, getFactById, type AutomationFact, OPERATOR_DISPLAY_MAP } from '@/lib/automation-facts';
import { z } from 'zod';
import type { Location, Area } from '@/types';
import { Skeleton } from "@/components/ui/skeleton";

// --- Types --- 
type DeviceForFiltering = { id: string; name: string; areaId?: string | null; locationId?: string | null; };

// Add _internalId for React key stability
type RuleNodeWithId = (JsonRuleGroup | JsonRuleCondition) & { _internalId?: string };

// Define the option type explicitly for use in the helper function
export interface FactSelectOption { value: string | number; label: string; }

// Define preferred operator display order
const PREFERRED_OPERATOR_ORDER: ReadonlyArray<z.infer<typeof JsonRulesEngineOperatorsSchema>> = [
    'equal',
    'notEqual',
    'greaterThan',
    'greaterThanInclusive',
    'lessThan',
    'lessThanInclusive',
    'contains',
    'doesNotContain',
    'in',
    'notIn',
];

interface RuleBuilderProps {
  value: RuleNodeWithId; // Use extended type
  onChange: (newValue: RuleNodeWithId) => void; // Use extended type
  depth?: number; // Current depth for recursion limiting
  onRemove?: () => void; // Callback to remove this node (if it's not the root)
  locationScopeId?: string | null;
  allLocations: Location[];
  allAreas: Area[];
  allDevices: DeviceForFiltering[]; 
}

const MAX_DEPTH = 3; // Limit nesting depth

// --- Helper to group facts for the Select component ---
const groupedFacts = AVAILABLE_AUTOMATION_FACTS.reduce((acc, fact) => {
  const group = fact.group;
  if (!acc[group]) {
    acc[group] = [];
  }
  // Now pushing a readonly fact into a mutable Array<AutomationFact>
  acc[group].push(fact);
  return acc;
  // --- SIMPLIFIED Accumulator Type ---
}, {} as Record<string, Array<AutomationFact>>); 

// --- REFACTORED HELPER FUNCTION for Dynamic Select Options --- 
function getFilteredFactOptions(
    fact: AutomationFact,
    scopeId: string | null | undefined,
    data: { allLocations: Location[], allAreas: Area[], allDevices: DeviceForFiltering[] }
): { options: FactSelectOption[], description: string } {
    let generatedOptions: FactSelectOption[] = [];
    let description = "options";
    const { allLocations, allAreas, allDevices } = data;

    if (fact.selectableEntityType) {
        let sourceArray: Array<{id: string, name: string, locationId?: string | null, areaId?: string | null}> = [];
        const entityTypeLabel = fact.selectableEntityType.toLowerCase();
        let isScopable = false;
        let effectivelyScoped = false;
        
        switch (fact.selectableEntityType) {
            case 'Device':
                // Devices are linked to Locations *indirectly* via Areas.
                // If a location scope is applied, first find relevant Area IDs,
                // then filter devices by those Area IDs.
                if (scopeId) { // If a location scope is selected
                    const relevantAreaIds = allAreas
                        .filter(area => area.locationId === scopeId)
                        .map(area => area.id);
                    sourceArray = allDevices.filter(device => 
                        device.areaId && relevantAreaIds.includes(device.areaId)
                    );
                    isScopable = true;
                    effectivelyScoped = true;
                } else {
                    sourceArray = allDevices;
                    isScopable = true;
                    effectivelyScoped = false;
                }
                break;
            case 'Area':
                sourceArray = allAreas;
                isScopable = true;
                if (scopeId) {
                    sourceArray = sourceArray.filter(item => item.locationId === scopeId);
                    effectivelyScoped = true;
                } else {
                    effectivelyScoped = false;
                }
                break;
            case 'Location':
                sourceArray = allLocations;
                isScopable = false; 
                effectivelyScoped = false;
                break;
        }
        
        generatedOptions = sourceArray
            .filter(item => item.id !== '') 
            .map(item => ({ value: item.id, label: item.name }));
        
        const scopeMessage = (isScopable && effectivelyScoped) ? ' in selected location' : '';
        if (generatedOptions.length === 0) {
            description = `No ${entityTypeLabel}${effectivelyScoped && entityTypeLabel.endsWith('s') ? 'es' : (effectivelyScoped ? 's' : (entityTypeLabel.endsWith('s') ? '' : 's'))}${scopeMessage} found`;
        } else {
            description = `${generatedOptions.length} ${entityTypeLabel}${generatedOptions.length !== 1 ? 's' : ''}${scopeMessage}`;
        }

    } else {
        const staticOptions = fact.valueOptions?.map(vo => ({ value: vo.value, label: vo.label })) ?? [];
        generatedOptions = staticOptions.filter(option => String(option.value) !== '');
        
        description = "predefined options";
        if (generatedOptions.length === 0) {
            description = staticOptions.length > 0 ? "All predefined options had empty values" : "No predefined options available";
        }
    }

    if (!Array.isArray(generatedOptions)) {
        generatedOptions = []; 
        description = "Error loading options";
    }

    generatedOptions.sort((a, b) => a.label.localeCompare(b.label));
    return { options: generatedOptions, description }; 
}

// --- NEW EntityCombobox Component ---
interface EntityComboboxProps {
    options: FactSelectOption[];
    currentValue: string;
    onValueChange: (newValue: string) => void;
    entityTypeLabel: string;
    isValueInvalid: boolean;
    staleLabel?: string;
    displayDescription: string; // Description for empty/invalid states
}

const EntityCombobox: React.FC<EntityComboboxProps> = ({
    options,
    currentValue,
    onValueChange,
    entityTypeLabel,
    isValueInvalid,
    staleLabel,
    displayDescription,
}) => {
    const [openCombobox, setOpenCombobox] = React.useState(false);
    const selectedLabel = options.find(opt => String(opt.value) === currentValue)?.label;

    return (
        <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCombobox}
                    className={cn(
                        "w-full h-9 justify-between font-normal", // Use font-normal to match SelectTrigger
                        !selectedLabel && !staleLabel && "text-muted-foreground", // Mimic placeholder text color
                        isValueInvalid && "border-destructive text-destructive"
                    )}
                >
                    <span className="truncate">
                        {isValueInvalid && staleLabel
                            ? staleLabel
                            : selectedLabel
                            ? selectedLabel
                            : `Select ${entityTypeLabel}...`}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" style={{width: 'var(--radix-popover-trigger-width)'}}>
                <Command>
                    <CommandInput placeholder={`Search ${entityTypeLabel}...`} />
                    <CommandList>
                        <CommandEmpty>
                             <div className={cn("px-2 py-1.5 text-sm text-center", isValueInvalid ? "text-destructive" : "text-muted-foreground")}>
                                 {options.length === 0 ? displayDescription : `No ${entityTypeLabel.toLowerCase()} found.`}
                             </div>
                         </CommandEmpty>
                        <CommandGroup>
                            {options.map(option => (
                                <CommandItem
                                    key={option.value}
                                    value={option.label} // Search by label
                                    onSelect={() => {
                                        onValueChange(String(option.value)); // Update form state
                                        setOpenCombobox(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            currentValue === String(option.value) ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {option.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
};

// --- RuleBuilder Component --- 
export function RuleBuilder({ 
    value,       
    onChange,    
    depth = 0, 
    onRemove, 
    locationScopeId,
    allLocations,
    allAreas,
    allDevices,
}: RuleBuilderProps) {

    // Define isGroup helper function at the top
    const isGroup = (node: RuleNodeWithId): node is JsonRuleGroup & { _internalId?: string } => {
        return node && (('all' in node) || ('any' in node));
    };

    // --- TOP-LEVEL HOOKS ---
    // REMOVED: const [isDisplayReady, setIsDisplayReady] = React.useState(false);

    const currentIsGroup = isGroup(value);
    const factDefinitionFromProps = !currentIsGroup ? getFactById((value as JsonRuleCondition).fact) : null;

    // REMOVED: React.useEffect(() => { ... }, [currentIsGroup, factDefinitionFromProps]);

    const addCondition = (groupType: 'all' | 'any', currentConditions: RuleNodeWithId[]) => {
        const defaultFact = AVAILABLE_AUTOMATION_FACTS.find(f => f.id === 'event.category') || AVAILABLE_AUTOMATION_FACTS[0];
        if (!defaultFact) {
             console.error("No available automation facts defined!");
             return;
        }
        let initialValue: string | number = '';
        if (defaultFact.valueInputType === 'select') {
            const { options: defaultFactOptions } = getFilteredFactOptions(defaultFact, locationScopeId, { allLocations, allAreas, allDevices });
            if (defaultFactOptions.length > 0) {
                initialValue = defaultFactOptions[0].value;
            }
        }
        const newCondition: RuleNodeWithId = {
            _internalId: crypto.randomUUID(), 
            fact: defaultFact.id,
            operator: defaultFact.operators[0],
            value: initialValue,
        };
        const newConditions = [...currentConditions, newCondition];
        onChange({ _internalId: (value as RuleNodeWithId)._internalId, [groupType]: newConditions } as RuleNodeWithId);
    };

    const addGroup = (groupType: 'all' | 'any', currentConditions: RuleNodeWithId[]) => {
        const newGroup: RuleNodeWithId = {
            _internalId: crypto.randomUUID(),
            any: [] 
        }; 
        const newConditions = [...currentConditions, newGroup];
        onChange({ _internalId: (value as RuleNodeWithId)._internalId, [groupType]: newConditions } as RuleNodeWithId);
    };

    const changeGroupType = (newType: 'all' | 'any') => {
        if (!currentIsGroup) return;
        const oldType = newType === 'all' ? 'any' : 'all';
        const conditions = value[oldType] || [];
        onChange({ _internalId: value._internalId, [newType]: conditions });
    };

    const handleItemChange = (index: number, groupType: 'all' | 'any', currentConditions: RuleNodeWithId[]) => (updatedItem: RuleNodeWithId) => {
        const newConditions = [
            ...currentConditions.slice(0, index),
            updatedItem,
            ...currentConditions.slice(index + 1),
        ];
        // Ensure the parent group's ID is preserved when updating children
        // Value here is the current group node, so its _internalId should be present.
        onChange({ _internalId: (value as RuleNodeWithId)._internalId, [groupType]: newConditions } as RuleNodeWithId);
    };

    const handleItemRemove = (index: number, groupType: 'all' | 'any', currentConditions: RuleNodeWithId[]) => () => {
        const newConditions = [
            ...currentConditions.slice(0, index),
            ...currentConditions.slice(index + 1),
        ];
        // Ensure the parent group's ID is preserved when removing children
        onChange({ _internalId: (value as RuleNodeWithId)._internalId, [groupType]: newConditions } as RuleNodeWithId);
    };

    // --- Helper function to sort operators ---
    const sortOperators = (operators: ReadonlyArray<z.infer<typeof JsonRulesEngineOperatorsSchema>>): z.infer<typeof JsonRulesEngineOperatorsSchema>[] => {
        return [...operators].sort((a, b) => {
            const indexA = PREFERRED_OPERATOR_ORDER.indexOf(a);
            const indexB = PREFERRED_OPERATOR_ORDER.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB; // Both preferred
            if (indexA !== -1) return -1; // Only A preferred
            if (indexB !== -1) return 1;  // Only B preferred
            return a.localeCompare(b); // Neither preferred
        });
    };

    if (depth >= MAX_DEPTH) {
        return <div className="text-red-500 text-xs p-2 border border-red-500 rounded">Max nesting depth reached.</div>;
    }

    if (currentIsGroup) {
        const groupNode = value as JsonRuleGroup;
        const groupType = 'all' in groupNode ? 'all' : 'any';
        const conditions = groupNode[groupType] || [];
        
        return (
            <div className={cn(
                "p-3 rounded-md space-y-3",
                depth > 0 && "border border-dashed", // Add border for nested groups
                groupType === 'all' ? 'bg-blue-50/30 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800' 
                                  : 'bg-green-50/30 dark:bg-green-950/20 border-green-200 dark:border-green-800'
            )}>
                {/* Render group header directly */}
                <div className="flex items-center justify-between space-x-2">
                    {/* REMOVED: {isDisplayReady ? ( ... ) : ( <Skeleton/> )} */}
                    <Select 
                        value={groupType} 
                        onValueChange={changeGroupType}
                    >
                        <SelectTrigger className="w-[80px] h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">ALL</SelectItem>
                            <SelectItem value="any">ANY</SelectItem>
                        </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">of the following must be true:</span>
                    <div className="flex-grow"></div> {/* Spacer */} 
                    {depth > 0 && onRemove && (
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onRemove}>
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remove Group</span>
                        </Button>
                    )}
                </div>

                {/* --- Recursive Rendering Implemented --- */} 
                <div className="pl-6 space-y-2">
                     {conditions.length === 0 && (
                         <p className="text-xs text-muted-foreground italic py-2">No conditions added to this group yet.</p>
                     )}
                     {conditions.map((item, index) => (
                         <RuleBuilder
                             key={(item as RuleNodeWithId)._internalId!} // Non-null assertion for key
                             value={item}
                             onChange={handleItemChange(index, groupType, conditions)}
                             depth={depth + 1}
                             onRemove={handleItemRemove(index, groupType, conditions)}
                             locationScopeId={locationScopeId}
                             allLocations={allLocations}
                             allAreas={allAreas}
                             allDevices={allDevices}
                         />
                     ))}
                </div>

                <div className="flex items-center space-x-2 pt-2">
                    <Button 
                        type="button"
                        variant="outline" 
                        size="sm" 
                        onClick={() => addCondition(groupType, conditions)} // Pass context
                        disabled={depth >= MAX_DEPTH -1} // Disable adding if next level hits max depth
                    >
                         <Plus className="h-3 w-3" /> Condition
                    </Button>
                    <Button 
                        type="button"
                        variant="outline" 
                        size="sm" 
                        onClick={() => addGroup(groupType, conditions)} // Pass context
                        disabled={depth >= MAX_DEPTH -1} // Disable adding if next level hits max depth
                    >
                         <Plus className="h-3 w-3" /> Group
                    </Button>
                 </div>
            </div>
        );
    } else {
        // --- Render Condition Row ---
        const conditionNode = value as JsonRuleCondition;

        const handleFactChange = (newFactId: string) => {
            const newFactDefinition = getFactById(newFactId);
            if (!newFactDefinition) return;
            const newOperator = newFactDefinition.operators[0];
            let defaultValue: string | number = '';
            
            // Use the refactored helper to get initial options for the new fact
            if (newFactDefinition.valueInputType === 'select') {
                const { options: initialOptions } = getFilteredFactOptions(
                    newFactDefinition, 
                    locationScopeId, // current scopeId
                    { allLocations, allAreas, allDevices }
                );
                if (initialOptions.length > 0) {
                    defaultValue = initialOptions[0].value;
                }
            } // For non-select types, default to empty string or other logic if needed
            
            onChange({ 
                ...conditionNode, 
                fact: newFactId, 
                operator: newOperator,
                value: defaultValue 
            });
        };

        const handleValueChange = (newValue: any) => {
             onChange({ ...conditionNode, value: newValue });
        };

        // REMOVED: if (!isDisplayReady) { return <Skeleton ... />; }

        // Determine which value input component to render
        const renderValueInput = () => {
            if (!factDefinitionFromProps) {
                return <Input placeholder="Select field first..." className="w-full h-9" disabled />;
            }

            // State for Combobox popover - scoped here is fine now
            // const [openCombobox, setOpenCombobox] = React.useState(false);

            switch (factDefinitionFromProps.valueInputType) {
                case 'select': {
                    // --- State for Combobox popover - MOVED to EntityCombobox ---
                    // const [openCombobox, setOpenCombobox] = React.useState(false); // REMOVE

                    // --- Calculate all necessary variables upfront ---
                    const { options, description: initialDescription } = getFilteredFactOptions(factDefinitionFromProps, locationScopeId, { allLocations, allAreas, allDevices });
                    const currentValue = String(conditionNode.value ?? '');
                    const hasExistingValue = conditionNode.value !== null && conditionNode.value !== undefined && currentValue !== '';
                    const isValuePresentInOptions = options.some(opt => String(opt.value) === currentValue);
                    const isValueInvalid = hasExistingValue && !isValuePresentInOptions;
                    let displayDescription = initialDescription;
                    let staleLabel: string | undefined = undefined;
                    // const selectedLabel = options.find(opt => String(opt.value) === currentValue)?.label; // Moved to EntityCombobox

                    if (isValueInvalid) {
                        // Stale label calculation logic (remains the same)
                        if (factDefinitionFromProps.selectableEntityType === 'Device') {
                            const staleDevice = allDevices.find(d => d.id === conditionNode.value);
                            if (staleDevice) staleLabel = staleDevice.name;
                        } else if (factDefinitionFromProps.selectableEntityType === 'Area') {
                            const staleArea = allAreas.find(a => a.id === conditionNode.value);
                            if (staleArea) staleLabel = staleArea.name;
                        } else if (factDefinitionFromProps.selectableEntityType === 'Location') {
                            const staleLocation = allLocations.find(l => l.id === conditionNode.value);
                            if (staleLocation) staleLabel = staleLocation.name;
                        }
                        if (!staleLabel && currentValue) {
                            staleLabel = `Invalid selection (ID: ${currentValue.substring(0,6)}...)`;
                        }

                        // Description update logic (remains the same)
                        if (options.length === 0 && staleLabel) {
                            displayDescription = `Previously selected value (${staleLabel}) is not in scope. ${initialDescription.toLowerCase()}`;
                        } else if (options.length === 0) {
                            displayDescription = `Previously selected value is not in scope. ${initialDescription.toLowerCase()}`;
                        }
                    }
                    // --- END: Calculate all necessary variables upfront ---

                    // --- Use EntityCombobox for Device/Area/Location, standard Select otherwise ---
                    if (factDefinitionFromProps.selectableEntityType) {
                        return (
                            <EntityCombobox
                                options={options}
                                currentValue={currentValue}
                                onValueChange={handleValueChange}
                                entityTypeLabel={factDefinitionFromProps.selectableEntityType}
                                isValueInvalid={isValueInvalid}
                                staleLabel={staleLabel}
                                displayDescription={displayDescription}
                            />
                        );
                    } else {
                        return (
                            <Select 
                                value={currentValue} 
                                onValueChange={handleValueChange} 
                            >
                                <SelectTrigger 
                                    className={cn(
                                        "w-full h-9", 
                                        isValueInvalid && "border-destructive text-destructive"
                                    )}
                                >
                                    {isValueInvalid && staleLabel ? (
                                        <span className="truncate">{staleLabel}</span>
                                    ) : (
                                        <SelectValue placeholder="Select Value..." className="truncate" />
                                    )}
                                </SelectTrigger>
                                <SelectContent>
                                    {(options.length > 0) ? (
                                        options.map(option => (
                                            <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                                        ))
                                    ) : (
                                        <div className={cn("px-2 py-1.5 text-sm text-center", isValueInvalid ? "text-destructive" : "text-muted-foreground")}>
                                            {displayDescription} 
                                        </div>
                                    )}
                                </SelectContent>
                            </Select>
                        );
                    }
                }
                case 'text':
                default:
                    return (
                        <Input 
                            placeholder="Enter value..." 
                            className="w-full h-9" 
                            value={conditionNode.value ?? ''} 
                            onChange={(e) => handleValueChange(e.target.value)} 
                        />
                    );
            }
        };

        // Render condition row directly
        return (
            <div className="flex flex-col w-full sm:inline-flex sm:flex-row gap-2 p-2 border rounded bg-background">
                {/* --- Fact Select --- */}
                <div className="w-full sm:w-1/4">
                    <Select value={conditionNode.fact} onValueChange={handleFactChange}>
                        <SelectTrigger className="w-full h-9">
                            <SelectValue placeholder="Select Field..." className="truncate" />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(groupedFacts).map(([groupName, facts]) => (
                                <SelectGroup key={groupName}>
                                    <SelectLabel>{groupName}</SelectLabel>
                                    {facts.map(fact => (
                                        <SelectItem key={fact.id} value={fact.id}>
                                            {fact.label}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                
                {/* --- Operator Select --- */}
                <div className="w-full sm:w-[100px]">
                    <Select 
                        value={conditionNode.operator} 
                        onValueChange={(newOperator: z.infer<typeof JsonRulesEngineOperatorsSchema>) => { 
                            onChange({ ...conditionNode, operator: newOperator });
                        }}
                        disabled={!factDefinitionFromProps}
                    >
                        <SelectTrigger className="w-full h-9">
                            <SelectValue placeholder="Select Operator..." className="truncate">
                                {conditionNode.operator ? OPERATOR_DISPLAY_MAP[conditionNode.operator] : "Select Operator..."}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {sortOperators(factDefinitionFromProps?.operators ?? []).map(op => (
                                <SelectItem key={op} value={op}>
                                    {OPERATOR_DISPLAY_MAP[op] || op} 
                                </SelectItem>
                            ))}
                            {!factDefinitionFromProps && <SelectItem value="" disabled>Select field first</SelectItem>}
                        </SelectContent>
                    </Select>
                </div>

                {/* --- Value Input Component --- */}
                <div className="w-full sm:w-1/3 relative">
                    {renderValueInput()}
                </div>

                {/* Remove Button - Always render structure, show button based on prop */}
                <div className="flex justify-end items-center mt-2 sm:mt-0">
                    {onRemove && (
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={onRemove}>
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remove Condition</span>
                        </Button>
                    )}
                </div>
            </div>
        );
    }
}