'use client';

import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import type { z } from 'zod';
import type { AutomationFormValues } from '../AutomationForm';
import { DeviceSelectorCombo } from '@/components/features/automations/controls/DeviceSelectorCombo';

const descriptionStyles = 'text-xs text-muted-foreground mt-1';

export type TargetDeviceOption = {
  id: string;
  name: string;
  displayType: string;
  iconName: string;
  spaceId?: string | null;
  locationId?: string | null;
  rawType?: string;
  supportsAudio?: boolean;
  connectorCategory?: string;
  standardDeviceType?: import('@/lib/mappings/definitions').DeviceType;
};

interface LockDeviceSelectionProps {
  form: UseFormReturn<AutomationFormValues>;
  actionIndex: number;
  actionType: 'lock' | 'unlock';
  devices: TargetDeviceOption[];
  allLocations: any[];
  allSpaces: any[];
  isLoading: boolean;
  fieldError?: any;
}

export const LockDeviceSelection: React.FC<LockDeviceSelectionProps> = ({
  form,
  actionIndex,
  actionType,
  devices,
  allLocations,
  allSpaces,
  isLoading,
}) => {
  const controlLabel = actionType === 'lock' ? 'Device Lock Control' : 'Device Unlock Control';
  const description = `Select the door or access control device to ${actionType} when this automation runs.`;

  return (
    <div className="flex flex-col space-y-2 mt-2">
      <FormLabel className="mb-1 mt-2">{controlLabel}</FormLabel>
      <FormField
        control={form.control}
        name={`config.actions.${actionIndex}.params.targetDeviceInternalId`}
        render={({ field, fieldState }) => (
          <FormItem className="flex flex-col items-start space-y-1">
            <DeviceSelectorCombo
              value={field.value}
              onChange={field.onChange}
              disabled={isLoading}
              devices={devices}
              allLocations={allLocations}
              allSpaces={allSpaces}
              placeholder="Select door..."
              widthClass="w-[300px]"
              error={!!(fieldState.error && (fieldState.isTouched || form.formState.isSubmitted))}
              showIcon
            />
            <FormDescription className={descriptionStyles}>{description}</FormDescription>
          </FormItem>
        )}
      />
    </div>
  );
};


