'use client';

import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { TokenInserter } from '@/components/features/automations/TokenInserter';
import { AVAILABLE_AUTOMATION_TOKENS } from '@/lib/automation-tokens';
import { TargetConnectorSelect } from '@/components/features/automations/controls/TargetConnectorSelect';
import type { connectors } from '@/data/db/schema';
import type { AutomationFormValues } from '../AutomationForm';
import { cn } from '@/lib/utils';

const descriptionStyles = 'text-xs text-muted-foreground mt-1';

type ConnectorSelect = typeof connectors.$inferSelect;

interface CreateEventActionFieldsProps {
  form: UseFormReturn<AutomationFormValues>;
  actionIndex: number;
  connectors: Pick<ConnectorSelect, 'id' | 'name' | 'category'>[];
  isLoading?: boolean;
  onInsertToken: (fieldName: 'sourceTemplate' | 'captionTemplate' | 'descriptionTemplate', actionIndex: number, token: string) => void;
}

export function CreateEventActionFields({ form, actionIndex, connectors, isLoading, onInsertToken }: CreateEventActionFieldsProps) {
  return (
    <>
      <FormField
        control={form.control}
        name={`config.actions.${actionIndex}.params.targetConnectorId`}
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>Target Connector</FormLabel>
            <FormControl>
              <TargetConnectorSelect 
                value={field.value}
                onChange={field.onChange}
                connectors={connectors}
                isLoading={isLoading}
                error={!!(fieldState.error && (fieldState.isTouched || form.formState.isSubmitted))}
              />
            </FormControl>
            <FormDescription className={descriptionStyles}>Select the Piko system to create an event in.</FormDescription>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`config.actions.${actionIndex}.params.sourceTemplate`}
        render={({ field, fieldState }) => (
          <FormItem className="space-y-1">
            <div className="flex items-center justify-between">
              <FormLabel>Source</FormLabel>
              <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => onInsertToken('sourceTemplate', actionIndex, token)} />
            </div>
            <FormControl>
              <Input 
                placeholder="Fusion" 
                {...field} 
                value={field.value ?? ''} 
                disabled={isLoading} 
                className={cn('w-full max-w-xs', fieldState.error && (fieldState.isTouched || form.formState.isSubmitted) && 'border-destructive')} 
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`config.actions.${actionIndex}.params.captionTemplate`}
        render={({ field, fieldState }) => (
          <FormItem className="space-y-1">
            <div className="flex items-center justify-between">
              <FormLabel>Caption</FormLabel>
              <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => onInsertToken('captionTemplate', actionIndex, token)} />
            </div>
            <FormControl>
              <Textarea 
                placeholder="Device: {{device.name}} // Event: {{event.displayState}} at {{event.timestamp}}" 
                {...field} 
                value={field.value ?? ''} 
                disabled={isLoading} 
                className={cn(fieldState.error && (fieldState.isTouched || form.formState.isSubmitted) && 'border-destructive')} 
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`config.actions.${actionIndex}.params.descriptionTemplate`}
        render={({ field, fieldState }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel>Description</FormLabel>
              <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => onInsertToken('descriptionTemplate', actionIndex, token)} />
            </div>
            <FormControl>
              <Textarea 
                placeholder="Device: {{device.externalId}} // Type: {{event.type}} // State: {{event.displayState}}" 
                {...field} 
                value={field.value ?? ''} 
                disabled={isLoading} 
                className={cn(fieldState.error && (fieldState.isTouched || form.formState.isSubmitted) && 'border-destructive')} 
              />
            </FormControl>
          </FormItem>
        )}
      />
    </>
  );
}


