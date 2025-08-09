'use client';

import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import type { AutomationFormValues } from '../AutomationForm';
import { LockDeviceSelection as LockDeviceSelectionControl, type TargetDeviceOption } from '@/components/features/automations/controls/LockDeviceSelection';

interface LockDeviceActionFieldsProps {
  form: UseFormReturn<AutomationFormValues>;
  actionIndex: number;
  devices: TargetDeviceOption[];
  allLocations: any[];
  allSpaces: any[];
  isLoading?: boolean;
}

export function LockDeviceActionFields({ form, actionIndex, devices, allLocations, allSpaces, isLoading }: LockDeviceActionFieldsProps) {
  return (
    <LockDeviceSelectionControl
      form={form}
      actionIndex={actionIndex}
      actionType="lock"
      devices={devices}
      allLocations={allLocations}
      allSpaces={allSpaces}
      isLoading={!!isLoading}
    />
  );
}


