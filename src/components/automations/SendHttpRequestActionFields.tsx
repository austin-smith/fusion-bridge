'use client';

import React, { useState } from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Trash2, Plus, Code, Eye, Edit } from 'lucide-react';
import { TokenInserter } from '@/components/automations/TokenInserter';
import { AVAILABLE_AUTOMATION_TOKENS } from '@/lib/automation-tokens';
import { HttpMethodSchema, HttpContentTypeSchema, SendHttpRequestActionParamsSchema } from '@/lib/automation-schemas';
import type { AutomationFormValues, InsertableFieldNames } from './AutomationForm';
import { get } from 'lodash';
import { toast } from 'sonner';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';

interface SendHttpRequestActionFieldsProps {
    actionIndex: number;
    handleInsertToken: (fieldName: InsertableFieldNames, actionIndex: number, token: string, headerIndex?: number) => void;
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

export function SendHttpRequestActionFields({ actionIndex, handleInsertToken }: SendHttpRequestActionFieldsProps) {
    // Use useFormContext to get form methods and state
    const { control, watch, setValue, formState: { errors } } = useFormContext<AutomationFormValues>();
    const isLoading = false; // Assuming isLoading comes from parent or context if needed, else remove/manage locally
    const [showPreview, setShowPreview] = useState(false);

    // Helper to generate field names scoped to this action index
    const paramFieldName = (field: HttpRequestFieldName) => `config.actions.${actionIndex}.params.${field}` as const;
    const headerFieldName = (headerIndex: number, field: 'keyTemplate' | 'valueTemplate') => `config.actions.${actionIndex}.params.headers.${headerIndex}.${field}` as const;

    // Nested useFieldArray for headers - This is now stable within this component instance
    const { fields: headerFields, append: appendHeader, remove: removeHeader } = useFieldArray({
        control, // Get from context
        name: `config.actions.${actionIndex}.params.headers` as const,
    });

    // Watch relevant fields for conditional rendering
    const currentMethod = watch(paramFieldName('method'));
    const currentContentType = watch(paramFieldName('contentType'));
    const bodyTemplate = watch(paramFieldName('bodyTemplate')) || '';
    const showBodyFields = !!currentMethod && ['POST', 'PUT', 'PATCH'].includes(currentMethod as z.infer<typeof HttpMethodSchema>);

    // --- Token Insertion Helpers ---
    const insertToken = (field: HttpRequestFieldName | `headers.${number}.${'keyTemplate' | 'valueTemplate'}`, token: string, headerIndex?: number) => {
        handleInsertToken(field as InsertableFieldNames, actionIndex, token, headerIndex);
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
            setValue(paramFieldName('bodyTemplate'), formattedJSON, { 
                shouldValidate: true,
                shouldDirty: true
            });
            
            toast.success("JSON formatted successfully");
        } catch {
            toast.error("Invalid JSON. Please check your syntax.");
        }
    };

    // Get potential error message for body template directly using the field name
    const bodyError = get(errors, paramFieldName('bodyTemplate'));
    const bodyErrorMessage = bodyError?.message as string | undefined;

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
        <>
            {/* URL + Method Field Row - Standardized Structure Above Controls */}
            <div className="grid grid-cols-[120px,1fr] gap-4 items-start">
                {/* Method Field */}
                <FormField control={control} name={paramFieldName('method')} render={({ field }) => (
                    <FormItem>
                        {/* Standard Label */}
                        <FormLabel className="block mb-1.5 text-sm">Method</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoading}>
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
                <FormField control={control} name={paramFieldName('urlTemplate')} render={({ field }) => (
                    <FormItem>
                        <FormLabel className="block mb-1.5 text-sm">URL</FormLabel>
                        {/* --- Wrap FormControl and TokenInserter --- */}
                        <div className="flex items-center gap-2">
                            <FormControl>
                                 {/* Input is now direct child */} 
                                <Input 
                                    placeholder="https://your-api.com/endpoint?id={{event.deviceId}}" 
                                    {...field} 
                                    disabled={isLoading} 
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

            {/* Headers Array Field - Simplified UI */}
            <div className="space-y-2 mt-4">
                <div className="flex items-center justify-between">
                    <FormLabel>Headers</FormLabel>
                    <Button type="button" variant="outline" size="sm" onClick={() => appendHeader({ keyTemplate: '', valueTemplate: '' })} disabled={isLoading}>
                        <Plus className="h-3 w-3" /> Add
                    </Button>
                </div>
                
                {headerFields.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No headers defined</p>
                ) : (
                    <div className="space-y-4">
                        {headerFields.map((headerItem, headerIndex) => (
                            <div key={headerItem.id} className="grid grid-cols-[1fr,1fr,auto] gap-2 items-center">
                                {/* Header Key Field */}
                                <FormField control={control} name={headerFieldName(headerIndex, 'keyTemplate')} render={({ field }) => (
                                    <FormItem className="m-0">
                                        <FormControl>
                                            <Input 
                                                placeholder="Header name" 
                                                {...field} 
                                                disabled={isLoading} 
                                                className="h-8" 
                                            />
                                        </FormControl>
                                    </FormItem>
                                )} />
                                
                                {/* Header Value Field */}
                                <FormField control={control} name={headerFieldName(headerIndex, 'valueTemplate')} render={({ field }) => (
                                    <FormItem className="m-0">
                                        <FormControl>
                                            <Input 
                                                placeholder="Value" 
                                                {...field} 
                                                disabled={isLoading} 
                                                className="h-8" 
                                            />
                                        </FormControl>
                                    </FormItem>
                                )} />
                                
                                {/* Remove Header Button */}
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive" 
                                    onClick={() => removeHeader(headerIndex)} 
                                    disabled={isLoading}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Conditional Body + ContentType Fields */}
            {showBodyFields && (
                <>
                    {/* ContentType Field */}
                    <FormField control={control} name={paramFieldName('contentType')} render={({ field }) => (
                         <FormItem>
                             <FormLabel>Content Type</FormLabel>
                             <Select onValueChange={field.onChange} value={field.value ?? 'text/plain'} disabled={isLoading}>
                                 <FormControl><SelectTrigger><SelectValue placeholder="Select Content Type" /></SelectTrigger></FormControl>
                                 <SelectContent>{[...HttpContentTypeSchema.options].sort().map(type => (<SelectItem key={type} value={type}>{type}</SelectItem>))}</SelectContent>
                             </Select>
                             <FormMessage />
                         </FormItem>
                    )} />

                    {/* Body Template Field */}
                    <FormField control={control} name={paramFieldName('bodyTemplate')} render={({ field }) => (
                        <FormItem>
                             <div className="flex items-center justify-between">
                                 <FormLabel>Request Body</FormLabel>
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
                                         disabled={isLoading}
                                         rows={6}
                                         className={bodyErrorMessage ? "border-destructive" : ""}
                                     />
                                 </FormControl>
                             )}
                             <FormMessage>{bodyErrorMessage}</FormMessage>
                         </FormItem>
                    )} />
                </>
            )}
        </>
    );
} 