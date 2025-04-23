'use client';

import React from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray, FormProvider } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus } from 'lucide-react';
import { AutomationConfigSchema } from '@/lib/automation-schemas';
import type { AutomationFormData } from '@/app/settings/automations/[id]/page';
import type { nodes } from '@/data/db/schema';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { MultiSelectOption } from '@/components/ui/multi-select-combobox';
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { useRouter } from 'next/navigation'; // For redirecting after save
import { toast } from 'sonner';
import { cn } from '@/lib/utils'; // Import cn utility

// Import Token Inserter and tokens
import { TokenInserter } from '@/components/automations/TokenInserter';
import { AVAILABLE_AUTOMATION_TOKENS } from '@/lib/automation-tokens';
import type { AutomationAction } from '@/lib/automation-schemas';
import {
    SendHttpRequestActionParamsSchema,
    CreateEventActionParamsSchema,
    CreateBookmarkParamsSchema,
} from '@/lib/automation-schemas';
import { SendHttpRequestActionFields } from './SendHttpRequestActionFields';

// Define the form schema by combining parts we need
const FormSchema = z.object({
    id: z.string(),
    name: z.string().min(1, "Name is required"),
    enabled: z.boolean(),
    sourceNodeId: z.string().uuid("Source connector must be selected"),
    config: AutomationConfigSchema
});

// --- Export Form Values Type ---
export type AutomationFormValues = z.infer<typeof FormSchema>;

// Infer Node type directly if needed, or adjust props
type NodeSelect = typeof nodes.$inferSelect;

interface AutomationFormProps {
    initialData: AutomationFormData;
    availableNodes: Pick<NodeSelect, 'id' | 'name' | 'category'>[]; // Use inferred Node type
    sourceDeviceTypeOptions: MultiSelectOption[]; // Add the new prop
}

// --- Export Action Param Field Names Type ---
export type ActionParamFieldNames =
    | keyof z.infer<typeof CreateEventActionParamsSchema>
    | keyof z.infer<typeof CreateBookmarkParamsSchema>
    | Exclude<keyof z.infer<typeof SendHttpRequestActionParamsSchema>, 'headers'>
    | `headers.${number}.keyTemplate`
    | `headers.${number}.valueTemplate`;

// Define custom styles for FormDescription to reuse throughout the form
const descriptionStyles = "text-xs text-muted-foreground mt-1";
// const messageStyles = "text-xs mt-1"; // No longer needed as we remove FormMessage

export default function AutomationForm({
    initialData,
    availableNodes,
    sourceDeviceTypeOptions // Destructure the new prop
}: AutomationFormProps) {

    const router = useRouter();
    const [isLoading, setIsLoading] = React.useState<boolean>(false);

    // Convert headersTemplate string to headers array if initialData exists
    const initialActions = initialData.configJson?.actions?.map(action => {
        const params = action.params as unknown;
        if (action.type === 'sendHttpRequest' && typeof params === 'object' && params !== null) {
             // Ensure headers array exists and set default contentType if missing
             let headersArray = (params as Record<string, unknown>).headers || [];
             const currentContentType = (params as Record<string, unknown>).contentType || 'text/plain';

             // Convert legacy headersTemplate if present
             if (typeof (params as Record<string, unknown>).headersTemplate === 'string') {
                 headersArray = ((params as Record<string, unknown>).headersTemplate as string).split('\n')
                    .map((line: string) => line.trim())
                    .filter((line: string) => line && line.includes(':'))
                    .map((line: string) => {
                        const [key, ...valueParts] = line.split(':');
                        return { keyTemplate: key.trim(), valueTemplate: valueParts.join(':').trim() };
                    });
             }

            const { /* headersTemplate, */ ...restParams } = params;
            return {
                ...action,
                params: {
                    ...restParams,
                    headers: headersArray,
                    contentType: currentContentType
                }
            };
        }
        return action;
    }) || [];

    const form = useForm<AutomationFormValues>({
        resolver: zodResolver(FormSchema),
        defaultValues: {
            id: initialData.id,
            name: initialData.name || '',
            enabled: initialData.enabled ?? true,
            // Provide empty string default for sourceNodeId to avoid controlled/uncontrolled switch
            sourceNodeId: initialData.sourceNodeId || '',
            config: initialData.configJson ? {
                sourceEntityTypes: initialData.configJson.sourceEntityTypes || [],
                eventTypeFilter: initialData.configJson.eventTypeFilter || '',
                actions: initialActions as AutomationAction[]
            } : {
                sourceEntityTypes: [],
                eventTypeFilter: '',
                actions: []
            }
        },
        mode: 'onTouched', // Validate on blur
    });

    const { fields: actionsFields, append: appendAction, remove: removeAction } = useFieldArray({
        control: form.control,
        name: "config.actions"
    });

    // --- Token Insertion Handler ---
    const handleInsertToken = (
        fieldName: ActionParamFieldNames,
        actionIndex: number,
        token: string,
        headerIndex?: number // Optional index for headers
    ) => {
        let currentFieldName: string;
        // Construct the field name string dynamically based on whether it's a header field
        if ((fieldName as string).startsWith('headers.') && headerIndex !== undefined) {
             const fieldKey = (fieldName as string).substring((`headers.${headerIndex}.`).length);
             if (fieldKey === 'keyTemplate' || fieldKey === 'valueTemplate') {
                currentFieldName = `config.actions.${actionIndex}.params.headers.${headerIndex}.${fieldKey}`;
             } else {
                 console.error("Invalid header field name for token insertion:", fieldName);
                 return;
             }
        } else {
             currentFieldName = `config.actions.${actionIndex}.params.${fieldName as Exclude<ActionParamFieldNames, `headers.${number}.keyTemplate` | `headers.${number}.valueTemplate`>}`;
        }

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const currentValue = form.getValues(currentFieldName as any) || "";
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            form.setValue(currentFieldName as any, currentValue + token, {
                shouldValidate: true,
                shouldDirty: true
            });
        } catch (error) {
            console.error("Error setting field value in handleInsertToken:", error, { currentFieldName });
        }
    };
    // --- End Token Insertion Handler ---

    // --- onSubmit Handler ---
    const onSubmit = async (data: AutomationFormValues) => {
        setIsLoading(true);
        console.log("Submitting form data (raw):", data);

        const processedData = {
            ...data,
            config: {
                ...data.config,
                actions: data.config.actions.map(action => {
                    if (action.type === 'sendHttpRequest' && !['POST', 'PUT', 'PATCH'].includes(action.params.method)) {
                        const { bodyTemplate, contentType, ...restParams } = action.params; // Remove body/contentType
                        return { ...action, params: { ...restParams, bodyTemplate: undefined, contentType: undefined } }; // Ensure they are undefined
                    }
                     // Ensure targetNodeId is not empty string before submitting if required by schema
                    if ((action.type === 'createEvent' || action.type === 'createBookmark') && !action.params.targetNodeId) {
                         console.warn(`Action type ${action.type} requires targetNodeId, but it's empty. This might fail server-side validation if not handled.`);
                         // Optionally set it to undefined if the backend expects that instead of empty string
                         // return { ...action, params: { ...action.params, targetNodeId: undefined } };
                    }
                    return action;
                })
            }
        };
        console.log("Submitting form data (processed):", processedData);

        const isEditing = initialData.id !== 'new';
        const apiUrl = isEditing ? `/api/automations/${initialData.id}` : '/api/automations';
        const httpMethod = isEditing ? 'PUT' : 'POST';
        const successMessage = isEditing ? "Automation updated successfully!" : "Automation created successfully!";
        const errorMessage = isEditing ? "Failed to update automation." : "Failed to create automation.";

        try {
            const response = await fetch(apiUrl, {
                method: httpMethod,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(processedData),
            });

            if (!response.ok) {
                let errorDetails = `API Error: ${response.status} ${response.statusText}`;
                try {
                    const errorJson = await response.json();
                    errorDetails = errorJson.message || errorJson.error || errorDetails;
                } catch { /* Ignore */ }
                console.error(errorMessage, errorDetails);
                throw new Error(errorDetails);
            }

            toast.success(successMessage);
            router.push('/settings/automations'); // Navigate back to list
            router.refresh();

        } catch (error) {
            console.error("Failed to submit form:", error);
            toast.error(`${errorMessage} ${error instanceof Error ? error.message : 'Please try again.'}`);
        } finally {
            setIsLoading(false);
        }
    };
    // --- End onSubmit Handler ---

    const sourceNodes = availableNodes.filter(n => n.category === 'yolink');
    const pikoTargetNodes = availableNodes.filter(n => n.category === 'piko');

    return (
        <FormProvider {...form}>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    {/* General Settings Card */}
                    <Card>
                        <CardHeader><CardTitle>General Settings</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                             <input type="hidden" {...form.register("id")} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField /* Name */
                                    control={form.control}
                                    name="name"
                                    render={({ field, fieldState }) => ( // Destructure fieldState
                                    <FormItem>
                                        <FormLabel>Automation Name</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                disabled={isLoading}
                                                className={cn(fieldState.invalid && 'border-destructive')} // Apply red border if invalid
                                            />
                                        </FormControl>
                                        {/* <FormMessage /> Remove message */}
                                    </FormItem>
                                )} />
                                <FormField /* Enabled */ control={form.control} name="enabled" render={({ field }) => (
                                    // Keep FormMessage for Switch as border doesn't apply well
                                    <FormItem className="flex flex-col pt-2">
                                        <FormLabel className="mb-1.5">Status</FormLabel>
                                        <div className="flex items-center space-x-2">
                                            <FormControl>
                                                <Switch
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                    disabled={isLoading}
                                                    aria-label="Toggle Automation Enabled State"
                                                />
                                            </FormControl>
                                            <span className="text-sm text-muted-foreground">
                                                {field.value ? "Enabled" : "Disabled"}
                                            </span>
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <FormField /* Source Node */
                                    control={form.control}
                                    name="sourceNodeId"
                                    render={({ field, fieldState }) => ( // Destructure fieldState
                                    <FormItem>
                                        <FormLabel>Source Connector (Trigger)</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoading}>
                                            <FormControl>
                                                <SelectTrigger className={cn(fieldState.invalid && 'border-destructive')}> {/* Apply red border to trigger */}
                                                    <SelectValue placeholder="Select Source Connector" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {sourceNodes.map(node => (
                                                    <SelectItem key={node.id} value={node.id}>{node.name} ({node.category})</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {/* <FormMessage /> Remove message */}
                                    </FormItem>
                                )} />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Trigger Configuration Card */}
                    <Card>
                        <CardHeader><CardTitle>Trigger Configuration</CardTitle></CardHeader>
                         <CardContent className="space-y-4">
                            <FormField /* Source Entity Types */
                                control={form.control}
                                name="config.sourceEntityTypes"
                                render={({ field, fieldState }) => ( // Destructure fieldState
                                <FormItem>
                                    <FormLabel>Source Device Types</FormLabel>
                                    <FormControl>
                                        {/* Assuming MultiSelectCombobox passes className down or has its own error state prop */}
                                        {/* If it doesn't visually change, we might need to adjust MultiSelectCombobox itself */}
                                        <MultiSelectCombobox
                                            options={sourceDeviceTypeOptions}
                                            selected={field.value || []}
                                            onChange={field.onChange}
                                            placeholder="Select device types..."
                                            className={cn(fieldState.invalid && 'border border-destructive rounded-md')} // Add border to wrapper
                                        />
                                    </FormControl>
                                    <FormDescription className={descriptionStyles}>
                                        Select which types of devices can trigger this automation.
                                    </FormDescription>
                                    {/* <FormMessage /> Remove message */}
                                </FormItem>
                            )} />
                            <FormField /* Event Type Filter */
                                control={form.control}
                                name="config.eventTypeFilter"
                                render={({ field, fieldState }) => ( // Destructure fieldState
                                <FormItem>
                                    <FormLabel>Event Type Filter (Optional)</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            placeholder="e.g., DoorSensor.Report, LeakSensor.*"
                                            disabled={isLoading}
                                            className={cn(fieldState.invalid && 'border-destructive')} // Apply red border if invalid
                                        />
                                    </FormControl>
                                    <FormDescription className={descriptionStyles}>
                                        Use * as wildcard. Leave blank for all.
                                    </FormDescription>
                                    {/* <FormMessage /> Remove message (optional fields usually don't show required error) */}
                                </FormItem>
                            )} />
                        </CardContent>
                    </Card>

                    {/* Actions Section */}
                    <div>
                        <h2 className="text-xl font-semibold mb-4">Actions</h2>
                        <div className="space-y-4">
                            {actionsFields.map((fieldItem, index) => {
                                const actionType = form.watch(`config.actions.${index}.type`);
                                const paramFieldName = (field: keyof z.infer<typeof CreateEventActionParamsSchema> | keyof z.infer<typeof CreateBookmarkParamsSchema>) => `config.actions.${index}.params.${field}` as const;

                                return (
                                    <Card key={fieldItem.id} className="relative border border-dashed pt-8">
                                        <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 text-muted-foreground hover:text-destructive h-6 w-6" onClick={() => removeAction(index)}><Trash2 className="h-4 w-4" /><span className="sr-only">Remove Action</span></Button>

                                        <CardContent className="space-y-4">
                                            <FormField /* Action Type Select */
                                                control={form.control}
                                                name={`config.actions.${index}.type`}
                                                render={({ field, fieldState }) => ( // Destructure fieldState
                                                    <FormItem>
                                                        <FormLabel>Action Type</FormLabel>
                                                        <Select
                                                            onValueChange={(value) => {
                                                                const newType = value as AutomationAction['type'];
                                                                let newAction: AutomationAction;
                                                                form.clearErrors(`config.actions.${index}`); // Clear previous errors on type change

                                                                if (newType === 'createEvent') {
                                                                    newAction = { type: 'createEvent', params: { sourceTemplate: '', captionTemplate: '', descriptionTemplate: '', targetNodeId: '' } };
                                                                } else if (newType === 'createBookmark') {
                                                                     newAction = { type: 'createBookmark', params: { nameTemplate: '', descriptionTemplate: '', durationMsTemplate: '5000', tagsTemplate: '', targetNodeId: '' } };
                                                                } else if (newType === 'sendHttpRequest') {
                                                                    newAction = { type: 'sendHttpRequest', params: { urlTemplate: '', method: 'GET', headers: [], contentType: 'text/plain', bodyTemplate: '' } };
                                                                } else {
                                                                    console.warn(`Unexpected action type: ${value}. Defaulting.`);
                                                                    newAction = { type: 'createEvent', params: { sourceTemplate: '', captionTemplate: '', descriptionTemplate: '', targetNodeId: '' } };
                                                                }
                                                                form.setValue(`config.actions.${index}`, newAction, { shouldValidate: false, shouldDirty: true, shouldTouch: false });
                                                                field.onChange(newType);
                                                            }}
                                                            defaultValue={field.value}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger className={cn(fieldState.invalid && 'border-destructive')}> {/* Apply red border */}
                                                                    <SelectValue placeholder="Select Action Type" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="createEvent">Create Piko Event</SelectItem>
                                                                <SelectItem value="createBookmark">Create Piko Bookmark</SelectItem>
                                                                <SelectItem value="sendHttpRequest">Send HTTP Request</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        {/* <FormMessage /> Remove message */}
                                                    </FormItem>
                                                )}
                                            />

                                            {(actionType === 'createEvent' || actionType === 'createBookmark') && (
                                                 <FormField /* Target Node ID */
                                                     control={form.control}
                                                     name={paramFieldName('targetNodeId')}
                                                     render={({ field, fieldState }) => ( // Destructure fieldState
                                                     <FormItem>
                                                         <FormLabel>Target Piko Connector</FormLabel>
                                                         <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoading}>
                                                             <FormControl>
                                                                 <SelectTrigger className={cn(fieldState.invalid && 'border-destructive')}> {/* Apply red border */}
                                                                    <SelectValue placeholder="Select Target Piko System" />
                                                                 </SelectTrigger>
                                                             </FormControl>
                                                             <SelectContent>{pikoTargetNodes.map(node => (<SelectItem key={node.id} value={node.id}>{node.name} ({node.category})</SelectItem>))}</SelectContent>
                                                         </Select>
                                                         {/* <FormMessage /> Remove message */}
                                                     </FormItem>
                                                 )} />
                                            )}

                                            <div className="space-y-2 border-l-2 pl-4 ml-1 border-muted">
                                                <h3 className="text-sm font-medium text-muted-foreground mb-2">Parameters for: {actionType === 'createEvent' ? 'Event' : actionType === 'createBookmark' ? 'Bookmark' : actionType === 'sendHttpRequest' ? 'HTTP Request' : 'Action'}</h3>
                                                 <p className="text-xs text-muted-foreground">
                                                     {actionType === 'createBookmark' && "Creates a bookmark on associated Piko cameras."}
                                                     {actionType === 'createEvent' && "Creates a generic event in the target Piko system."}
                                                     {actionType === 'sendHttpRequest' && "Sends a configurable HTTP request."}
                                                 </p>

                                                {actionType === 'createEvent' && (
                                                    <>
                                                         <FormField control={form.control} name={paramFieldName('sourceTemplate')} render={({ field, fieldState }) => (<FormItem><div className="flex items-center justify-between"><FormLabel>Source</FormLabel><TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('sourceTemplate', index, token)} /></div><FormControl><Textarea placeholder="e.g., YoLink Event - {{device.name}}" {...field} disabled={isLoading} className={cn(fieldState.invalid && 'border-destructive')} /></FormControl>{/* <FormMessage /> */}</FormItem>)} />
                                                         <FormField control={form.control} name={paramFieldName('captionTemplate')} render={({ field, fieldState }) => (<FormItem><div className="flex items-center justify-between"><FormLabel>Caption</FormLabel><TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('captionTemplate', index, token)} /></div><FormControl><Textarea placeholder="e.g., {{device.name}} Event: {{event.data.state}} at {{event.time}}" {...field} disabled={isLoading} className={cn(fieldState.invalid && 'border-destructive')} /></FormControl>{/* <FormMessage /> */}</FormItem>)} />
                                                         <FormField control={form.control} name={paramFieldName('descriptionTemplate')} render={({ field, fieldState }) => (<FormItem><div className="flex items-center justify-between"><FormLabel>Description</FormLabel><TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('descriptionTemplate', index, token)} /></div><FormControl><Textarea placeholder="Device: {{event.deviceId}} Type: {{event.event}} State: {{event.data.state}}" {...field} disabled={isLoading} className={cn(fieldState.invalid && 'border-destructive')} /></FormControl>{/* <FormMessage /> */}</FormItem>)} />
                                                    </>
                                                )}
                                                {actionType === 'createBookmark' && (
                                                    <>
                                                        <FormField control={form.control} name={paramFieldName('nameTemplate')} render={({ field, fieldState }) => (<FormItem><div className="flex items-center justify-between"><FormLabel>Name</FormLabel><TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('nameTemplate', index, token)}/></div><FormControl><Input placeholder="e.g., Alert: {{device.name}}" {...field} disabled={isLoading} className={cn(fieldState.invalid && 'border-destructive')} /></FormControl>{/* <FormMessage /> */}</FormItem>)} />
                                                        <FormField control={form.control} name={paramFieldName('descriptionTemplate')} render={({ field, fieldState }) => (<FormItem><div className="flex items-center justify-between"><FormLabel>Description</FormLabel><TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('descriptionTemplate', index, token)}/></div><FormControl><Textarea placeholder="e.g., Device: {{device.name}} triggered event {{event.event}}" {...field} disabled={isLoading} className={cn(fieldState.invalid && 'border-destructive')} /></FormControl>{/* <FormMessage /> Optional field */}</FormItem>)} />
                                                        <FormField control={form.control} name={paramFieldName('durationMsTemplate')} render={({ field, fieldState }) => (<FormItem><div className="flex items-center justify-between"><FormLabel>Duration (ms)</FormLabel><TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('durationMsTemplate', index, token)}/></div><FormControl><Input placeholder="e.g., 5000" {...field} disabled={isLoading} className={cn(fieldState.invalid && 'border-destructive')} /></FormControl><FormDescription className={descriptionStyles}>Duration in milliseconds.</FormDescription>{/* <FormMessage /> */}</FormItem>)} />
                                                        <FormField control={form.control} name={paramFieldName('tagsTemplate')} render={({ field, fieldState }) => (<FormItem><div className="flex items-center justify-between"><FormLabel>Tags</FormLabel><TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('tagsTemplate', index, token)}/></div><FormControl><Input placeholder="e.g., Alert,{{device.type}},Automation" {...field} disabled={isLoading} className={cn(fieldState.invalid && 'border-destructive')} /></FormControl><FormDescription className={descriptionStyles}>Comma-separated tags.</FormDescription>{/* <FormMessage /> Optional field */}</FormItem>)} />
                                                    </>
                                                )}

                                                {actionType === 'sendHttpRequest' && (
                                                    // Pass cn and fieldState down to SendHttpRequestActionFields if it needs to apply borders internally
                                                    // Or modify SendHttpRequestActionFields to accept fieldState mapping
                                                    <SendHttpRequestActionFields
                                                        actionIndex={index}
                                                        handleInsertToken={handleInsertToken}
                                                        // We need to adjust SendHttpRequestActionFields to accept/use fieldState
                                                        // For now, the border might not apply to fields within it
                                                    />
                                                )}

                                                {!['createEvent', 'createBookmark', 'sendHttpRequest'].includes(actionType || '') && (
                                                    <p className="text-sm text-muted-foreground">Select an action type to configure its parameters.</p>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => appendAction({ type: 'createEvent', params: { sourceTemplate: '', captionTemplate: '', descriptionTemplate: '', targetNodeId: '' } })} disabled={isLoading}>
                            <Plus className="h-4 w-4" /> Add Action
                        </Button>
                    </div>

                    {/* Submit Button */}
                    <div className="flex justify-end space-x-2">
                         <Button type="submit" disabled={isLoading}>
                             {isLoading ? 'Saving...' : (initialData.id === 'new' ? 'Create Automation' : 'Save Changes')}
                         </Button>
                    </div>
                </form>
            </Form>
        </FormProvider>
    );
} 