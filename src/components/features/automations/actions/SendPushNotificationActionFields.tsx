'use client';

import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField, FormItem, FormLabel, FormControl, FormDescription } from '@/components/ui/form';
import { TokenInserter } from '@/components/features/automations/TokenInserter';
import { AVAILABLE_AUTOMATION_TOKENS } from '@/lib/automation-tokens';
import { SendPushNotificationActionParamsSchema } from '@/lib/automation-schemas';
import type { AutomationFormValues } from '../AutomationForm';
import { priorityOptions } from '@/lib/pushover-constants';
import { cn } from '@/lib/utils';

const descriptionStyles = 'text-xs text-muted-foreground mt-1';
const ALL_USERS_PUSHOVER_VALUE = '__all__';

export function SendPushNotificationActionFields({
  form,
  actionIndex,
  isLoading,
  onInsertToken,
}: {
  form: UseFormReturn<AutomationFormValues>;
  actionIndex: number;
  isLoading: boolean;
  onInsertToken: (fieldName: keyof z.infer<typeof SendPushNotificationActionParamsSchema>, actionIndex: number, token: string) => void;
}) {
  return (
    <>
      <FormField
        control={form.control}
        name={`config.actions.${actionIndex}.params.titleTemplate`}
        render={({ field, fieldState }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel>Title</FormLabel>
              <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => onInsertToken('titleTemplate', actionIndex, token)} />
            </div>
            <FormControl>
              <Input placeholder="Notification title" {...field} value={field.value ?? ''} disabled={isLoading} className={cn('w-full', fieldState.error && 'border-destructive')} />
            </FormControl>
            <FormDescription className={descriptionStyles}>Optional title for the notification.</FormDescription>
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
              <Textarea placeholder="Notification message content" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} />
            </FormControl>
            <FormDescription className={descriptionStyles}>The main content of the notification.</FormDescription>
          </FormItem>
        )}
      />

      {/* Keep Pushover simple: either All Users or a manual user key. No dynamic fetching. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name={`config.actions.${actionIndex}.params.targetUserKeyTemplate`}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Target User</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ALL_USERS_PUSHOVER_VALUE} disabled={isLoading}>
                <FormControl>
                  <SelectTrigger className={cn('w-[220px]', fieldState.error && 'border-destructive')}>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={ALL_USERS_PUSHOVER_VALUE}>All Users</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription className={descriptionStyles}>Default is All Users. To target a specific user, enter a user key below.</FormDescription>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`config.actions.${actionIndex}.params.targetUserKeyTemplate`}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Override User Key (optional)</FormLabel>
              <FormControl>
                <Input
                  placeholder="Pushover user key"
                  value={field.value === ALL_USERS_PUSHOVER_VALUE ? '' : field.value || ''}
                  onChange={(e) => field.onChange(e.target.value || ALL_USERS_PUSHOVER_VALUE)}
                  disabled={isLoading}
                  className={cn('w-full', fieldState.error && 'border-destructive')}
                />
              </FormControl>
              <FormDescription className={descriptionStyles}>Leave empty to send to All Users.</FormDescription>
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name={`config.actions.${actionIndex}.params.priority`}
        render={({ field, fieldState }) => {
          const selectedOption = priorityOptions.find((option) => option.value === field.value);
          return (
            <FormItem>
              <FormLabel>Priority</FormLabel>
              <Select onValueChange={(value) => field.onChange(parseInt(value, 10))} value={field.value?.toString() ?? '0'} disabled={isLoading}>
                <FormControl>
                  <SelectTrigger className={cn('w-[220px]', fieldState.error && 'border-destructive')}>
                    <SelectValue asChild>
                      <span>{selectedOption ? selectedOption.label : 'Select Priority'}</span>
                    </SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {priorityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      <div className="flex flex-col">
                        <span className="font-medium">{option.label}</span>
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription className={descriptionStyles}>Affects notification delivery and sound.</FormDescription>
            </FormItem>
          );
        }}
      />
    </>
  );
}


