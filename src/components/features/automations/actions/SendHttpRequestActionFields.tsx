'use client';

import React, { useState } from 'react';
import { UseFormReturn, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Trash2, Plus, Code, Eye, Edit } from 'lucide-react';
import { TokenInserter } from '@/components/features/automations/TokenInserter';
import { AVAILABLE_AUTOMATION_TOKENS } from '@/lib/automation-tokens';
import { HttpMethodSchema, HttpContentTypeSchema, SendHttpRequestActionParamsSchema } from '@/lib/automation-schemas';
import type { AutomationFormValues } from '../AutomationForm';
import type { InsertableFieldNames } from '../form-sections/ActionItem';
import { get } from 'lodash';
import { toast } from 'sonner';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';

const descriptionStyles = "text-xs text-muted-foreground mt-1";

interface SendHttpRequestActionFieldsProps {
  form: UseFormReturn<AutomationFormValues>;
  actionIndex: number;
  handleInsertToken: (
    fieldName: Extract<InsertableFieldNames, 'urlTemplate' | 'bodyTemplate' | `headers.${number}.keyTemplate` | `headers.${number}.valueTemplate`>,
    actionIndex: number, 
    token: string, 
    headerIndex?: number
  ) => void;
}

// Define the specific fields for SendHttpRequest params excluding headers array itself
type HttpRequestFieldName = Exclude<keyof z.infer<typeof SendHttpRequestActionParamsSchema>, 'headers'>;

// Helper function to get color classes for HTTP methods (Only text color needed now)
const getMethodTextColor = (method: string): string => {
    switch (method.toUpperCase()) {
        case 'GET': return 'text-blue-600';
        case 'POST': return 'text-green-600';
        case 'PUT': return 'text-orange-600';
        case 'DELETE': return 'text-red-600';
        case 'PATCH': return 'text-purple-600';
        case 'OPTIONS': return 'text-gray-600';
        case 'HEAD': return 'text-gray-600';
        default: return 'text-gray-700'; // Default text color
    }
};

export function SendHttpRequestActionFields({ form, actionIndex, handleInsertToken }: SendHttpRequestActionFieldsProps) {
    // Helper to generate field names scoped to this action index
    const paramFieldName = (field: HttpRequestFieldName) => `config.actions.${actionIndex}.params.${field}` as const;
    const headerFieldName = (headerIndex: number, field: 'keyTemplate' | 'valueTemplate') => `config.actions.${actionIndex}.params.headers.${headerIndex}.${field}` as const;

    // Nested useFieldArray for headers - This is now stable within this component instance
    const { fields: headerFields, append: appendHeader, remove: removeHeader } = useFieldArray({
        control: form.control,
        name: `config.actions.${actionIndex}.params.headers` as const,
    });

    // Watch relevant fields for conditional rendering
    const currentMethod = form.watch(paramFieldName('method'));
    const currentContentType = form.watch(paramFieldName('contentType'));
    const bodyTemplate = form.watch(paramFieldName('bodyTemplate')) || '';
    
    // Initialize preview state based on existing content
    const [showPreview, setShowPreview] = useState(() => {
        const initialContentType = form.getValues(paramFieldName('contentType'));
        const initialBodyTemplate = form.getValues(paramFieldName('bodyTemplate'));
        
        if (initialContentType === 'application/json' && initialBodyTemplate && initialBodyTemplate.trim() !== '') {
            try {
                JSON.parse(initialBodyTemplate);
                return true; // Show preview for existing valid JSON
            } catch {
                return false; // Invalid JSON
            }
        }
        return false; // Not JSON or empty
    });
    const showBodyFields = !!currentMethod && ['POST', 'PUT', 'PATCH'].includes(currentMethod as z.infer<typeof HttpMethodSchema>);

    // --- Token Insertion Helpers ---
    const insertToken = (field: HttpRequestFieldName | `headers.${number}.${'keyTemplate' | 'valueTemplate'}`, token: string, headerIndex?: number) => {
        handleInsertToken(field as Extract<InsertableFieldNames, 'urlTemplate' | 'bodyTemplate' | `headers.${number}.keyTemplate` | `headers.${number}.valueTemplate`>, actionIndex, token, headerIndex);
    };
    // Specific helpers for clarity
    const insertUrlToken = (token: string) => insertToken('urlTemplate', token);
    const insertBodyToken = (token: string) => insertToken('bodyTemplate', token);
    // --- End Token Insertion Helpers ---

    // JSON formatting function
    const formatJSON = () => {
        try {
            // Parse the current value and re-stringify with indentation
            const parsedJSON = JSON.parse(bodyTemplate);
            const formattedJSON = JSON.stringify(parsedJSON, null, 2);
            
            // Update the form with the formatted JSON
            form.setValue(paramFieldName('bodyTemplate'), formattedJSON, { 
                shouldValidate: true,
                shouldDirty: true
            });
            
            toast.success("JSON formatted successfully");
        } catch {
            toast.error("Invalid JSON. Please check your syntax.");
        }
    };

    // Body template error is handled via fieldState in render to respect touch/submit gating

    // Function to check if current body content is valid JSON
    const isValidJSON = React.useMemo(() => {
        if (!bodyTemplate || currentContentType !== 'application/json') return false;
        try {
            JSON.parse(bodyTemplate);
            return true;
        } catch {
            return false;
        }
    }, [bodyTemplate, currentContentType]);

    // Toggle preview mode
    const togglePreview = () => {
        if (!isValidJSON && !showPreview) {
            toast.error("Invalid JSON. Cannot show preview.");
            return;
        }
        setShowPreview(!showPreview);
    };

    return (
        <div className="space-y-4">
            {/* URL + Method Field Row - Standardized Structure Above Controls */}
            <div className="grid grid-cols-[120px,1fr] gap-4 items-start">
                {/* Method Field */}
                <FormField control={form.control} name={paramFieldName('method')} render={({ field }) => (
                    <FormItem>
                        {/* Standard Label */}
                        <FormLabel className="block mb-1.5 text-sm">Method</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                                <SelectTrigger>
                                    {/* Display selected method with color TEXT, no badge */}
                                    {field.value ? (
                                        <span className={cn("font-semibold", getMethodTextColor(field.value))}>{field.value}</span>
                                    ) : (
                                        <SelectValue placeholder="Method" />
                                    )}
                                </SelectTrigger>
                            </FormControl>
                            {/* --- Sort Method Options --- */}
                            <SelectContent>
                                {[...HttpMethodSchema.options].sort().map(method => (
                                    <SelectItem key={method} value={method}>
                                        {/* Method name with color TEXT, no badge */}
                                        <span className={cn("font-semibold", getMethodTextColor(method))}>{method}</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage className="text-xs min-h-[1rem] mt-1"/> {/* Consistent spacing */}
                    </FormItem>
                )} />
                
                {/* URL Field */}
                <FormField control={form.control} name={paramFieldName('urlTemplate')} render={({ field }) => (
                    <FormItem>
                        <FormLabel className="block mb-1.5 text-sm">URL</FormLabel>
                        {/* --- Wrap FormControl and TokenInserter --- */}
                        <div className="flex items-center gap-2">
                            <FormControl>
                                 {/* Input is now direct child */} 
                                <Input 
                                    placeholder="https://your-api.com/endpoint?id={{event.deviceId}}" 
                                    {...field} 
                                    value={field.value ?? ''} 
                                    className="flex-1" 
                                />
                            </FormControl>
                             {/* TokenInserter is now a sibling to FormControl */} 
                            <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={insertUrlToken}/>
                        </div>
                        <FormMessage className="text-xs min-h-[1rem] mt-1"/> 
                    </FormItem>
                )} />
            </div>

            {/* Spacer */}
            <div className="pt-4"></div>

            {/* Headers Section */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-foreground">Headers</h3>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendHeader({ keyTemplate: '', valueTemplate: '' })}
                    >
                        <Plus className="h-4 w-4 mr-1" /> Add Header
                    </Button>
                </div>
                
                <div className="space-y-3 bg-muted/30 rounded-lg p-3">
                    {headerFields.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No headers defined</p>
                    ) : (
                        headerFields.map((headerItem, headerIndex) => (
                            <div key={headerItem.id} className="flex items-center gap-2 bg-background rounded-md p-2">
                                <FormField
                                    control={form.control}
                                    name={headerFieldName(headerIndex, 'keyTemplate')}
                                    render={({ field, fieldState }) => (
                                        <FormItem className="flex-1">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs text-muted-foreground">Key</span>
                                                <TokenInserter 
                                                    tokens={AVAILABLE_AUTOMATION_TOKENS} 
                                                    onInsert={(token) => insertToken(`headers.${headerIndex}.keyTemplate`, token, headerIndex)} 
                                                />
                                            </div>
                                            <FormControl>
                                                <Input 
                                                    placeholder="Header-Name" 
                                                    {...field} 
                                                    value={field.value ?? ''} 
                                                    className={cn("h-8", fieldState.error && 'border-destructive')} 
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={headerFieldName(headerIndex, 'valueTemplate')}
                                    render={({ field, fieldState }) => (
                                        <FormItem className="flex-1">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs text-muted-foreground">Value</span>
                                                <TokenInserter 
                                                    tokens={AVAILABLE_AUTOMATION_TOKENS} 
                                                    onInsert={(token) => insertToken(`headers.${headerIndex}.valueTemplate`, token, headerIndex)} 
                                                />
                                            </div>
                                            <FormControl>
                                                <Input 
                                                    placeholder="Header Value" 
                                                    {...field} 
                                                    value={field.value ?? ''} 
                                                    className={cn("h-8", fieldState.error && 'border-destructive')} 
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="mt-6 text-muted-foreground hover:text-destructive h-8 w-8 shrink-0"
                                    onClick={() => removeHeader(headerIndex)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Remove header</span>
                                </Button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Request Body Section */}
            {showBodyFields && (
                <>
                    {/* Spacer */}
                    <div className="pt-4"></div>
                    
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-foreground">Request Body</h3>
                        
                        <div className="space-y-4 bg-muted/30 rounded-lg p-4">
                            {/* ContentType Field */}
                            <FormField control={form.control} name={paramFieldName('contentType')} render={({ field }) => (
                                 <FormItem>
                                     <FormLabel>Content Type</FormLabel>
                                     <Select onValueChange={field.onChange} value={field.value ?? 'application/json'}>
                                         <FormControl><SelectTrigger><SelectValue placeholder="Select Content Type" /></SelectTrigger></FormControl>
                                         <SelectContent>{[...HttpContentTypeSchema.options].sort().map(type => (<SelectItem key={type} value={type}>{type}</SelectItem>))}</SelectContent>
                                     </Select>
                                     <FormMessage />
                                 </FormItem>
                            )} />

                            {/* Body Template Field */}
                    <FormField control={form.control} name={paramFieldName('bodyTemplate')} render={({ field, fieldState }) => (
                                <FormItem>
                                     <div className="flex items-center justify-between">
                                         <FormLabel>Body Content</FormLabel>
                                         <div className="flex items-center space-x-1">
                                             {currentContentType === 'application/json' && (
                                                 <>
                                                     <Button 
                                                         type="button" 
                                                         variant="outline" 
                                                         size="sm" 
                                                         onClick={formatJSON}
                                                         className="h-7 text-xs"
                                                     >
                                                         <Code className="h-3 w-3" /> Format JSON
                                                     </Button>
                                                     <Button 
                                                         type="button" 
                                                         variant="outline" 
                                                         size="sm" 
                                                         onClick={togglePreview}
                                                         className="h-7 text-xs"
                                                         disabled={!bodyTemplate}
                                                     >
                                                         {showPreview ? (
                                                             <><Edit className="h-3 w-3" /> Edit</>
                                                         ) : (
                                                             <><Eye className="h-3 w-3" /> Preview</>
                                                         )}
                                                     </Button>
                                                 </>
                                             )}
                                             <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={insertBodyToken} />
                                         </div>
                                     </div>
                                     {/* --- Move Conditional Logic Outside FormControl --- */}
                                      {(currentContentType === 'application/json' && showPreview && isValidJSON) ? (
                                         // Render Preview Div *instead* of FormControl
                                         <div className="border rounded-md mt-2"> {/* Added mt-2 for spacing */} 
                                             <SyntaxHighlighter
                                                 language="json"
                                                 style={atomDark}
                                                 customStyle={{
                                                     margin: 0,
                                                     minHeight: '10rem',
                                                     maxHeight: '20rem',
                                                     fontSize: '13px',
                                                     borderRadius: '6px'
                                                 }}
                                             >
                                                 {bodyTemplate}
                                             </SyntaxHighlighter>
                                         </div>
                                      ) : (
                                         // Render FormControl wrapping Textarea
                                         <FormControl>
                                             <Textarea
                                                 placeholder={currentContentType === 'application/json'
                                                     ? '{\n  "key": "value",\n  "event_data": {{event.data | json}}\n}'
                                                     : 'Enter request body...'}
                                                 {...field}
                                                 value={field.value ?? ''}
                                                 rows={6}
                                                  className={cn((fieldState.error && (fieldState.isTouched || form.formState.isSubmitted)) && 'border-destructive')}
                                             />
                                         </FormControl>
                                     )}
                                      <FormMessage>
                                        {fieldState.error && (fieldState.isTouched || form.formState.isSubmitted) ? fieldState.error.message : ''}
                                      </FormMessage>
                                 </FormItem>
                            )} />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
} 