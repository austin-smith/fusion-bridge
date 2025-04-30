'use client';

import React from 'react';
import { ControllerRenderProps } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { JsonRuleGroup, JsonRuleCondition, JsonRulesEngineOperatorsSchema } from '@/lib/automation-schemas';
import { AVAILABLE_AUTOMATION_FACTS, getFactById, type AutomationFact } from '@/lib/automation-facts';
import { z } from 'zod';

// Define the combined type for a rule node
type RuleNode = JsonRuleGroup | JsonRuleCondition; 

interface RuleBuilderProps {
  value: RuleNode; // The current condition or group object
  onChange: (newValue: RuleNode) => void; // Callback to update this specific node
  depth?: number; // Current depth for recursion limiting
  onRemove?: () => void; // Callback to remove this node (if it's not the root)
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

export function RuleBuilder({ 
    value,       // Use direct value prop
    onChange,    // Use direct onChange prop
    depth = 0, 
    onRemove 
}: RuleBuilderProps) {
    
    // No longer need to get value from field
    // const value = field.value as RuleNode; 

    // handleUpdate is now just the passed onChange
    // const handleUpdate = (newValue: RuleNode) => { ... };

    // Determine if the current node is a group or a condition
    const isGroup = (node: RuleNode): node is JsonRuleGroup => {
        return ('all' in node) || ('any' in node);
    };

    const addCondition = (groupType: 'all' | 'any', currentConditions: RuleNode[]) => {
        const defaultFact = AVAILABLE_AUTOMATION_FACTS[0];
        if (!defaultFact) {
             console.error("No available automation facts defined!");
             return; // Cannot add condition if no facts exist
        }
        const newCondition: JsonRuleCondition = {
            fact: defaultFact.id,
            operator: defaultFact.operators[0],
            value: '',
        };
        const newConditions = [...currentConditions, newCondition];
        onChange({ [groupType]: newConditions });
    };

    const addGroup = (groupType: 'all' | 'any', currentConditions: RuleNode[]) => {
        const newGroup: JsonRuleGroup = { any: [] };
        const newConditions = [...currentConditions, newGroup];
        onChange({ [groupType]: newConditions });
    };

    const changeGroupType = (newType: 'all' | 'any') => {
        if (!isGroup(value)) return;
        const oldType = newType === 'all' ? 'any' : 'all';
        const conditions = value[oldType] || [];
        onChange({ [newType]: conditions });
    };

    const handleItemChange = (index: number, groupType: 'all' | 'any', currentConditions: RuleNode[]) => (updatedItem: RuleNode) => {
        const newConditions = [
            ...currentConditions.slice(0, index),
            updatedItem,
            ...currentConditions.slice(index + 1),
        ];
        onChange({ [groupType]: newConditions });
    };

    const handleItemRemove = (index: number, groupType: 'all' | 'any', currentConditions: RuleNode[]) => () => {
        const newConditions = [
            ...currentConditions.slice(0, index),
            ...currentConditions.slice(index + 1),
        ];
        onChange({ [groupType]: newConditions });
    };

    if (depth >= MAX_DEPTH) {
        return <div className="text-red-500 text-xs p-2 border border-red-500 rounded">Max nesting depth reached.</div>;
    }

    if (isGroup(value)) {
        const groupType = 'all' in value ? 'all' : 'any';
        const conditions = value[groupType] || [];

        return (
            <div className={cn(
                "p-3 rounded-md space-y-3",
                depth > 0 && "border border-dashed", // Add border for nested groups
                groupType === 'all' ? 'bg-blue-50/30 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800' 
                                  : 'bg-green-50/30 dark:bg-green-950/20 border-green-200 dark:border-green-800'
            )}>
                <div className="flex items-center justify-between space-x-2">
                    <Select 
                        value={groupType} 
                        onValueChange={changeGroupType} // Updated handler
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
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onRemove}>
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
                             key={index} // Consider more stable keys if items reorder
                             value={item}
                             onChange={handleItemChange(index, groupType, conditions)}
                             depth={depth + 1}
                             onRemove={handleItemRemove(index, groupType, conditions)}
                         />
                     ))}
                </div>

                <div className="flex items-center space-x-2 pt-2">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => addCondition(groupType, conditions)} // Pass context
                        disabled={depth >= MAX_DEPTH -1} // Disable adding if next level hits max depth
                    >
                         <Plus className="h-3 w-3 mr-1" /> Condition
                    </Button>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => addGroup(groupType, conditions)} // Pass context
                        disabled={depth >= MAX_DEPTH -1} // Disable adding if next level hits max depth
                    >
                         <Plus className="h-3 w-3 mr-1" /> Group
                    </Button>
                 </div>
            </div>
        );
    } else {
        // --- Render Condition Row (Placeholder - Logic to be added) ---
        const condition = value as JsonRuleCondition; 
        const factDefinition = getFactById(condition.fact);

        const handleFactChange = (newFactId: string) => {
            const newFactDefinition = getFactById(newFactId);
            if (!newFactDefinition) return; // Should not happen

            // Reset operator and value when fact changes
            const newOperator = newFactDefinition.operators[0];
            const defaultValue: any = '';
            // --- REMOVED boolean check to satisfy linter --- 
            // if (newFactDefinition.dataType === 'boolean') defaultValue = false;
            // Add other default value logic if needed (e.g., for numbers)
            
            onChange({ 
                ...condition, 
                fact: newFactId, 
                operator: newOperator,
                value: defaultValue 
            });
        };

        const handleValueChange = (newValue: any) => {
             const finalValue = newValue;
             // --- REMOVE Coercion logic for now --- 
             // if (factDefinition?.dataType === 'number') {
             //     const parsed = parseFloat(newValue);
             //     finalValue = isNaN(parsed) ? newValue : parsed; 
             // } else if (factDefinition?.dataType === 'boolean') {
             //     if (typeof newValue === 'string') {
             //         if (newValue.toLowerCase() === 'true') finalValue = true;
             //         else if (newValue.toLowerCase() === 'false') finalValue = false;
             //     }
             // }
             onChange({ ...condition, value: finalValue });
        };

        // Determine which value input component to render
        const renderValueInput = () => {
            if (!factDefinition) {
                return <Input placeholder="Select field first..." className="flex-grow h-9" disabled />;
            }

            switch (factDefinition.valueInputType) {
                case 'select':
                    return (
                        <Select 
                            value={String(condition.value ?? '')} 
                            onValueChange={handleValueChange} 
                        >
                            <SelectTrigger className="flex-grow h-9">
                                <SelectValue placeholder="Select Value..." />
                            </SelectTrigger>
                            <SelectContent>
                                {(factDefinition.valueOptions && factDefinition.valueOptions.length > 0) ? (
                                    factDefinition.valueOptions.map(option => (
                                    <SelectItem key={option.value} value={String(option.value)}>
                                        {option.label}
                                    </SelectItem>
                                    ))
                                ) : (
                                    <SelectItem value="" disabled>No options available</SelectItem>
                                )}
                            </SelectContent>
                        </Select>
                    );
                case 'text':
                default:
                    return (
                        <Input 
                            placeholder="Enter value..." 
                            className="flex-grow h-9" 
                            value={condition.value ?? ''} 
                            onChange={(e) => handleValueChange(e.target.value)} 
                        />
                    );
            }
        };

        return (
            <div className="flex items-center space-x-2 p-2 border rounded bg-background">
                 {/* --- Fact Select --- */}
                <Select value={condition.fact} onValueChange={handleFactChange}>
                    <SelectTrigger className="w-[180px] h-9">
                        <SelectValue placeholder="Select Field..." />
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
                
                 {/* --- Operator Select --- */}
                <Select 
                    value={condition.operator} 
                    onValueChange={(newOperator: z.infer<typeof JsonRulesEngineOperatorsSchema>) => { 
                        onChange({ ...condition, operator: newOperator });
                     }}
                     // Disable if factDefinition is missing (shouldn't happen often)
                     disabled={!factDefinition} 
                >
                     <SelectTrigger className="w-[150px] h-9">
                         <SelectValue placeholder="Select Operator..." />
                     </SelectTrigger>
                     <SelectContent>
                         {factDefinition?.operators.map(op => (
                            <SelectItem key={op} value={op}>
                                {/* TODO: Maybe add user-friendly operator names later? */} 
                                {op} 
                            </SelectItem>
                         ))}
                         {!factDefinition && <SelectItem value="" disabled>Select field first</SelectItem>}
                     </SelectContent>
                </Select>

                {/* --- Render Value Input Component --- */}
                {renderValueInput()}

                 {onRemove && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onRemove}>
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remove Condition</span>
                    </Button>
                )}
            </div>
        );
    }
}

// --- REMOVED Local Placeholder --- 
// interface JsonRuleCondition {
//     fact: string;
//     operator: string; 
//     value: any;
//     path?: string;
// } 