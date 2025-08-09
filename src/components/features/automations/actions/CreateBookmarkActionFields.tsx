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

interface CreateBookmarkActionFieldsProps {
  form: UseFormReturn<AutomationFormValues>;
  actionIndex: number;
  connectors: Pick<ConnectorSelect, 'id' | 'name' | 'category'>[];
  isLoading?: boolean;
  onInsertToken: (fieldName: 'nameTemplate' | 'descriptionTemplate' | 'durationMsTemplate' | 'tagsTemplate', actionIndex: number, token: string) => void;
}

export function CreateBookmarkActionFields({ form, actionIndex, connectors, isLoading, onInsertToken }: CreateBookmarkActionFieldsProps) {
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
            <FormDescription className={descriptionStyles}>Select the Piko system to create a bookmark in.</FormDescription>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`config.actions.${actionIndex}.params.nameTemplate`}
        render={({ field, fieldState }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel>Name</FormLabel>
              <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => onInsertToken('nameTemplate', actionIndex, token)} />
            </div>
            <FormControl>
              <Input 
                placeholder="e.g., Alert: {{device.name}}" 
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
                placeholder="e.g., Device: {{device.name}} triggered event {{event.event}}" 
                {...field} 
                value={field.value ?? ''} 
                disabled={isLoading} 
                className={cn(fieldState.error && (fieldState.isTouched || form.formState.isSubmitted) && 'border-destructive')} 
              />
            </FormControl>
          </FormItem>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name={`config.actions.${actionIndex}.params.durationMsTemplate`}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Duration (ms)</FormLabel>
              <FormControl>
                <Input 
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g., 5000"
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^[0-9]+$/.test(value)) {
                      field.onChange(value);
                    }
                  }}
                  disabled={isLoading}
                  className={cn(fieldState.error && (fieldState.isTouched || form.formState.isSubmitted) && 'border-destructive')}
                />
              </FormControl>
              <FormDescription className={descriptionStyles}>Duration in milliseconds.</FormDescription>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`config.actions.${actionIndex}.params.tagsTemplate`}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Tags</FormLabel>
              <FormControl>
                <Input 
                  placeholder="e.g., Alert,{{device.type}},Automation"
                  {...field}
                  value={field.value ?? ''}
                  disabled={isLoading}
                  className={cn(fieldState.error && (fieldState.isTouched || form.formState.isSubmitted) && 'border-destructive')}
                />
              </FormControl>
              <FormDescription className={descriptionStyles}>Enter tags separated by commas.</FormDescription>
            </FormItem>
          )}
        />
      </div>
    </>
  );
}


