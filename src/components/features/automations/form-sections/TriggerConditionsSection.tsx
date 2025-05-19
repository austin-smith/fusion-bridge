'use client';

import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { RuleBuilder } from '../RuleBuilder'; // Adjust path as needed
import {
    FormDescription,
    FormField,
    FormItem,
    FormMessage,
} from "@/components/ui/form";
import type { Location, Area } from '@/types';
import type { AutomationFormValues } from '../AutomationForm'; // Adjust path as needed

const descriptionStyles = "text-xs text-muted-foreground mt-1";

interface TriggerConditionsSectionProps {
    form: UseFormReturn<AutomationFormValues>;
    basePath: string;
    watchedLocationScopeId: string | null | undefined;
    allLocations: Location[];
    allAreas: Area[];
    devicesForConditions: Array<{ id: string; name: string; areaId?: string | null; locationId?: string | null; }>;
}

export function TriggerConditionsSection({
    form,
    basePath,
    watchedLocationScopeId,
    allLocations,
    allAreas,
    devicesForConditions,
}: TriggerConditionsSectionProps) {
    return (
        <div>
            <h3 className="text-sm font-semibold mb-3">Primary Conditions (if this happens...)</h3>
            <FormField
                control={form.control}
                name={basePath as `config.trigger.conditions`}
                render={({ field }) => (
                    <FormItem>
                        <RuleBuilder 
                            value={field.value as any}
                            onChange={field.onChange} 
                            basePath={basePath}
                            locationScopeId={watchedLocationScopeId}
                            allLocations={allLocations}
                            allAreas={allAreas}
                            allDevices={devicesForConditions}
                        />
                        <FormDescription className={descriptionStyles}>Define conditions based on the triggering event&apos;s state.</FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    );
} 