'use client';

import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { MultiSelectComboBox } from '@/components/ui/multi-select-combobox';
import { cn } from '@/lib/utils';
import type { AutomationFormValues } from '../AutomationForm';

const descriptionStyles = 'text-xs text-muted-foreground mt-1';

export interface ZoneOption { value: string; label: string }

interface AlarmZoneActionFieldsProps {
  form: UseFormReturn<AutomationFormValues>;
  actionIndex: number;
  zones: ZoneOption[];
  isLoading?: boolean;
  mode: 'arm' | 'disarm';
}

const ZONE_SCOPING_OPTIONS = [
  { value: 'ALL_ZONES_IN_SCOPE', label: 'All Zones in Scope' },
  { value: 'SPECIFIC_ZONES', label: 'Specific Zones' },
];

export function AlarmZoneActionFields({ form, actionIndex, zones, isLoading, mode }: AlarmZoneActionFieldsProps) {
  const currentScoping = form.watch(`config.actions.${actionIndex}.params.scoping`);

  return (
    <>
      <FormField
        control={form.control}
        name={`config.actions.${actionIndex}.params.scoping`}
        render={({ field }) => (
          <FormItem className="space-y-3">
            <FormLabel>Zone Scoping</FormLabel>
            <FormControl>
              <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1" disabled={!!isLoading}>
                {ZONE_SCOPING_OPTIONS.map(option => (
                  <FormItem key={option.value} className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value={option.value} />
                    </FormControl>
                    <FormLabel className="font-normal">{option.label}</FormLabel>
                  </FormItem>
                ))}
              </RadioGroup>
            </FormControl>
          </FormItem>
        )}
      />

      {currentScoping === 'SPECIFIC_ZONES' && (
        <FormField
          control={form.control}
          name={`config.actions.${actionIndex}.params.targetZoneIds`}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel className="mr-2">Target Zones</FormLabel>
              <FormControl>
                <MultiSelectComboBox
                  options={zones}
                  selected={field.value || []}
                  onChange={field.onChange}
                  placeholder="Select zones..."
                  className={cn('w-full max-w-md', fieldState.error && (fieldState.isTouched || form.formState.isSubmitted) && 'border-destructive')}
                  disabled={!!isLoading || zones.length === 0}
                />
              </FormControl>
              {zones.length === 0 && <FormDescription className={descriptionStyles}>No zones available to select.</FormDescription>}
            </FormItem>
          )}
        />
      )}
    </>
  );
}


