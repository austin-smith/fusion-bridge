'use client';

import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { TokenInserter } from '@/components/features/automations/TokenInserter';
import { AVAILABLE_AUTOMATION_TOKENS } from '@/lib/automation-tokens';
import type { AutomationFormValues } from '../AutomationForm';
import type { TargetDeviceOption } from '@/components/features/automations/controls/LockDeviceSelection';
import { HelpCircle } from 'lucide-react';
import { getIconComponentByName } from '@/lib/mappings/presentation';

const descriptionStyles = 'text-xs text-muted-foreground mt-1';

const YOLINK_TONE_OPTIONS = [
  { value: 'Alert', label: 'Alert' },
  { value: 'Emergency', label: 'Emergency' },
  { value: 'Tip', label: 'Tip' },
  { value: 'Warn', label: 'Warn' },
];

interface PlayAudioActionFieldsProps {
  form: UseFormReturn<AutomationFormValues>;
  actionIndex: number;
  devices: TargetDeviceOption[];
  isLoading?: boolean;
  onInsertToken: (field: 'messageTemplate' | 'toneTemplate' | 'volumeTemplate' | 'repeatTemplate', actionIndex: number, token: string) => void;
}

export function PlayAudioActionFields({ form, actionIndex, devices, isLoading, onInsertToken }: PlayAudioActionFieldsProps) {
  const audioCapableDevices = devices.filter(device => device.supportsAudio);

  return (
    <div className="flex flex-col space-y-4 mt-2">
      <FormLabel className="mb-1 mt-2">Audio Configuration</FormLabel>

      <FormField
        control={form.control}
        name={`config.actions.${actionIndex}.params.targetDeviceInternalId`}
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>Hub Device</FormLabel>
            <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={!!isLoading}>
              <FormControl>
                <SelectTrigger className={cn('w-[300px]', fieldState.error && (fieldState.isTouched || form.formState.isSubmitted) && 'border-destructive')}>
                  <SelectValue placeholder="Select device..." />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {audioCapableDevices.map(device => {
                  const IconComponent = getIconComponentByName(device.iconName) || HelpCircle;
                  return (
                    <SelectItem key={device.id} value={device.id}>
                      <div className="flex items-center">
                        <IconComponent className="h-4 w-4 mr-2 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span>{device.name}</span>
                      </div>
                    </SelectItem>
                  );
                })}
                {audioCapableDevices.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No devices found for audio playback.</div>
                )}
              </SelectContent>
            </Select>
            <FormDescription className={descriptionStyles}>Select the device to play audio on. Audio actions require compatible speaker hardware.</FormDescription>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`config.actions.${actionIndex}.params.messageTemplate`}
        render={({ field, fieldState }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel>Message</FormLabel>
              <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => onInsertToken('messageTemplate', actionIndex, token)} />
            </div>
            <FormControl>
              <Textarea 
                {...field} 
                disabled={!!isLoading} 
                placeholder="Enter the text-to-speech message..." 
                className={cn('min-h-[80px]', fieldState.error && (fieldState.isTouched || form.formState.isSubmitted) && 'border-destructive')} 
              />
            </FormControl>
            <FormDescription className={descriptionStyles}>The message to be spoken using text-to-speech. Supports automation tokens.</FormDescription>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`config.actions.${actionIndex}.params.toneTemplate`}
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>Tone (Optional)</FormLabel>
            <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={!!isLoading}>
              <FormControl>
                <SelectTrigger className={cn('w-[200px]', fieldState.error && (fieldState.isTouched || form.formState.isSubmitted) && 'border-destructive')}>
                  <SelectValue placeholder="Select tone..." />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="none">No tone</SelectItem>
                {YOLINK_TONE_OPTIONS.map(tone => (
                  <SelectItem key={tone.value} value={tone.value}>
                    {tone.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription className={descriptionStyles}>Optional alert tone to play before the message.</FormDescription>
          </FormItem>
        )}
      />

      <div className="flex items-end space-x-4">
        <FormField
          control={form.control}
          name={`config.actions.${actionIndex}.params.volumeTemplate`}
          render={({ field, fieldState }) => (
            <FormItem className="flex-grow">
              <FormLabel>Volume (Optional)</FormLabel>
              <FormControl>
                <Input {...field} disabled={!!isLoading} placeholder="1-100" type="number" min="1" max="100" className={cn('w-[120px]', fieldState.error && (fieldState.isTouched || form.formState.isSubmitted) && 'border-destructive')} />
              </FormControl>
              <FormDescription className={descriptionStyles}>Volume level (1-100). Uses device default if not specified.</FormDescription>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`config.actions.${actionIndex}.params.repeatTemplate`}
          render={({ field, fieldState }) => (
            <FormItem className="flex-grow">
              <FormLabel>Repeat (Optional)</FormLabel>
              <FormControl>
                <Input {...field} disabled={!!isLoading} placeholder="0-10" type="number" min="0" max="10" className={cn('w-[120px]', fieldState.error && (fieldState.isTouched || form.formState.isSubmitted) && 'border-destructive')} />
              </FormControl>
              <FormDescription className={descriptionStyles}>Number of times to repeat (0-10). 0 = no repeat.</FormDescription>
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}


