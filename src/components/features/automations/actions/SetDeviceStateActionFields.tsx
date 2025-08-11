'use client';

import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DeviceSelectorCombo } from '@/components/features/automations/controls/DeviceSelectorCombo';
import { cn } from '@/lib/utils';
import { getOnOffActionsForOption } from '@/lib/device-actions/capabilities';
import { presentAction } from '@/lib/device-actions/presentation';
import { ActionableState } from '@/lib/mappings/definitions';
import type { AutomationFormValues } from '../AutomationForm';
import type { TargetDeviceOption } from '@/components/features/automations/controls/LockDeviceSelection';

const descriptionStyles = 'text-xs text-muted-foreground mt-1';

interface SetDeviceStateActionFieldsProps {
  form: UseFormReturn<AutomationFormValues>;
  actionIndex: number;
  devices: TargetDeviceOption[];
  allLocations: any[];
  allSpaces: any[];
  isLoading?: boolean;
}

export function SetDeviceStateActionFields({ form, actionIndex, devices, allLocations, allSpaces, isLoading }: SetDeviceStateActionFieldsProps) {
  return (
    <div className="flex flex-col space-y-2 mt-2">
      <FormLabel className="mb-1 mt-2">Device Control Flow</FormLabel>
      <div className="flex items-center space-x-2">
        <FormField
          control={form.control}
          name={`config.actions.${actionIndex}.params.targetDeviceInternalId`}
          render={({ field, fieldState }) => (
            <FormItem className="grow-0 m-0">
              <DeviceSelectorCombo
                value={field.value}
                onChange={field.onChange}
                disabled={!!isLoading}
                devices={devices}
                allLocations={allLocations}
                allSpaces={allSpaces}
                placeholder="Select device..."
                widthClass="w-[300px]"
                error={!!(fieldState.error && (fieldState.isTouched || form.formState.isSubmitted))}
                showIcon
              />
            </FormItem>
          )}
        />

        <div className="flex items-center text-muted-foreground">
          <span className="text-lg">→</span>
        </div>

        <FormField
          control={form.control}
          name={`config.actions.${actionIndex}.params.targetState`}
          render={({ field, fieldState }) => (
            <FormItem className="grow-0 m-0">
              <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={!!isLoading}>
                <FormControl>
                  <SelectTrigger className={cn('w-[120px]', fieldState.error && (fieldState.isTouched || form.formState.isSubmitted) && 'border-destructive')}>
                    <SelectValue placeholder="Select State..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(() => {
                    const targetDeviceId = form.getValues(`config.actions.${actionIndex}.params.targetDeviceInternalId`) as string | undefined;
                    const device = devices.find(d => d.id === targetDeviceId);
                    const options = device ? getOnOffActionsForOption(device) : [];
                    return options.map((a) => {
                      const { label } = presentAction(a as ActionableState);
                      return (
                        <SelectItem key={a} value={a}>
                          {label}
                        </SelectItem>
                      );
                    });
                  })()}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
      </div>
      <FormDescription className={descriptionStyles}>Select the device to control and the state to set it to.</FormDescription>
    </div>
  );
}


