'use client';

import React from 'react';
import { UseFormReturn, useFieldArray } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TokenInserter } from '@/components/automations/TokenInserter';
import { AVAILABLE_AUTOMATION_TOKENS } from '@/lib/automation-tokens';
import type { InsertableFieldNames } from './ActionItem'; // Import from local ActionItem for now
import type { AutomationFormValues } from '../AutomationForm';

const descriptionStyles = "text-xs text-muted-foreground mt-1";

interface SendHttpRequestActionFieldsProps {
  form: UseFormReturn<AutomationFormValues>;
  actionIndex: number;
  handleInsertToken: (
    // fieldName here will be a subset of the main InsertableFieldNames, 
    // specifically for HTTP request params or header templates.
    fieldName: Extract<InsertableFieldNames, 'urlTemplate' | 'bodyTemplate' | `headers.${number}.keyTemplate` | `headers.${number}.valueTemplate`>,
    actionIndex: number, 
    token: string, 
    headerIndex?: number
  ) => void;
  // isLoading: boolean; // Already handled by parent (ActionItem)
}

export function SendHttpRequestActionFields({
  form,
  actionIndex,
  handleInsertToken,
}: SendHttpRequestActionFieldsProps) {
  const { fields: headerFields, append: appendHeader, remove: removeHeader } = useFieldArray({
    control: form.control,
    name: `config.actions.${actionIndex}.params.headers`
  });

  const httpMethod = form.watch(`config.actions.${actionIndex}.params.method`);
  const showBodyAndContentType = ['POST', 'PUT', 'PATCH'].includes(httpMethod);

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name={`config.actions.${actionIndex}.params.urlTemplate`}
        render={({ field, fieldState }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel>URL</FormLabel>
              <TokenInserter 
                tokens={AVAILABLE_AUTOMATION_TOKENS} 
                onInsert={(token) => handleInsertToken('urlTemplate', actionIndex, token)}
              />
            </div>
            <FormControl>
              <Input placeholder="https://api.example.com/data" {...field} value={field.value ?? ''} className={cn(fieldState.error && 'border-destructive')} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`config.actions.${actionIndex}.params.method`}
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>Method</FormLabel>
            <Select onValueChange={field.onChange} value={field.value ?? 'GET'}>
              <FormControl>
                <SelectTrigger className={cn("w-[120px]", fieldState.error && 'border-destructive')}>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <div>
        <FormLabel>Headers</FormLabel>
        <div className="space-y-2 mt-1">
          {headerFields.map((headerItem, headerIndex) => (
            <div key={headerItem.id} className="flex items-center gap-2">
              <FormField
                control={form.control}
                name={`config.actions.${actionIndex}.params.headers.${headerIndex}.keyTemplate`}
                render={({ field, fieldState }) => (
                  <FormItem className="flex-1">
                     <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Key</span>
                        <TokenInserter 
                            tokens={AVAILABLE_AUTOMATION_TOKENS} 
                            onInsert={(token) => handleInsertToken(`headers.${headerIndex}.keyTemplate` as const, actionIndex, token, headerIndex)} 
                        />
                    </div>
                    <FormControl>
                      <Input placeholder="Header-Name" {...field} value={field.value ?? ''} className={cn("h-8", fieldState.error && 'border-destructive')} />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`config.actions.${actionIndex}.params.headers.${headerIndex}.valueTemplate`}
                render={({ field, fieldState }) => (
                  <FormItem className="flex-1">
                     <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Value</span>
                        <TokenInserter 
                            tokens={AVAILABLE_AUTOMATION_TOKENS} 
                            onInsert={(token) => handleInsertToken(`headers.${headerIndex}.valueTemplate` as const, actionIndex, token, headerIndex)} 
                        />
                    </div>
                    <FormControl>
                      <Input placeholder="Header Value" {...field} value={field.value ?? ''} className={cn("h-8", fieldState.error && 'border-destructive')} />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-5 text-muted-foreground hover:text-destructive h-8 w-8 shrink-0"
                onClick={() => removeHeader(headerIndex)}
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Remove header</span>
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => appendHeader({ keyTemplate: '', valueTemplate: '' })}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Header
        </Button>
        <FormDescription className={descriptionStyles}>Define HTTP headers for the request.</FormDescription>
      </div>

      {showBodyAndContentType && (
        <FormField
          control={form.control}
          name={`config.actions.${actionIndex}.params.contentType`}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Content Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? 'text/plain'}>
                <FormControl>
                  <SelectTrigger className={cn("w-[220px]", fieldState.error && 'border-destructive')}>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="text/plain">Text (text/plain)</SelectItem>
                  <SelectItem value="application/json">JSON (application/json)</SelectItem>
                  <SelectItem value="application/xml">XML (application/xml)</SelectItem>
                  <SelectItem value="application/x-www-form-urlencoded">Form (x-www-form-urlencoded)</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription className={descriptionStyles}>Content type of the request body.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {showBodyAndContentType && (
        <FormField
          control={form.control}
          name={`config.actions.${actionIndex}.params.bodyTemplate`}
          render={({ field, fieldState }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Body</FormLabel>
                <TokenInserter 
                    tokens={AVAILABLE_AUTOMATION_TOKENS} 
                    onInsert={(token) => handleInsertToken('bodyTemplate', actionIndex, token)} 
                />
              </div>
              <FormControl>
                <Textarea placeholder="Request body content..." {...field} value={field.value ?? ''} className={cn(fieldState.error && 'border-destructive')} />
              </FormControl>
              <FormDescription className={descriptionStyles}>The body of the HTTP request. Leave empty for GET/DELETE.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
} 