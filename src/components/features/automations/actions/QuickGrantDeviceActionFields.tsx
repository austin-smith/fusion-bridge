'use client';

import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import type { AutomationFormValues } from '../AutomationForm';
import { LockDeviceSelection as LockDeviceSelectionControl, type TargetDeviceOption } from '@/components/features/automations/controls/LockDeviceSelection';

interface QuickGrantDeviceActionFieldsProps {
  form: UseFormReturn<AutomationFormValues>;
  actionIndex: number;
  devices: TargetDeviceOption[];
  allLocations: any[];
  allSpaces: any[];
  isLoading?: boolean;
}

export function QuickGrantDeviceActionFields({ form, actionIndex, devices, allLocations, allSpaces, isLoading }: QuickGrantDeviceActionFieldsProps) {
  return (
    <LockDeviceSelectionControl
      form={form}
      actionIndex={actionIndex}
      actionType="unlock"
      devices={devices}
      allLocations={allLocations}
      allSpaces={allSpaces}
      isLoading={!!isLoading}
    />
  );
}


