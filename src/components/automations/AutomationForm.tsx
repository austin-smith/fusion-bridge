'use client';

import React from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray, FormProvider, Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus } from 'lucide-react';
import { 
    AutomationConfigSchema, 
    type AutomationConfig, 
    type AutomationAction,
    type SecondaryCondition,
    CreateEventActionParamsSchema,
    CreateBookmarkParamsSchema,
    SendHttpRequestActionParamsSchema,
} from '@/lib/automation-schemas';
import { EventType, EVENT_TYPE_DISPLAY_MAP, EventSubtype, EVENT_SUBTYPE_DISPLAY_MAP } from '@/lib/mappings/definitions';
import type { connectors } from '@/data/db/schema';
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
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import { TokenInserter } from '@/components/automations/TokenInserter';
import { AVAILABLE_AUTOMATION_TOKENS } from '@/lib/automation-tokens';
import { SendHttpRequestActionFields } from './SendHttpRequestActionFields';

interface AutomationFormData {
    id: string;
    name: string;
    enabled: boolean;
    configJson: AutomationConfig;
    createdAt: Date;
    updatedAt: Date;
}

const FormSchema = z.object({
    id: z.string(),
    name: z.string().min(1, "Name is required"),
    enabled: z.boolean(),
    config: AutomationConfigSchema
});

export type AutomationFormValues = z.infer<typeof FormSchema>;

type ConnectorSelect = typeof connectors.$inferSelect;

interface AutomationFormProps {
    initialData: AutomationFormData;
    availableConnectors: Pick<ConnectorSelect, 'id' | 'name' | 'category'>[];
    sourceDeviceTypeOptions: MultiSelectOption[];
}

export type InsertableFieldNames = 
    | keyof z.infer<typeof CreateEventActionParamsSchema>
    | keyof z.infer<typeof CreateBookmarkParamsSchema>
    | Exclude<keyof z.infer<typeof SendHttpRequestActionParamsSchema>, 'headers'>
    | `headers.${number}.keyTemplate`
    | `headers.${number}.valueTemplate`;

const descriptionStyles = "text-xs text-muted-foreground mt-1";

const generateEventTypeOptions = (): MultiSelectOption[] => {
  const options: MultiSelectOption[] = [];
  for (const [typeKey, typeDisplay] of Object.entries(EVENT_TYPE_DISPLAY_MAP)) {
    // Add the general type option (matches any subtype)
    options.push({ value: typeKey, label: `${typeDisplay} (Any Subtype)` });

    // Find relevant subtypes for this type
    // This requires some logic based on definitions.ts structure or convention
    // Example: Check if subtypes exist for this type based on naming or a map
    // For now, let's manually define relationships based on current enums
    let relevantSubtypes: EventSubtype[] = [];
    if (typeKey === EventType.ACCESS_DENIED) {
        relevantSubtypes = [EventSubtype.ANTIPASSBACK_VIOLATION, EventSubtype.DOOR_LOCKED, EventSubtype.DURESS_PIN, EventSubtype.EXPIRED_CREDENTIAL, EventSubtype.INVALID_CREDENTIAL, EventSubtype.NOT_IN_SCHEDULE, EventSubtype.OCCUPANCY_LIMIT, EventSubtype.PIN_REQUIRED];
    } else if (typeKey === EventType.ACCESS_GRANTED) {
        relevantSubtypes = [EventSubtype.NORMAL, EventSubtype.REMOTE_OVERRIDE, EventSubtype.PASSBACK_RETURN];
    } else if (typeKey === EventType.EXIT_REQUEST) {
        relevantSubtypes = [EventSubtype.PRESSED, EventSubtype.HELD, EventSubtype.MOTION];
    } else if (typeKey === EventType.OBJECT_DETECTED) {
        relevantSubtypes = [EventSubtype.PERSON, EventSubtype.VEHICLE];
    }
    // Add other type-to-subtype mappings here if needed

    // Add specific subtype options
    for (const subtypeKey of relevantSubtypes) {
      const subtypeDisplay = EVENT_SUBTYPE_DISPLAY_MAP[subtypeKey];
      if (subtypeDisplay) {
        // Use a separator (e.g., '.') to combine type and subtype in the value
        options.push({ value: `${typeKey}.${subtypeKey}`, label: `${typeDisplay}: ${subtypeDisplay}` });
      }
    }
  }
  // Sort options alphabetically by label for better UX
  options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
};

const eventTypeOptions = generateEventTypeOptions();

const defaultSecondaryCondition: Omit<SecondaryCondition, 'id'> = {
    type: 'eventOccurred',
    entityTypeFilter: [],
    eventTypeFilter: [],
    timeWindowSecondsBefore: 60,
    timeWindowSecondsAfter: 60,
};

const defaultAction: AutomationAction = {
    type: 'createEvent', 
    params: { sourceTemplate: '', captionTemplate: '', descriptionTemplate: '', targetConnectorId: '' }
};

export default function AutomationForm({
    initialData,
    availableConnectors,
    sourceDeviceTypeOptions
}: AutomationFormProps) {

    const router = useRouter();
    const [isLoading, setIsLoading] = React.useState<boolean>(false);

    const massageInitialData = (data: AutomationFormData): AutomationFormValues => {
        const config = data.configJson;
        
        const ensureArrayEventTypeFilter = (filter: string | string[] | undefined | null): string[] => {
            if (Array.isArray(filter)) {
                return filter;
            }
            if (typeof filter === 'string' && filter.trim() !== '') {
                return [filter.trim()];
            }
            return [];
        };
        
        const initialActions = config.actions?.map((action: AutomationAction) => {
            const params = action.params as any;
            if ((action.type === 'createEvent' || action.type === 'createBookmark') && params) {
                const targetConnectorIdValue = params.targetConnectorId ?? '';
                const { targetConnectorId, ...restParams } = params;
                return { ...action, params: { ...restParams, targetConnectorId: targetConnectorIdValue } };
            }
            if (action.type === 'sendHttpRequest' && typeof params === 'object' && params !== null) {
                 let headersArray = params.headers || [];
                 const currentContentType = params.contentType || 'text/plain';
                 if (typeof params.headersTemplate === 'string') {
                     headersArray = params.headersTemplate.split('\n')
                        .map((line: string) => line.trim()).filter((line: string) => line && line.includes(':')).map((line: string) => {
                            const [key, ...valueParts] = line.split(':');
                            return { keyTemplate: key.trim(), valueTemplate: valueParts.join(':').trim() };
                        });
                 }
                const { headersTemplate, ...restParamsHttp } = params;
                return { ...action, params: { ...restParamsHttp, headers: headersArray, contentType: currentContentType } };
            }
            return action;
        }) || [];

        return {
            id: data.id,
            name: data.name,
            enabled: data.enabled,
            config: {
                primaryTrigger: {
                    ...config.primaryTrigger,
                    sourceEntityTypes: config.primaryTrigger?.sourceEntityTypes ?? [],
                    eventTypeFilter: ensureArrayEventTypeFilter(config.primaryTrigger?.eventTypeFilter),
                },
                secondaryConditions: (config.secondaryConditions ?? []).map(cond => ({
                    id: cond.id ?? crypto.randomUUID(), 
                    type: cond.type ?? 'eventOccurred',
                    entityTypeFilter: cond.entityTypeFilter ?? [],
                    eventTypeFilter: ensureArrayEventTypeFilter(cond.eventTypeFilter),
                    timeWindowSecondsBefore: cond.timeWindowSecondsBefore ?? 60,
                    timeWindowSecondsAfter: cond.timeWindowSecondsAfter ?? 60,
                })),
                actions: initialActions as AutomationAction[]
            }
        };
    };

    const form = useForm<AutomationFormValues>({
        resolver: zodResolver(FormSchema),
        defaultValues: massageInitialData(initialData),
        mode: 'onTouched',
    });

    const { fields: actionsFields, append: appendAction, remove: removeAction } = useFieldArray({
        control: form.control,
        name: "config.actions"
    });

    const { fields: conditionsFields, append: appendCondition, remove: removeCondition } = useFieldArray({
        control: form.control,
        name: "config.secondaryConditions"
    });

    const handleInsertToken = (
        fieldName: InsertableFieldNames,
        index: number,
        token: string,
        context: 'action' | 'condition',
        headerIndex?: number
    ) => {
        let currentFieldName: string;
        if (context === 'action') {
            if ((fieldName as string).startsWith('headers.') && headerIndex !== undefined) {
                 const fieldKey = (fieldName as string).substring((`headers.${headerIndex}.`).length);
                 if (fieldKey === 'keyTemplate' || fieldKey === 'valueTemplate') {
                    currentFieldName = `config.actions.${index}.params.headers.${headerIndex}.${fieldKey}`;
                 } else { 
                    console.error("Invalid action header field name:", fieldName); 
                    return; 
                }
            } else { 
                 currentFieldName = `config.actions.${index}.params.${fieldName as Exclude<InsertableFieldNames, `headers.${number}.keyTemplate` | `headers.${number}.valueTemplate`>}`;
             }
        } else if (context === 'condition') {
            console.warn("Token insertion for conditions not fully implemented yet.");
            return;
        } else {
             console.error("Invalid context for token insertion:", context);
             return;
        }

        try {
            const currentValue = form.getValues(currentFieldName as any) || "";
            form.setValue(currentFieldName as any, currentValue + token, { shouldValidate: true, shouldDirty: true });
        } catch (error) { console.error("Error setting field value:", error, { currentFieldName }); }
    };

    const onSubmit = async (data: AutomationFormValues) => {
        setIsLoading(true);
        console.log("Submitting form data (raw validated):", data);
        
        const processedData = { 
            ...data, 
            config: { 
                ...data.config, 
                primaryTrigger: {
                    ...data.config.primaryTrigger,
                    eventTypeFilter: data.config.primaryTrigger.eventTypeFilter ?? [],
                },
                actions: data.config.actions.map((action: AutomationAction) => {
                    if (action.type === 'sendHttpRequest' && !['POST', 'PUT', 'PATCH'].includes(action.params.method)) {
                        const { bodyTemplate, contentType, ...restParams } = action.params;
                        return { ...action, params: { ...restParams, bodyTemplate: undefined, contentType: undefined } };
                    }
                    if ((action.type === 'createEvent' || action.type === 'createBookmark') && !action.params.targetConnectorId) {
                         console.warn(`Action type ${action.type} requires targetConnectorId, but it's empty.`);
                    }
                    return action;
                }),
                secondaryConditions: data.config.secondaryConditions?.map(cond => {
                    return {
                        ...cond,
                        timeWindowSecondsBefore: cond.timeWindowSecondsBefore ? Number(cond.timeWindowSecondsBefore) : undefined,
                        timeWindowSecondsAfter: cond.timeWindowSecondsAfter ? Number(cond.timeWindowSecondsAfter) : undefined,
                    }
                })
            }
        };
        
        console.log("Submitting form data (processed for API):", processedData);
        
        const isEditing = initialData.id !== 'new';
        const apiUrl = isEditing ? `/api/automations/${initialData.id}` : '/api/automations';
        const httpMethod = isEditing ? 'PUT' : 'POST';
        const successMessage = isEditing ? "Automation updated!" : "Automation created!";
        const errorMessage = isEditing ? "Failed to update automation." : "Failed to create automation.";
        
        try {
            const response = await fetch(apiUrl, { 
                method: httpMethod, 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(processedData) 
            });
            if (!response.ok) {
                let errorDetails = `API Error: ${response.status} ${response.statusText}`;
                try { const errorJson = await response.json(); errorDetails = errorJson.message || errorJson.error || errorDetails; } catch { /* Ignore */ }
                console.error(errorMessage, errorDetails);
                throw new Error(errorDetails);
            }
            toast.success(successMessage);
            router.push('/settings/automations');
            router.refresh();
        } catch (error) {
            console.error("Failed to submit form:", error);
            toast.error(`${errorMessage} ${error instanceof Error ? error.message : 'Please try again.'}`);
        } finally { setIsLoading(false); }
    };

    const pikoTargetConnectors = availableConnectors.filter(c => c.category === 'piko');

    return (
        <FormProvider {...form}>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader><CardTitle>General Settings</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                             <input type="hidden" {...form.register("id")} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField 
                                    control={form.control}
                                    name="name"
                                    render={({ field, fieldState }) => (
                                    <FormItem>
                                        <FormLabel>Automation Name</FormLabel>
                                        <FormControl><Input {...field} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <FormField control={form.control} name="enabled" render={({ field }) => (
                                    <FormItem className="flex flex-col pt-2">
                                        <FormLabel className="mb-1.5">Status</FormLabel>
                                        <div className="flex items-center space-x-2">
                                            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isLoading} aria-label="Toggle Automation Enabled State" /></FormControl>
                                            <span className="text-sm text-muted-foreground">{field.value ? "Enabled" : "Disabled"}</span>
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>Trigger (If This Happens...)</CardTitle></CardHeader>
                         <CardContent className="space-y-4">
                             <FormField
                                control={form.control}
                                name="config.primaryTrigger.sourceEntityTypes"
                                render={({ field, fieldState }) => (
                                <FormItem>
                                    <FormLabel>Triggering Device Types</FormLabel>
                                    <FormControl>
                                        <MultiSelectCombobox
                                            options={sourceDeviceTypeOptions}
                                            selected={field.value || []}
                                            onChange={field.onChange}
                                            placeholder="Select device types..."
                                            className={cn(fieldState.error && 'border border-destructive rounded-md')}
                                        />
                                    </FormControl>
                                    <FormDescription className={descriptionStyles}>Select the standardized device types that can trigger this automation.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField
                                control={form.control}
                                name="config.primaryTrigger.eventTypeFilter"
                                render={({ field, fieldState }) => (
                                <FormItem>
                                    <FormLabel>Triggering Event Types (Optional)</FormLabel>
                                    <FormControl>
                                        <MultiSelectCombobox
                                            options={eventTypeOptions}
                                            selected={field.value || []}
                                            onChange={field.onChange}
                                            placeholder="Select event types (optional)..."
                                            className={cn(fieldState.error && 'border border-destructive rounded-md')}
                                        />
                                    </FormControl>
                                    <FormDescription className={descriptionStyles}>Select the specific standardized event types to trigger this automation. Leave blank for any.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </CardContent>
                    </Card>

                    <div>
                        <h2 className="text-xl font-semibold mb-2">Conditions (And If...)</h2>
                        <p className="text-sm text-muted-foreground mb-4">Add optional conditions based on events happening near the primary trigger time.</p>
                        <div className="space-y-4">
                            {conditionsFields.map((fieldItem, index) => (
                                <Card key={fieldItem.id} className="relative border border-blue-200 dark:border-blue-800 pt-8 bg-blue-50/30 dark:bg-blue-950/20">
                                    <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 text-muted-foreground hover:text-destructive h-6 w-6" onClick={() => removeCondition(index)}><Trash2 className="h-4 w-4" /><span className="sr-only">Remove Condition</span></Button>
                                    <CardContent className="space-y-4">
                                        <FormField
                                            control={form.control}
                                            name={`config.secondaryConditions.${index}.type`}
                                            render={({ field, fieldState }) => (
                                                <FormItem>
                                                    <FormLabel>Condition Type</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl><SelectTrigger className={cn(fieldState.error && 'border-destructive')}><SelectValue /></SelectTrigger></FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="eventOccurred">Event Occurred Within Window</SelectItem>
                                                            <SelectItem value="noEventOccurred">NO Event Occurred Within Window</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name={`config.secondaryConditions.${index}.entityTypeFilter`}
                                            render={({ field, fieldState }) => (
                                            <FormItem>
                                                <FormLabel>Device Types Filter (Optional)</FormLabel>
                                                <FormControl>
                                                    <MultiSelectCombobox
                                                        options={sourceDeviceTypeOptions}
                                                        selected={field.value || []}
                                                        onChange={field.onChange}
                                                        placeholder="Any"
                                                        className={cn(fieldState.error && 'border border-destructive rounded-md')}
                                                    />
                                                </FormControl>
                                                 <FormDescription className={descriptionStyles}>Filter condition by standardized device types. Leave blank for any type.</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField
                                            control={form.control}
                                            name={`config.secondaryConditions.${index}.eventTypeFilter`}
                                            render={({ field, fieldState }) => (
                                            <FormItem>
                                                <FormLabel>Event Type Filter (Optional)</FormLabel>
                                                <FormControl>
                                                    <MultiSelectCombobox
                                                        options={eventTypeOptions}
                                                        selected={field.value || []}
                                                        onChange={field.onChange}
                                                        placeholder="Select event types (optional)..."
                                                        className={cn(fieldState.error && 'border border-destructive rounded-md')}
                                                    />
                                                </FormControl>
                                                <FormDescription className={descriptionStyles}>Filter condition events by these standardized types. Leave blank for any.</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                            <FormField
                                                control={form.control}
                                                name={`config.secondaryConditions.${index}.timeWindowSecondsBefore`}
                                                render={({ field, fieldState }) => (
                                                    <FormItem>
                                                        <FormLabel>Seconds Before Trigger</FormLabel>
                                                        <FormControl>
                                                            <Input 
                                                                type="number" 
                                                                min="0" 
                                                                step="1" 
                                                                placeholder="e.g., 120" 
                                                                disabled={isLoading} 
                                                                className={cn(fieldState.error && 'border-destructive')}
                                                                value={field.value === undefined || field.value === null ? '' : String(field.value)} 
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    field.onChange(val === '' ? undefined : Number(val));
                                                                }}
                                                                name={field.name}
                                                                onBlur={field.onBlur}
                                                                ref={field.ref}
                                                            />
                                                        </FormControl>
                                                        <FormDescription className={descriptionStyles}>Check for events up to this many seconds before the trigger.</FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`config.secondaryConditions.${index}.timeWindowSecondsAfter`}
                                                render={({ field, fieldState }) => (
                                                    <FormItem>
                                                        <FormLabel>Seconds After Trigger</FormLabel>
                                                         <FormControl>
                                                            <Input 
                                                                type="number" 
                                                                min="0" 
                                                                step="1" 
                                                                placeholder="e.g., 120" 
                                                                disabled={isLoading} 
                                                                className={cn(fieldState.error && 'border-destructive')}
                                                                value={field.value === undefined || field.value === null ? '' : String(field.value)} 
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    field.onChange(val === '' ? undefined : Number(val));
                                                                }}
                                                                name={field.name}
                                                                onBlur={field.onBlur}
                                                                ref={field.ref}
                                                            />
                                                        </FormControl>
                                                         <FormDescription className={descriptionStyles}>Check for events up to this many seconds after the trigger.</FormDescription>
                                                         <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                        <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            className="mt-4"
                            onClick={() => appendCondition({ id: crypto.randomUUID(), ...defaultSecondaryCondition })} 
                            disabled={isLoading}
                        >
                            <Plus className="mr-2 h-4 w-4" /> Add Condition
                        </Button>
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold mb-4">Actions (Then Do This...)</h2>
                        <div className="space-y-4">
                            {actionsFields.map((fieldItem, index) => {
                                const actionType = form.watch(`config.actions.${index}.type`);

                                return (
                                    <Card key={fieldItem.id} className="relative border border-dashed pt-8">
                                        <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 text-muted-foreground hover:text-destructive h-6 w-6" onClick={() => removeAction(index)}><Trash2 className="h-4 w-4" /><span className="sr-only">Remove Action</span></Button>
                                        <CardContent className="space-y-4">
                                            <FormField 
                                                control={form.control}
                                                name={`config.actions.${index}.type`}
                                                render={({ field, fieldState }) => (
                                                    <FormItem>
                                                        <FormLabel>Action Type</FormLabel>
                                                        <Select
                                                            onValueChange={(value) => {
                                                                const newType = value as AutomationAction['type'];
                                                                let newAction: AutomationAction = defaultAction;
                                                                form.clearErrors(`config.actions.${index}`);
                                                                if (newType === 'createEvent') { 
                                                                    newAction = { type: 'createEvent', params: { sourceTemplate: '', captionTemplate: '', descriptionTemplate: '', targetConnectorId: '' } };
                                                                } else if (newType === 'createBookmark') { 
                                                                    newAction = { type: 'createBookmark', params: { nameTemplate: '', descriptionTemplate: '', durationMsTemplate: '5000', tagsTemplate: '', targetConnectorId: '' } };
                                                                } else if (newType === 'sendHttpRequest') { 
                                                                    newAction = { type: 'sendHttpRequest', params: { urlTemplate: '', method: 'GET', headers: [], contentType: 'text/plain', bodyTemplate: '' } };
                                                                } else { 
                                                                    console.warn(`Unexpected action type: ${value}.`); 
                                                                }
                                                                form.setValue(`config.actions.${index}`, newAction, { shouldValidate: false, shouldDirty: true });
                                                                field.onChange(newType);
                                                            }}
                                                            value={field.value}
                                                        >
                                                            <FormControl><SelectTrigger className={cn(fieldState.error && 'border-destructive')}><SelectValue placeholder="Select Action Type" /></SelectTrigger></FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="createEvent">Create Piko Event</SelectItem>
                                                                <SelectItem value="createBookmark">Create Piko Bookmark</SelectItem>
                                                                <SelectItem value="sendHttpRequest">Send HTTP Request</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            {(actionType === 'createEvent' || actionType === 'createBookmark') && (
                                                 <FormField
                                                     control={form.control}
                                                     name={`config.actions.${index}.params.targetConnectorId`}
                                                     render={({ field, fieldState }) => (
                                                     <FormItem>
                                                         <FormLabel>Target Connector</FormLabel>
                                                         <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                                                             <FormControl>
                                                                 <SelectTrigger className={cn(fieldState.error && 'border-destructive')}>
                                                                    <SelectValue placeholder="Select Target Connector" />
                                                                 </SelectTrigger>
                                                             </FormControl>
                                                             <SelectContent>{pikoTargetConnectors.map(connector => (<SelectItem key={connector.id} value={connector.id}>{connector.name} ({connector.category})</SelectItem>))}</SelectContent>
                                                         </Select>
                                                         <FormMessage />
                                                     </FormItem>
                                                 )} />
                                            )}

                                            <div className="space-y-2 border-l-2 pl-4 ml-1 border-muted">
                                                <h3 className="text-sm font-medium text-muted-foreground mb-2">Action Parameters</h3>
                                                 <p className="text-xs text-muted-foreground">
                                                     {actionType === 'createBookmark' && "Creates a bookmark on related Piko cameras."}
                                                     {actionType === 'createEvent' && "Creates an event in the target Piko system."}
                                                     {actionType === 'sendHttpRequest' && "Sends an HTTP request."}
                                                 </p>
                                                {actionType === 'createEvent' && (
                                                    <>
                                                         <FormField control={form.control} name={`config.actions.${index}.params.sourceTemplate`} render={({ field, fieldState }) => (<FormItem><div className="flex items-center justify-between"><FormLabel>Source</FormLabel><TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('sourceTemplate', index, token, 'action')} /></div><FormControl><Textarea placeholder="e.g., YoLink Event - {{device.name}}" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl><FormMessage /></FormItem>)} />
                                                         <FormField control={form.control} name={`config.actions.${index}.params.captionTemplate`} render={({ field, fieldState }) => (<FormItem><div className="flex items-center justify-between"><FormLabel>Caption</FormLabel><TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('captionTemplate', index, token, 'action')} /></div><FormControl><Textarea placeholder="e.g., {{device.name}} Event: {{event.data.state}} at {{event.time}}" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl><FormMessage /></FormItem>)} />
                                                         <FormField control={form.control} name={`config.actions.${index}.params.descriptionTemplate`} render={({ field, fieldState }) => (<FormItem><div className="flex items-center justify-between"><FormLabel>Description</FormLabel><TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('descriptionTemplate', index, token, 'action')} /></div><FormControl><Textarea placeholder="Device: {{event.deviceId}} Type: {{event.event}} State: {{event.data.state}}" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl><FormMessage /></FormItem>)} />
                                                    </>
                                                )}
                                                {actionType === 'createBookmark' && (
                                                    <>
                                                        <FormField control={form.control} name={`config.actions.${index}.params.nameTemplate`} render={({ field, fieldState }) => (<FormItem><div className="flex items-center justify-between"><FormLabel>Name</FormLabel><TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('nameTemplate', index, token, 'action')}/></div><FormControl><Input placeholder="e.g., Alert: {{device.name}}" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl><FormMessage /></FormItem>)} />
                                                        <FormField control={form.control} name={`config.actions.${index}.params.descriptionTemplate`} render={({ field, fieldState }) => (<FormItem><div className="flex items-center justify-between"><FormLabel>Description</FormLabel><TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('descriptionTemplate', index, token, 'action')}/></div><FormControl><Textarea placeholder="e.g., Device: {{device.name}} triggered event {{event.event}}" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl><FormMessage /></FormItem>)} />
                                                        <FormField control={form.control} name={`config.actions.${index}.params.durationMsTemplate`} render={({ field, fieldState }) => (<FormItem><div className="flex items-center justify-between"><FormLabel>Duration (milliseconds)</FormLabel><TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('durationMsTemplate', index, token, 'action')}/></div><FormControl><Input placeholder="e.g., 5000" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl><FormDescription className={descriptionStyles}>Duration in milliseconds.</FormDescription><FormMessage /></FormItem>)} />
                                                        <FormField control={form.control} name={`config.actions.${index}.params.tagsTemplate`} render={({ field, fieldState }) => (<FormItem><div className="flex items-center justify-between"><FormLabel>Tags</FormLabel><TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('tagsTemplate', index, token, 'action')}/></div><FormControl><Input placeholder="e.g., Alert,{{device.type}},Automation" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl><FormDescription className={descriptionStyles}>Enter tags separated by commas.</FormDescription><FormMessage /></FormItem>)} />
                                                    </>
                                                )}
                                                {actionType === 'sendHttpRequest' && (
                                                    <SendHttpRequestActionFields 
                                                        actionIndex={index} 
                                                        handleInsertToken={(
                                                            fieldName: InsertableFieldNames,
                                                            actIndex: number,
                                                            token: string, 
                                                            headerIndex?: number
                                                        ) => {
                                                            handleInsertToken(fieldName, index, token, 'action', headerIndex);
                                                        }} 
                                                    />
                                                )}
                                                {!['createEvent', 'createBookmark', 'sendHttpRequest'].includes(actionType || '') && (
                                                    <p className="text-sm text-muted-foreground">Select an action type.</p>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                        <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            className="mt-4" 
                            onClick={() => appendAction(defaultAction)} 
                            disabled={isLoading}
                        >
                            <Plus className="mr-2 h-4 w-4" /> Add Action
                        </Button>
                    </div>

                    <div className="flex justify-end space-x-2 mt-8">
                         <Button type="submit" disabled={isLoading || !form.formState.isDirty || !form.formState.isValid}>
                             {isLoading ? 'Saving...' : (initialData.id === 'new' ? 'Create Automation' : 'Save Changes')}
                         </Button>
                    </div>
                </form>
            </Form>
        </FormProvider>
    );
} 