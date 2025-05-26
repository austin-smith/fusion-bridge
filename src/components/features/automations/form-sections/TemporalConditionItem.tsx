'use client';

import React from 'react';
import { UseFormReturn, useFieldArray, ControllerRenderProps, FieldError } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Plus } from 'lucide-react';
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { JsonRuleGroup, type TemporalCondition } from '@/lib/automation-schemas';
import type { Location, Area } from '@/types';
import type { AutomationFormValues } from '../AutomationForm'; // Adjust path as needed
import { RuleBuilder } from '../RuleBuilder'; // Adjust path as needed
import { cn } from '@/lib/utils';

const descriptionStyles = "text-xs text-muted-foreground mt-1";

interface TemporalConditionItemProps {
    form: UseFormReturn<AutomationFormValues>;
    index: number;
    fieldItem: Record<"id", string>; // Field item from useFieldArray
    removeTemporalCondition: (index: number) => void;
    isLoading: boolean;
    watchedLocationScopeId: string | null | undefined;
    allLocations: Location[];
    allAreas: Area[];
    devicesForConditions: Array<{ id: string; name: string; areaId?: string | null; locationId?: string | null; }>;
    allConnectors: Array<{ id: string; name: string; category: string; }>;
}

export function TemporalConditionItem({
    form,
    index,
    fieldItem,
    removeTemporalCondition,
    isLoading,
    watchedLocationScopeId,
    allLocations,
    allAreas,
    devicesForConditions,
    allConnectors,
}: TemporalConditionItemProps) {
    const conditionType = form.watch(`config.temporalConditions.${index}.type`);

    return (
        <Card key={fieldItem.id} className="relative border border-blue-200 dark:border-blue-800 pt-8 bg-blue-50/30 dark:bg-blue-950/20">
            <Button 
                type="button" 
                variant="ghost" 
                size="icon" 
                className="absolute top-1 right-1 text-muted-foreground hover:text-destructive h-6 w-6" 
                onClick={() => removeTemporalCondition(index)}
                disabled={isLoading}
            >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Remove Temporal Condition</span>
            </Button>
            <CardContent className="space-y-4">
                <FormField 
                    control={form.control}
                    name={`config.temporalConditions.${index}.type`}
                    render={({ field, fieldState }) => (
                    <FormItem>
                        <FormLabel>Condition</FormLabel>
                        <div className="flex items-start gap-2">
                            <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                                <FormControl><SelectTrigger className={cn("w-[250px]", fieldState.error && 'border-destructive')}><SelectValue placeholder="Select condition type..." /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="eventOccurred">Any matching event occurred</SelectItem>
                                    <SelectItem value="noEventOccurred">No matching event occurred</SelectItem>
                                    <SelectItem value="eventCountEquals">Matching event count =</SelectItem>
                                    <SelectItem value="eventCountLessThan">Matching event count &lt;</SelectItem>
                                    <SelectItem value="eventCountGreaterThan">Matching event count &gt;</SelectItem>
                                    <SelectItem value="eventCountLessThanOrEqual">Matching event count &le;</SelectItem>
                                    <SelectItem value="eventCountGreaterThanOrEqual">Matching event count &ge;</SelectItem>
                                </SelectContent>
                            </Select>
                            {/* --- Conditionally render Count Input INLINE --- */}
                            {[ 'eventCountEquals', 'eventCountLessThan', 'eventCountGreaterThan', 'eventCountLessThanOrEqual', 'eventCountGreaterThanOrEqual' ].includes(conditionType) && (
                                <FormField
                                    control={form.control}
                                    name={`config.temporalConditions.${index}.expectedEventCount`}
                                    render={({ field: countField, fieldState: countFieldState }) => (
                                        <FormItem className="flex flex-col m-0 p-0">
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    placeholder="Count"
                                                    disabled={isLoading}
                                                    className={cn("w-[100px]", countFieldState.error && 'border-destructive')}
                                                    value={countField.value === undefined || countField.value === null ? '' : String(countField.value)}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        countField.onChange(val === '' ? undefined : Number(val));
                                                    }}
                                                    onBlur={countField.onBlur}
                                                    name={countField.name}
                                                    ref={countField.ref}
                                                />
                                            </FormControl>
                                            {/* Inline message for count field if needed */}
                                            {/* <FormMessage className="text-xs" /> */}
                                        </FormItem>
                                    )}
                                />
                            )}
                        </div>
                        {/* Display description/message below the flex container */}
                        <FormDescription className={descriptionStyles}>
                            Select the condition type and specify count if needed.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )} />

                <FormField 
                    control={form.control}
                    name={`config.temporalConditions.${index}.scoping`}
                    render={({ field, fieldState }) => (
                    <FormItem>
                        <FormLabel>Check Events From</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? 'anywhere'} disabled={isLoading}>
                            <FormControl><SelectTrigger className={cn("w-[250px]", fieldState.error && 'border-destructive')}><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="anywhere">Anywhere</SelectItem>
                                <SelectItem value="sameArea">Devices in same area</SelectItem>
                                <SelectItem value="sameLocation">Devices in same location</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormDescription className={descriptionStyles}>Scope the devices checked by this condition.</FormDescription>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField
                    control={form.control}
                    name={`config.temporalConditions.${index}.eventFilter`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event Filter Criteria</FormLabel>
                        <RuleBuilder
                          value={field.value as JsonRuleGroup}
                          onChange={field.onChange}
                          basePath={`config.temporalConditions.${index}.eventFilter`}
                          locationScopeId={watchedLocationScopeId}
                          allLocations={allLocations}
                          allAreas={allAreas}
                          allDevices={devicesForConditions}
                          allConnectors={allConnectors}
                        />
                        <FormDescription className={descriptionStyles}>
                          Define criteria that matching events must meet.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                />
               
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <FormField 
                        control={form.control}
                        name={`config.temporalConditions.${index}.timeWindowSecondsBefore`}
                        render={({ field, fieldState }) => (
                        <FormItem>
                            <FormLabel>Seconds Before Trigger</FormLabel>
                            <FormControl>
                                <Input 
                                    type="number" 
                                    min="0" 
                                    step="1" 
                                    placeholder="e.g., 120" 
                                    disabled={isLoading} 
                                    className={cn(fieldState.error && 'border-destructive')} 
                                    value={field.value === undefined || field.value === null ? '' : String(field.value)} 
                                    onChange={(e) => { const val = e.target.value; field.onChange(val === '' ? undefined : Number(val)); }} 
                                    onBlur={field.onBlur} 
                                    name={field.name} 
                                    ref={field.ref} 
                                />
                            </FormControl>
                            <FormDescription className={descriptionStyles}>Check for events up to this many seconds before the trigger.</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField 
                        control={form.control}
                        name={`config.temporalConditions.${index}.timeWindowSecondsAfter`}
                        render={({ field, fieldState }) => (
                        <FormItem>
                            <FormLabel>Seconds After Trigger</FormLabel>
                            <FormControl>
                                <Input 
                                    type="number" 
                                    min="0" 
                                    step="1" 
                                    placeholder="e.g., 120" 
                                    disabled={isLoading} 
                                    className={cn(fieldState.error && 'border-destructive')} 
                                    value={field.value === undefined || field.value === null ? '' : String(field.value)} 
                                    onChange={(e) => { const val = e.target.value; field.onChange(val === '' ? undefined : Number(val)); }} 
                                    onBlur={field.onBlur} 
                                    name={field.name} 
                                    ref={field.ref} 
                                />
                            </FormControl>
                            <FormDescription className={descriptionStyles}>Check for events up to this many seconds after the trigger.</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>
            </CardContent>
        </Card>
    );
} 