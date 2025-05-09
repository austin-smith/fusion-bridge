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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trash2, Plus } from 'lucide-react';
import {
    AutomationConfigSchema,
    type AutomationConfig,
    type AutomationAction,
    CreateEventActionParamsSchema,
    CreateBookmarkParamsSchema,
    SendHttpRequestActionParamsSchema,
    type JsonRuleGroup,
    type TemporalCondition,
    JsonRuleGroupSchema,
    SetDeviceStateActionParamsSchema,
} from '@/lib/automation-schemas';
import { EventType, EVENT_TYPE_DISPLAY_MAP, EventSubtype, EVENT_SUBTYPE_DISPLAY_MAP, ActionableState } from '@/lib/mappings/definitions';
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
import { RuleBuilder } from './RuleBuilder';
import { getIconComponentByName } from '@/lib/mappings/presentation';
import { HelpCircle } from 'lucide-react';

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
    name: z.string().min(1),
    enabled: z.boolean(),
    config: AutomationConfigSchema
});

export type AutomationFormValues = z.infer<typeof FormSchema>;

type ConnectorSelect = typeof connectors.$inferSelect;

interface AutomationFormProps {
    initialData: AutomationFormData;
    availableConnectors: Pick<ConnectorSelect, 'id' | 'name' | 'category'>[];
    sourceDeviceTypeOptions: MultiSelectOption[];
    availableTargetDevices: Array<{ id: string; name: string; displayType: string; iconName: string; }>;
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
    options.push({ value: typeKey, label: `${typeDisplay} (Any Subtype)` });
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
    for (const subtypeKey of relevantSubtypes) {
      const subtypeDisplay = EVENT_SUBTYPE_DISPLAY_MAP[subtypeKey];
      if (subtypeDisplay) {
        options.push({ value: `${typeKey}.${subtypeKey}`, label: `${typeDisplay}: ${subtypeDisplay}` });
      }
    }
  }
  options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
};

const eventTypeOptions = generateEventTypeOptions();

const defaultRuleGroup: JsonRuleGroup = { any: [] };

const defaultEventFilterRuleGroup: JsonRuleGroup = { all: [] };

const defaultTemporalCondition: Omit<TemporalCondition, 'id'> = {
    type: 'eventOccurred',
    scoping: 'anywhere',
    eventFilter: defaultEventFilterRuleGroup,
    timeWindowSecondsBefore: 60,
    timeWindowSecondsAfter: 60,
};

const ACTIONABLE_STATE_DISPLAY_MAP: Record<ActionableState, string> = {
    [ActionableState.SET_ON]: "Turn On",
    [ActionableState.SET_OFF]: "Turn Off",
};

const defaultAction: AutomationAction = {
    type: 'createEvent', 
    params: { sourceTemplate: '', captionTemplate: '', descriptionTemplate: '', targetConnectorId: '' }
};

export default function AutomationForm({
    initialData,
    availableConnectors,
    sourceDeviceTypeOptions,
    availableTargetDevices = []
}: AutomationFormProps) {

    const router = useRouter();
    const [isLoading, setIsLoading] = React.useState<boolean>(false);

    const massageInitialData = (data: AutomationFormData): AutomationFormValues => {
        const config = data.configJson;
        
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

        const initialTemporalConditions = (config?.temporalConditions ?? []).map(cond => ({
            id: cond.id ?? crypto.randomUUID(), 
            type: cond.type ?? 'eventOccurred',
            scoping: cond.scoping ?? 'anywhere',
            eventFilter: cond.eventFilter && (cond.eventFilter.all || cond.eventFilter.any) ? cond.eventFilter : defaultEventFilterRuleGroup,
            timeWindowSecondsBefore: cond.timeWindowSecondsBefore ?? 60,
            timeWindowSecondsAfter: cond.timeWindowSecondsAfter ?? 60,
        }));

        return {
            id: data.id,
            name: data.name,
            enabled: data.enabled,
            config: {
                conditions: config.conditions && (config.conditions.all || config.conditions.any) ? config.conditions : defaultRuleGroup,
                temporalConditions: initialTemporalConditions as TemporalCondition[],
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

    const { fields: temporalConditionsFields, append: appendTemporalCondition, remove: removeTemporalCondition } = useFieldArray({
        control: form.control,
        name: "config.temporalConditions"
    });

    const handleInsertToken = (
        fieldName: InsertableFieldNames,
        index: number,
        token: string,
        context: 'action',
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
                temporalConditions: data.config.temporalConditions?.map(cond => {
                    const { entityTypeFilter, ...restCond } = cond as any;
                    return {
                        id: restCond.id,
                        type: restCond.type,
                        scoping: restCond.scoping,
                        eventFilter: restCond.eventFilter,
                        timeWindowSecondsBefore: restCond.timeWindowSecondsBefore ? Number(restCond.timeWindowSecondsBefore) : undefined,
                        timeWindowSecondsAfter: restCond.timeWindowSecondsAfter ? Number(restCond.timeWindowSecondsAfter) : undefined,
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
            router.push('/automations');
            router.refresh();
        } catch (error) {
            console.error("Failed to submit form:", error);
            toast.error(`${errorMessage} ${error instanceof Error ? error.message : 'Please try again.'}`);
        } finally { setIsLoading(false); }
    };

    const pikoTargetConnectors = availableConnectors.filter(c => c.category === 'piko');
    const sortedPikoConnectors = [...pikoTargetConnectors].sort((a, b) => a.name.localeCompare(b.name));
    const sortedAvailableTargetDevices = [...availableTargetDevices].sort((a, b) => a.name.localeCompare(b.name));

    return (
        <FormProvider {...form}>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader><CardTitle>General Settings</CardTitle></CardHeader>
                        <CardContent>
                             <input type="hidden" {...form.register("id")} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField 
                                    control={form.control}
                                    name="name"
                                    render={({ field, fieldState }) => (
                                    <FormItem>
                                        <FormLabel className={cn(fieldState.error && "text-destructive")}>Automation Name</FormLabel>
                                        <FormControl><Input {...field} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
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

                    {/* --- NEW Parent Conditions Card --- */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Conditions (if...)</CardTitle>
                            <CardDescription className="text-xs text-muted-foreground pt-1">
                                Define the primary event trigger and optional subsequent time-based conditions.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6"> 
                            {/* --- Trigger Conditions Section --- */}
                            <div>
                                <h3 className="text-md font-semibold mb-3">Primary Trigger (if this happens...)</h3>
                                <FormField
                                    control={form.control}
                                    name="config.conditions"
                                    render={({ field }) => (
                                        <FormItem>
                                            <RuleBuilder value={field.value} onChange={field.onChange} />
                                            <FormDescription className={descriptionStyles}>Define conditions based on the triggering event&apos;s state.</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {/* --- Separator --- */}
                            <hr className="my-6" />

                            {/* --- Temporal Conditions Section --- */}
                            <div>
                                <h3 className="text-md font-semibold mb-3">Temporal Conditions (and if...)</h3>
                                <p className="text-xs text-muted-foreground mb-4">
                                    Optionally, add conditions based on other events happening near the trigger time.
                                </p>
                                <div className="space-y-4">
                                    {/* --- Map Temporal Conditions --- */}
                                    {temporalConditionsFields.map((fieldItem, index) => (
                                        <Card key={fieldItem.id} className="relative border border-blue-200 dark:border-blue-800 pt-8 bg-blue-50/30 dark:bg-blue-950/20">
                                            <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 text-muted-foreground hover:text-destructive h-6 w-6" onClick={() => removeTemporalCondition(index)}><Trash2 className="h-4 w-4" /><span className="sr-only">Remove Temporal Condition</span></Button>
                                            <CardContent className="space-y-4">
                                                <FormField name={`config.temporalConditions.${index}.type`} render={({ field, fieldState }) => (
                                                    <FormItem>
                                                        <FormLabel>Condition</FormLabel>
                                                        <div className="flex items-start gap-2">
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <FormControl><SelectTrigger className={cn("w-[250px]", fieldState.error && 'border-destructive')}><SelectValue /></SelectTrigger></FormControl>
                                                                <SelectContent>
                                                                    <SelectItem value="eventOccurred">Any matching event occurred</SelectItem>
                                                                    <SelectItem value="noEventOccurred">No matching event occurred</SelectItem>
                                                                    <SelectItem value="eventCountEquals">Matching event count =</SelectItem>
                                                                    <SelectItem value="eventCountLessThan">Matching event count &lt;</SelectItem>
                                                                    <SelectItem value="eventCountGreaterThan">Matching event count &gt;</SelectItem>
                                                                    <SelectItem value="eventCountLessThanOrEqual">Matching event count &le;</SelectItem>
                                                                    <SelectItem value="eventCountGreaterThanOrEqual">Matching event count &ge;</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            {/* --- Conditionally render Count Input INLINE --- */}
                                                            {[ 'eventCountEquals', 'eventCountLessThan', 'eventCountGreaterThan', 'eventCountLessThanOrEqual', 'eventCountGreaterThanOrEqual' ].includes(field.value) && (
                                                                <FormControl>
                                                                    <Input 
                                                                        {...form.register(`config.temporalConditions.${index}.expectedEventCount`, { valueAsNumber: true })}
                                                                        type="number" 
                                                                        min="0" 
                                                                        step="1" 
                                                                        placeholder="Count" 
                                                                        disabled={isLoading} 
                                                                        className={cn("w-[100px]", fieldState.error && 'border-destructive')} // Adjusted width slightly
                                                                    />
                                                                </FormControl>
                                                            )}
                                                        </div>
                                                        {/* Display description/message below the flex container */}
                                                        <FormDescription className={descriptionStyles}>
                                                            Select the condition type and specify count if needed.
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )} />

                                                <FormField name={`config.temporalConditions.${index}.scoping`} render={({ field, fieldState }) => (
                                                    <FormItem>
                                                        <FormLabel>Check Events From</FormLabel>
                                                        <Select onValueChange={field.onChange} value={field.value ?? 'anywhere'}>
                                                            <FormControl><SelectTrigger className={cn("w-[250px]", fieldState.error && 'border-destructive')}><SelectValue /></SelectTrigger></FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="anywhere">Anywhere</SelectItem>
                                                                <SelectItem value="sameArea">Devices in same area</SelectItem>
                                                                <SelectItem value="sameLocation">Devices in same location</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <FormDescription className={descriptionStyles}>Scope the devices checked by this condition.</FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )} />
                                                <FormField name={`config.temporalConditions.${index}.eventFilter`} render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Event Filter Criteria</FormLabel>
                                                        
                                                        <RuleBuilder 
                                                            value={field.value} 
                                                            onChange={field.onChange} 
                                                        />
                                                        
                                                        <FormDescription className={descriptionStyles}>Define criteria that matching events must meet.</FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )} />
                                               
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                                    <FormField name={`config.temporalConditions.${index}.timeWindowSecondsBefore`} render={({ field, fieldState }) => (
                                                        <FormItem>
                                                            <FormLabel>Seconds Before Trigger</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" min="0" step="1" placeholder="e.g., 120" disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} value={field.value === undefined || field.value === null ? '' : String(field.value)} onChange={(e) => { const val = e.target.value; field.onChange(val === '' ? undefined : Number(val)); }} onBlur={field.onBlur} name={field.name} ref={field.ref} />
                                                            </FormControl>
                                                            <FormDescription className={descriptionStyles}>Check for events up to this many seconds before the trigger.</FormDescription>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />
                                                    <FormField name={`config.temporalConditions.${index}.timeWindowSecondsAfter`} render={({ field, fieldState }) => (
                                                        <FormItem>
                                                            <FormLabel>Seconds After Trigger</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" min="0" step="1" placeholder="e.g., 120" disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} value={field.value === undefined || field.value === null ? '' : String(field.value)} onChange={(e) => { const val = e.target.value; field.onChange(val === '' ? undefined : Number(val)); }} onBlur={field.onBlur} name={field.name} ref={field.ref} />
                                                            </FormControl>
                                                            <FormDescription className={descriptionStyles}>Check for events up to this many seconds after the trigger.</FormDescription>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => appendTemporalCondition({ id: crypto.randomUUID(), ...defaultTemporalCondition })} 
                                        disabled={isLoading}
                                    >
                                        <Plus className="h-4 w-4" /> Add Temporal Condition
                                    </Button>
                                </div> 
                            </div>
                        </CardContent>
                    </Card>
                    

                    {/* --- RESTORE Actions Card --- */}
                     
                     <Card>
                         <CardHeader>
                            <CardTitle>Actions (then do this...)</CardTitle>
                         </CardHeader>
                         <CardContent className="space-y-4">
                            {actionsFields.map((fieldItem, index) => {
                                // --- Add Console Log Here --- 
                                console.log(`Rendering Action at index ${index}, ID: ${fieldItem.id}, Value:`, form.getValues(`config.actions.${index}`));
                                
                                const actionType = form.watch(`config.actions.${index}.type`);
                                return (
                                    <Card key={fieldItem.id} className="relative border border-dashed pt-8">
                                         {/* Action Card rendering logic - including simplified fields */}
                                        <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 text-muted-foreground hover:text-destructive h-6 w-6" onClick={() => removeAction(index)}><Trash2 className="h-4 w-4" /><span className="sr-only">Remove Action</span></Button>
                                        <CardContent className="space-y-4">
                                            <FormField 
                                                control={form.control}
                                                name={`config.actions.${index}.type`}
                                                render={({ field, fieldState }) => (
                                                    <FormItem>
                                                        <FormLabel>Action Type</FormLabel>
                                                        <FormControl>
                                                            <Select
                                                                onValueChange={(value) => {
                                                                    // --- Add Console Log Here --- 
                                                                    console.log(`Action type changed at index ${index} to:`, value);
                                                                    const newType = value as AutomationAction['type'];
                                                                    let newActionParams: AutomationAction['params'];
                                                                    if (newType === 'createEvent') { 
                                                                        newActionParams = { sourceTemplate: '', captionTemplate: '', descriptionTemplate: '', targetConnectorId: '' };
                                                                    } else if (newType === 'createBookmark') { 
                                                                        newActionParams = { nameTemplate: '', descriptionTemplate: '', durationMsTemplate: '5000', tagsTemplate: '', targetConnectorId: '' };
                                                                    } else if (newType === 'sendHttpRequest') { 
                                                                        newActionParams = { urlTemplate: '', method: 'GET', headers: [], contentType: 'text/plain', bodyTemplate: '' };
                                                                    } else if (newType === 'setDeviceState') {
                                                                        newActionParams = {
                                                                            targetDeviceInternalId: sortedAvailableTargetDevices.length > 0 ? sortedAvailableTargetDevices[0].id : '',
                                                                            targetState: ActionableState.SET_ON
                                                                        };
                                                                    } else { 
                                                                        console.warn(`Unexpected action type: ${value}. Defaulting to minimal sendHttpRequest.`); 
                                                                        newActionParams = { urlTemplate: '', method: 'GET'} as any; // Cast if necessary for default
                                                                    }
                                                                    // --- Add Console Log Here ---
                                                                    console.log(`Setting value for config.actions.${index} to:`, newActionParams);
                                                                    form.setValue(`config.actions.${index}.params` as any, newActionParams, { shouldValidate: true, shouldDirty: true });
                                                                    field.onChange(newType); // Ensure the type field itself is also updated
                                                                }}
                                                                value={field.value ?? 'createEvent'}
                                                            >
                                                                <SelectTrigger className={cn(fieldState.error && 'border-destructive')}>
                                                                    <SelectValue placeholder="Select Action Type" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="createBookmark">Create Piko Bookmark</SelectItem>
                                                                    <SelectItem value="createEvent">Create Piko Event</SelectItem>
                                                                    <SelectItem value="sendHttpRequest">Send HTTP Request</SelectItem>
                                                                    <SelectItem value="setDeviceState">Set Device State</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            {/* --- Add console log via IIFE --- */}
                                            {(() => { 
                                                console.log(`Rendering Target Connector check for index ${index}. actionType:`, actionType);
                                                return null; 
                                            })()}
                                            
                                            {/* Conditional rendering for Target Connector */}
                                            {(actionType === 'createEvent' || actionType === 'createBookmark') && (
                                                 <FormField
                                                     control={form.control}
                                                     name={`config.actions.${index}.params.targetConnectorId`}
                                                     render={({ field, fieldState }) => (
                                                         <FormItem>
                                                             <FormLabel>Target Connector</FormLabel>
                                                             <FormControl>
                                                                 <Select 
                                                                     onValueChange={field.onChange} 
                                                                     value={field.value ?? ''} 
                                                                     disabled={isLoading || !(actionType === 'createEvent' || actionType === 'createBookmark')}
                                                                 >
                                                                     <SelectTrigger className={cn(fieldState.error && 'border-destructive', !(actionType === 'createEvent' || actionType === 'createBookmark') && 'hidden')}>
                                                                         <SelectValue placeholder="Select Target Connector" />
                                                                     </SelectTrigger>
                                                                     <SelectContent>{sortedPikoConnectors.map(connector => (<SelectItem key={connector.id} value={connector.id}>{connector.name} ({connector.category})</SelectItem>))}</SelectContent>
                                                                 </Select>
                                                             </FormControl>
                                                             <FormMessage />
                                                         </FormItem>
                                                     )} />
                                            )}
                                            <div className="space-y-2 border-l-2 pl-4 ml-1 border-muted">
                                                <h3 className="text-sm font-medium text-muted-foreground mb-2">Action Parameters</h3>
                                                 <p className="text-xs text-muted-foreground"> {actionType === 'createBookmark' && "Creates a bookmark on related Piko cameras."} {actionType === 'createEvent' && "Creates an event in the target Piko system."} {actionType === 'sendHttpRequest' && "Sends an HTTP request."} {actionType === 'setDeviceState' && "Changes the state of a specified device (e.g., turn on/off)."} </p>
                                                {actionType === 'createEvent' && ( <>
                                                     {/* --- Restore sourceTemplate Field --- */}
                                                     <FormField control={form.control} name={`config.actions.${index}.params.sourceTemplate`} render={({ field, fieldState }) => (
                                                        <FormItem>
                                                            <div className="flex items-center justify-between">
                                                                <FormLabel>Source</FormLabel>
                                                                <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('sourceTemplate', index, token, 'action')} />
                                                            </div>
                                                            <FormControl><Textarea placeholder="Fusion" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                     )} />
                                                     {/* --- Restore captionTemplate Field --- */}
                                                     <FormField control={form.control} name={`config.actions.${index}.params.captionTemplate`} render={({ field, fieldState }) => (
                                                        <FormItem>
                                                            <div className="flex items-center justify-between">
                                                                <FormLabel>Caption</FormLabel>
                                                                <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('captionTemplate', index, token, 'action')} />
                                                            </div>
                                                            <FormControl><Textarea placeholder="Device: {{device.name}} // Event: {{event.data.state}} at {{event.time}}" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                     )} />
                                                     {/* --- Restore descriptionTemplate Field --- */}
                                                     <FormField control={form.control} name={`config.actions.${index}.params.descriptionTemplate`} render={({ field, fieldState }) => (
                                                        <FormItem>
                                                            <div className="flex items-center justify-between">
                                                                <FormLabel>Description</FormLabel>
                                                                <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('descriptionTemplate', index, token, 'action')} />
                                                            </div>
                                                            <FormControl><Textarea placeholder="Device: {{event.deviceId}} // Type: {{event.event}} // State: {{event.data.state}}" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                     )} />
                                                </> )}
                                                {actionType === 'createBookmark' && ( <>
                                                     {/* --- Restore Bookmark Fields --- */}
                                                    <FormField control={form.control} name={`config.actions.${index}.params.nameTemplate`} render={({ field, fieldState }) => (
                                                        <FormItem>
                                                            <div className="flex items-center justify-between">
                                                                <FormLabel>Name</FormLabel>
                                                                <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('nameTemplate', index, token, 'action')}/>
                                                            </div>
                                                            <FormControl><Input placeholder="e.g., Alert: {{device.name}}" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />
                                                    <FormField control={form.control} name={`config.actions.${index}.params.descriptionTemplate`} render={({ field, fieldState }) => (
                                                        <FormItem>
                                                            <div className="flex items-center justify-between">
                                                                <FormLabel>Description</FormLabel>
                                                                <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('descriptionTemplate', index, token, 'action')}/>
                                                            </div>
                                                            <FormControl><Textarea placeholder="e.g., Device: {{device.name}} triggered event {{event.event}}" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />
                                                    <FormField control={form.control} name={`config.actions.${index}.params.durationMsTemplate`} render={({ field, fieldState }) => (
                                                        <FormItem>
                                                             <div className="flex items-center justify-between">
                                                                <FormLabel>Duration (milliseconds)</FormLabel>
                                                                <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('durationMsTemplate', index, token, 'action')}/>
                                                            </div>
                                                            <FormControl><Input placeholder="e.g., 5000" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
                                                            <FormDescription className={descriptionStyles}>Duration in milliseconds.</FormDescription>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />
                                                    <FormField control={form.control} name={`config.actions.${index}.params.tagsTemplate`} render={({ field, fieldState }) => (
                                                        <FormItem>
                                                            <div className="flex items-center justify-between">
                                                                <FormLabel>Tags</FormLabel>
                                                                <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('tagsTemplate', index, token, 'action')}/>
                                                            </div>
                                                            <FormControl><Input placeholder="e.g., Alert,{{device.type}},Automation" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
                                                            <FormDescription className={descriptionStyles}>Enter tags separated by commas.</FormDescription>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />
                                                </> )}
                                                {actionType === 'sendHttpRequest' && ( 
                                                    <SendHttpRequestActionFields 
                                                        actionIndex={index} 
                                                        handleInsertToken={(fieldName, actIndex, token, headerIndex) => {
                                                            handleInsertToken(fieldName, actIndex, token, 'action', headerIndex);
                                                        }}
                                                    /> 
                                                )}
                                                {actionType === 'setDeviceState' && (
                                                    <>
                                                        <FormField
                                                            control={form.control}
                                                            name={`config.actions.${index}.params.targetDeviceInternalId`}
                                                            render={({ field, fieldState }) => (
                                                                <FormItem>
                                                                    <FormLabel>Target Device</FormLabel>
                                                                    <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isLoading}>
                                                                        <FormControl>
                                                                            <SelectTrigger className={cn(fieldState.error && 'border-destructive')}>
                                                                                <SelectValue placeholder="Select Target Device" />
                                                                            </SelectTrigger>
                                                                        </FormControl>
                                                                        <SelectContent>
                                                                            {sortedAvailableTargetDevices.map(device => {
                                                                                const IconComponent = getIconComponentByName(device.iconName) || HelpCircle;
                                                                                return (
                                                                                    <SelectItem key={device.id} value={device.id}>
                                                                                        <div className="flex items-center">
                                                                                            <IconComponent className="h-4 w-4 mr-2 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                                                                                            <span>{device.name} <span className="text-xs text-muted-foreground">({device.displayType})</span></span>
                                                                                        </div>
                                                                                    </SelectItem>
                                                                                );
                                                                            })}
                                                                            {sortedAvailableTargetDevices.length === 0 && (
                                                                                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                                                                    No controllable devices found.
                                                                                </div>
                                                                            )}
                                                                        </SelectContent>
                                                                    </Select>
                                                                    <FormDescription className={descriptionStyles}>
                                                                        Select the device to control.
                                                                    </FormDescription>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                        <FormField
                                                            control={form.control}
                                                            name={`config.actions.${index}.params.targetState`}
                                                            render={({ field, fieldState }) => (
                                                                <FormItem>
                                                                    <FormLabel>Target State</FormLabel>
                                                                    <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isLoading}>
                                                                        <FormControl>
                                                                            <SelectTrigger className={cn(fieldState.error && 'border-destructive')}>
                                                                                <SelectValue placeholder="Select Target State" />
                                                                            </SelectTrigger>
                                                                        </FormControl>
                                                                        <SelectContent>
                                                                            {Object.entries(ACTIONABLE_STATE_DISPLAY_MAP).map(([value, label]) => (
                                                                                <SelectItem key={value} value={value}>{label}</SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </>
                                                )}
                                                {!['createEvent', 'createBookmark', 'sendHttpRequest', 'setDeviceState'].includes(actionType || '') && ( <p className="text-sm text-muted-foreground">Select an action type.</p> )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                            <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                onClick={() => {
                                     // --- Add Console Log Here --- 
                                    console.log('Appending default action:', defaultAction);
                                    appendAction(defaultAction);
                                }}
                                disabled={isLoading}
                            >
                                <Plus className="h-4 w-4" /> Add Action
                            </Button>
                        </CardContent>
                    </Card>
                     

                     {/* Submit Button */}
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