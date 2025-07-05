'use client';

import React from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray, FormProvider } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { EventType, EventSubtype, ActionableState } from '@/lib/mappings/definitions';
import type { connectors } from '@/data/db/schema';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { GeneralSettingsSection } from './form-sections/GeneralSettingsSection';
import { TriggerConditionsSection } from './form-sections/TriggerConditionsSection';
import { TemporalConditionsSection } from './form-sections/TemporalConditionsSection';
import { ActionsSection } from './form-sections/ActionsSection';
import type { InsertableFieldNames } from './form-sections/ActionItem';
import type { Location, Area } from '@/types';
import { Skeleton } from "@/components/ui/skeleton";
import { AutomationTriggerType } from '@/lib/automation-types';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { FormDescription } from "@/components/ui/form";
import { ScheduleBuilder } from './form-sections/ScheduleBuilder';
import { TimeOfDayFilterSection } from './form-sections/TimeOfDayFilterSection';
import { Activity, CalendarDays } from 'lucide-react';
import { TimezoneSelector } from '@/components/common/timezone-selector';
import type { AutomationTrigger, TimeOfDayFilter } from '@/lib/automation-schemas';

interface AutomationFormData {
    id: string;
    name: string;
    enabled: boolean;
    configJson: AutomationConfig;
    locationScopeId?: string | null;
    tags?: string[];
    createdAt: Date;
    updatedAt: Date;
}

const FormSchema = z.object({
    id: z.string(),
    name: z.string().min(1, "Automation name is required."),
    enabled: z.boolean(),
    config: AutomationConfigSchema,
    locationScopeId: z.string().uuid().nullable().optional(),
    tags: z.array(z.string()).default([]),
}).superRefine((data, ctx) => {
    const trigger = data.config.trigger;

    if (trigger.type === AutomationTriggerType.SCHEDULED) {
        if (!data.locationScopeId) {
            if (!trigger.timeZone || trigger.timeZone.trim() === "") {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["config", "trigger", "timeZone"], 
                    message: "Timezone is required for scheduled automations when no location scope is selected.",
                });
            }
        }
    }
});

export type AutomationFormValues = z.infer<typeof FormSchema>;

type ConnectorSelect = typeof connectors.$inferSelect;

interface AutomationFormProps {
    initialData: AutomationFormData;
    availableConnectors: Pick<ConnectorSelect, 'id' | 'name' | 'category'>[];
    sourceDeviceTypeOptions: any;
    availableTargetDevices: Array<{ id: string; name: string; displayType: string; iconName: string; areaId?: string | null; locationId?: string | null; }>;
    devicesForConditions: Array<{ id: string; name: string; areaId?: string | null; locationId?: string | null; }>;
    allLocations: Location[];
    allAreas: Area[];
}

const defaultRuleGroup: JsonRuleGroup = { any: [] };
const defaultEventFilterRuleGroup: JsonRuleGroup = { all: [] };

const addInternalIds = (node: any): any => {
    if (!node) return node;
    if (node._internalId === undefined) { 
        node._internalId = crypto.randomUUID();
    }
    if (node.all || node.any) {
        const groupType = node.all ? 'all' : 'any';
        const children = node[groupType] || []; 
        node[groupType] = children.map(addInternalIds);
    }
    return node;
};

const getClonedEventFilter = (eventFilter?: JsonRuleGroup) => {
    if (eventFilter && (eventFilter.all || eventFilter.any) && (eventFilter.all?.length || eventFilter.any?.length)) {
        return JSON.parse(JSON.stringify(eventFilter));
    }
    return JSON.parse(JSON.stringify(defaultEventFilterRuleGroup));
};

const getClonedInitialConditions = (configConditions?: JsonRuleGroup) => {
    if (configConditions && (configConditions.all || configConditions.any) && (configConditions.all?.length || configConditions.any?.length)) {
        return JSON.parse(JSON.stringify(configConditions));
    }
    return JSON.parse(JSON.stringify(defaultRuleGroup)); 
};

// Helper function to ensure a default cron expression if undefined/null/empty
const ensureDefaultCron = (cron?: string | null): string => {
    return cron && cron.trim() !== "" ? cron : '0 9 * * 1';
};

export default function AutomationForm({
    initialData,
    availableConnectors,
    sourceDeviceTypeOptions,
    availableTargetDevices = [],
    devicesForConditions,
    allLocations,
    allAreas,
}: AutomationFormProps) {

    const router = useRouter();
    const [isLoading, setIsLoading] = React.useState<boolean>(false);
    const [locationScopePopoverOpen, setLocationScopePopoverOpen] = React.useState(false);
    const [displayTriggerType, setDisplayTriggerType] = React.useState<AutomationTriggerType | null>(null);

    // Caches for trigger type specific settings (using refs to avoid extra renders)
    const initialPersistedTrigger = initialData.configJson.trigger;
    const eventTriggerConditionsRef = React.useRef<JsonRuleGroup>(
        initialPersistedTrigger?.type === AutomationTriggerType.EVENT
            ? addInternalIds(getClonedInitialConditions(initialPersistedTrigger.conditions))
            : addInternalIds(getClonedInitialConditions(undefined))
    );
    const scheduledTriggerConfigRef = React.useRef<{
        scheduleType: 'fixed_time' | 'sunrise' | 'sunset';
        cronExpression?: string;
        offsetMinutes?: number;
        timeZone?: string;
    }>(
        initialPersistedTrigger?.type === AutomationTriggerType.SCHEDULED
            ? {
                scheduleType: initialPersistedTrigger.scheduleType || 'fixed_time',
                cronExpression: initialPersistedTrigger.scheduleType === 'fixed_time' ? ensureDefaultCron(initialPersistedTrigger.cronExpression) : undefined,
                offsetMinutes: initialPersistedTrigger.scheduleType !== 'fixed_time' ? initialPersistedTrigger.offsetMinutes : undefined,
                timeZone: initialPersistedTrigger.timeZone
            }
            : { scheduleType: 'fixed_time', cronExpression: '0 9 * * 1', timeZone: undefined }
    );

    // Ref to store the previous trigger state for comparison in useEffect
    const previousTriggerRef = React.useRef<AutomationFormValues['config']['trigger']>();

    const safeAllLocations = Array.isArray(allLocations) ? allLocations : [];
    const safeAllAreas = Array.isArray(allAreas) ? allAreas : [];
    const conditionsDataReady = devicesForConditions && allLocations && allAreas;

    // Define the function to get default values. It will be called by useForm and useEffect.
    // This function should be pure and not cause side effects.
    const getInitialFormValues = React.useCallback((data: AutomationFormData): AutomationFormValues => {
        const rawConfigJson = data.configJson;
        // console.log("[GetInitialValues] Processing data for ID:", data.id, "Name:", data.name);
        // console.log("[GetInitialValues] Raw configJson from initialData:", JSON.stringify(rawConfigJson, null, 2));

        let parsedSourceTrigger: AutomationTrigger | undefined = undefined;
        let parsedActions: AutomationAction[] = [];
        let parsedTemporalConditions: TemporalCondition[] = [];

        if (rawConfigJson) {
            const parseResult = AutomationConfigSchema.safeParse(rawConfigJson);
            if (parseResult.success) {
                // console.log("[GetInitialValues] Successfully parsed rawConfigJson with AutomationConfigSchema.");
                parsedSourceTrigger = parseResult.data.trigger;
                parsedActions = parseResult.data.actions || [];
                parsedTemporalConditions = parseResult.data.temporalConditions || [];
                // console.log("[GetInitialValues] Parsed sourceTrigger:", JSON.stringify(parsedSourceTrigger, null, 2));
            } else {
                // console.warn("[GetInitialValues] Failed to parse rawConfigJson with AutomationConfigSchema. Error:", parseResult.error.flatten());
                if (rawConfigJson.trigger && typeof rawConfigJson.trigger.type === 'string') {
                    parsedSourceTrigger = rawConfigJson.trigger as any;
                    // console.warn("[GetInitialValues] Using rawConfigJson.trigger as a fallback for parsedSourceTrigger.");
                }
                parsedActions = (rawConfigJson.actions as AutomationAction[] || []);
                parsedTemporalConditions = (rawConfigJson.temporalConditions as TemporalCondition[] || []);
            }
        } else {
            // console.warn("[GetInitialValues] rawConfigJson is undefined or null.");
        }

        const initialActions = parsedActions.map((action: AutomationAction) => {
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
                return { ...action, params: { ...restParamsHttp, headers: Array.isArray(headersArray) ? headersArray : [], contentType: currentContentType } };
            }
            return action;
        });

        const initialTemporalConditions = parsedTemporalConditions.map(cond => {
            const type = cond.type ?? 'eventOccurred';
            let expectedCount = cond.expectedEventCount;
            if (['eventCountEquals', 'eventCountLessThan', 'eventCountGreaterThan', 'eventCountLessThanOrEqual', 'eventCountGreaterThanOrEqual'].includes(type)) {
                if (expectedCount === null || expectedCount === undefined) expectedCount = 0;
            }
            const clonedEventFilterWithIds = addInternalIds(getClonedEventFilter(cond.eventFilter));
            return {
                id: cond.id ?? crypto.randomUUID(), 
                type: type,
                scoping: cond.scoping ?? 'anywhere',
                expectedEventCount: expectedCount,
                eventFilter: clonedEventFilterWithIds,
                timeWindowSecondsBefore: cond.timeWindowSecondsBefore ?? 60,
                timeWindowSecondsAfter: cond.timeWindowSecondsAfter ?? 60,
            };
        });
        
        let triggerConfigForDefaultValues: AutomationFormValues['config']['trigger'];
        const defaultEventConfig = {
            type: AutomationTriggerType.EVENT as const,
            conditions: addInternalIds(getClonedInitialConditions(undefined)),
            timeOfDayFilter: { type: 'any_time' as const }
        };

        if (parsedSourceTrigger) {
            if (parsedSourceTrigger.type === AutomationTriggerType.SCHEDULED) {
                // console.log("[GetInitialValues] Identified as SCHEDULED from parsedSourceTrigger. DB type was:", rawConfigJson?.trigger?.type);
                const scheduleType = parsedSourceTrigger.scheduleType || 'fixed_time';
                
                if (scheduleType === 'fixed_time') {
                    triggerConfigForDefaultValues = {
                        type: AutomationTriggerType.SCHEDULED,
                        scheduleType: 'fixed_time' as const,
                        cronExpression: ensureDefaultCron(parsedSourceTrigger.cronExpression),
                        timeZone: parsedSourceTrigger.timeZone || undefined,
                    };
                } else if (scheduleType === 'sunrise' || scheduleType === 'sunset') {
                    triggerConfigForDefaultValues = {
                        type: AutomationTriggerType.SCHEDULED,
                        scheduleType: scheduleType,
                        offsetMinutes: parsedSourceTrigger.offsetMinutes || 0,
                        timeZone: parsedSourceTrigger.timeZone || undefined,
                    };
                } else {
                    // Fallback to fixed_time for unknown schedule types
                triggerConfigForDefaultValues = {
                    type: AutomationTriggerType.SCHEDULED,
                        scheduleType: 'fixed_time' as const,
                    cronExpression: ensureDefaultCron(parsedSourceTrigger.cronExpression),
                    timeZone: parsedSourceTrigger.timeZone || undefined,
                };
                }
            } else if (parsedSourceTrigger.type === AutomationTriggerType.EVENT) {
                // console.log("[GetInitialValues] Identified as EVENT from parsedSourceTrigger. DB type was:", rawConfigJson?.trigger?.type);
                triggerConfigForDefaultValues = {
                    type: AutomationTriggerType.EVENT,
                    conditions: addInternalIds(getClonedInitialConditions(parsedSourceTrigger.conditions)),
                    // Include timeOfDayFilter from source, with fallback to default
                    timeOfDayFilter: parsedSourceTrigger.timeOfDayFilter || { type: 'any_time' }
                };
            } else {
                // console.warn("[GetInitialValues] Parsed sourceTrigger.type is unknown or not part of enum, defaulting to EVENT. Parsed type:", (parsedSourceTrigger as any).type);
                triggerConfigForDefaultValues = defaultEventConfig;
            }
        } else if (data.id !== 'new' && rawConfigJson && (rawConfigJson as any).conditions) {
            // console.warn("[GetInitialValues] Fallback: No parsedSourceTrigger, but found old top-level conditions. Defaulting to EVENT.");
            triggerConfigForDefaultValues = {
               type: AutomationTriggerType.EVENT,
               conditions: addInternalIds(getClonedInitialConditions((rawConfigJson as any).conditions)),
               timeOfDayFilter: { type: 'any_time' as const }
            };
        } else {
            // if (data.id !== 'new') {
            //     console.warn("[GetInitialValues] Fallback: No parsedSourceTrigger and no old conditions for existing item. Defaulting to EVENT.");
            // } else {
            //     console.log("[GetInitialValues] Fallback: New item or unidentifiable/missing trigger, defaulting to EVENT.");
            // }
            triggerConfigForDefaultValues = defaultEventConfig;
        }
        
        return {
            id: data.id,
            name: data.name,
            enabled: data.enabled,
            locationScopeId: data.locationScopeId ?? null,
            tags: data.tags ?? [],
            config: {
                trigger: triggerConfigForDefaultValues, 
                temporalConditions: initialTemporalConditions,
                actions: initialActions as AutomationAction[],
            }
        };
    }, []); // Minimal dependencies for useCallback if initialData is stable, or expand if needed.

    // Memoize default form values to avoid re-running getInitialFormValues on every render
    const defaultFormValues = React.useMemo(() => {
        // console.log("[AutomationForm] Recalculating defaultFormValues because initialData.id changed.");
        const values = getInitialFormValues(initialData);
        // console.log("[AutomationForm] defaultFormValues calculated:", JSON.stringify(values, null, 2));
        return values;
    }, [initialData, getInitialFormValues]); // Added getInitialFormValues as a dependency

    const form = useForm<AutomationFormValues>({
        resolver: zodResolver(FormSchema),
        defaultValues: defaultFormValues,
        mode: 'onTouched',
    });

    // Effect to set/reset form when initialData.id changes
    React.useEffect(() => {
        // console.log("[AutomationForm] useEffect for reset triggered by initialData.id change. ID:", initialData.id);
        form.reset(defaultFormValues);
        // console.log("[AutomationForm] RHF state after reset:", JSON.stringify(form.getValues(), null, 2));

        previousTriggerRef.current = defaultFormValues.config.trigger;
        const reinitializedTrigger = defaultFormValues.config.trigger;
        if (reinitializedTrigger.type === AutomationTriggerType.EVENT) {
            eventTriggerConditionsRef.current = reinitializedTrigger.conditions;
            scheduledTriggerConfigRef.current = { scheduleType: 'fixed_time', cronExpression: '0 9 * * 1', timeZone: undefined };
        } else if (reinitializedTrigger.type === AutomationTriggerType.SCHEDULED) {
            scheduledTriggerConfigRef.current = {
                scheduleType: reinitializedTrigger.scheduleType || 'fixed_time',
                cronExpression: reinitializedTrigger.scheduleType === 'fixed_time' ? ensureDefaultCron(reinitializedTrigger.cronExpression) : undefined,
                offsetMinutes: reinitializedTrigger.scheduleType !== 'fixed_time' ? reinitializedTrigger.offsetMinutes : undefined,
                timeZone: reinitializedTrigger.timeZone,
            };
            eventTriggerConditionsRef.current = addInternalIds(getClonedInitialConditions(undefined));
        }
    }, [initialData.id, form, defaultFormValues]);

    // Initialize UI display state from form data
    React.useEffect(() => {
        const initialTriggerType = defaultFormValues.config.trigger?.type || AutomationTriggerType.EVENT;
        // console.log("[AutomationForm] Initializing displayTriggerType from defaultFormValues.config.trigger.type:", initialTriggerType);
        setDisplayTriggerType(initialTriggerType);
    }, [defaultFormValues]); // Depend on defaultFormValues

    const watchedLocationScopeId = form.watch('locationScopeId');

    const currentRuleLocationScope = React.useMemo(() => {
        if (!watchedLocationScopeId || !Array.isArray(allLocations)) {
            return null;
        }
        const foundLocation = allLocations.find(loc => loc.id === watchedLocationScopeId);
        return foundLocation ? { id: foundLocation.id, name: foundLocation.name } : null;
    }, [watchedLocationScopeId, allLocations]);

    const sortedAvailableAreas = React.useMemo(() => {
        if (!Array.isArray(allAreas)) {
            return [];
        }
        let areasToConsider = allAreas;
        if (watchedLocationScopeId) {
            areasToConsider = allAreas.filter(area => area.locationId === watchedLocationScopeId);
        }
        return [...areasToConsider].sort((a, b) => a.name.localeCompare(b.name));
    }, [allAreas, watchedLocationScopeId]);

    const initiallyHasTemporalConditions = React.useMemo(() => 
        Boolean(initialData?.configJson?.temporalConditions?.length),
        [initialData?.configJson?.temporalConditions]
    );

    const onSubmit = async (data: AutomationFormValues) => {
        setIsLoading(true);
        
        // console.log("FORM SUBMIT - Raw form data:", JSON.stringify(data, null, 2));
        
        // Just use the form data directly - it's the source of truth
        const triggerFromForm = data.config.trigger;
        
        const cleanConditionNode = (conditionNode: any): any => {
            if (!conditionNode) return conditionNode;
            const { _internalId, ...rest } = conditionNode;
            if (rest.all) {
                rest.all = rest.all.map((node: any) => cleanConditionNode(node));
            } else if (rest.any) {
                rest.any = rest.any.map((node: any) => cleanConditionNode(node));
            }
            return rest;
        };

        // Process the trigger payload based on form data
        let triggerPayload: AutomationTrigger;
        
        if (triggerFromForm.type === AutomationTriggerType.EVENT) {
            triggerPayload = {
                type: AutomationTriggerType.EVENT,
                conditions: cleanConditionNode(triggerFromForm.conditions),
                ...(triggerFromForm.timeOfDayFilter && { timeOfDayFilter: triggerFromForm.timeOfDayFilter })
            };
        } else if (triggerFromForm.type === AutomationTriggerType.SCHEDULED) {
            // Handle all schedule types
            if (triggerFromForm.scheduleType === 'fixed_time') {
            triggerPayload = {
                type: AutomationTriggerType.SCHEDULED,
                    scheduleType: 'fixed_time',
                cronExpression: ensureDefaultCron(triggerFromForm.cronExpression),
                timeZone: triggerFromForm.timeZone || undefined
            };
            } else if (triggerFromForm.scheduleType === 'sunrise' || triggerFromForm.scheduleType === 'sunset') {
                triggerPayload = {
                    type: AutomationTriggerType.SCHEDULED,
                    scheduleType: triggerFromForm.scheduleType,
                    offsetMinutes: triggerFromForm.offsetMinutes || 0,
                    timeZone: triggerFromForm.timeZone || undefined
                };
            } else {
                console.error("Invalid schedule type in scheduled trigger:", triggerFromForm.scheduleType);
                toast.error("Invalid schedule type. Cannot save automation.");
                setIsLoading(false);
                return;
            }
        } else {
            // console.error("Unknown trigger type in form submission:", triggerFromForm);
            toast.error("Invalid trigger type. Cannot save automation.");
            setIsLoading(false);
            return;
        }
        
        const processedConfig = { 
            actions: data.config.actions.map((action: AutomationAction) => {
                if (action.type === 'sendHttpRequest' && !['POST', 'PUT', 'PATCH'].includes((action.params as any).method)) {
                    const { bodyTemplate, contentType, ...restParams } = action.params as any;
                    return { ...action, params: { ...restParams, bodyTemplate: undefined, contentType: undefined } };
                }
                return action;
            }),
            temporalConditions: data.config.temporalConditions?.map(cond => {
                const cleanEventFilter = (filterNode: any): any => {
                    if (!filterNode) return filterNode;
                    const { _internalId, ...rest } = filterNode; 
                    if (rest.all) {
                        rest.all = rest.all.map(cleanEventFilter);
                    } else if (rest.any) {
                        rest.any = rest.any.map(cleanEventFilter);
                    }
                    return rest;
                };
                const { _internalId, eventFilter, ...restCond } = cond as any;                 
                return {
                    id: restCond.id || crypto.randomUUID(),
                    type: restCond.type,
                    scoping: restCond.scoping,
                    expectedEventCount: restCond.expectedEventCount !== undefined ? Number(restCond.expectedEventCount) : undefined,
                    eventFilter: cleanEventFilter(eventFilter),
                    timeWindowSecondsBefore: restCond.timeWindowSecondsBefore !== undefined ? Number(restCond.timeWindowSecondsBefore) : undefined,
                    timeWindowSecondsAfter: restCond.timeWindowSecondsAfter !== undefined ? Number(restCond.timeWindowSecondsAfter) : undefined,
                };
            }) || [],
            trigger: triggerPayload, // Use the triggerPayload we created above
        };
        
        const payloadForApi = {
            name: data.name,
            enabled: data.enabled,
            config: processedConfig, // This now contains the correctly structured trigger
            locationScopeId: data.locationScopeId || null,
            tags: data.tags || [],
        };
        
        // console.log("FORM SUBMIT - Final API payload:", JSON.stringify(payloadForApi, null, 2));
        
        const isEditing = initialData.id !== 'new';
        const apiUrl = isEditing ? `/api/automations/${initialData.id}` : '/api/automations';
        const httpMethod = isEditing ? 'PUT' : 'POST';
        const successMessage = isEditing ? "Automation updated!" : "Automation created!";
        const errorMessage = isEditing ? "Failed to update automation." : "Failed to create automation.";
        
        try {
            // console.log(`FORM SUBMIT - Sending ${httpMethod} request to ${apiUrl}`);
            const response = await fetch(apiUrl, { 
                method: httpMethod, 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payloadForApi) 
            });
            
            if (!response.ok) {
                let errorDetails = `API Error: ${response.status} ${response.statusText}`;
                try { 
                    const errorJson = await response.json(); 
                    // console.error("Server error details:", errorJson);
                    errorDetails = errorJson.message || errorJson.error || errorDetails; 
                    if (errorJson?.error?.issues) {
                        const zodErrorMessages = errorJson.error.issues
                            .map((issue: any) => `${issue.path.join('.')}: ${issue.message}`)
                            .join('; ');
                        if (zodErrorMessages) errorDetails += ` (${zodErrorMessages})`;
                    } else if (errorJson.errors?.fieldErrors) {
                        const fieldErrorMessages = Object.entries(errorJson.errors.fieldErrors || {})
                            .map(([field, messages]) => `${field}: ${(messages as string[]).join(', ')}`)
                            .join('; ');
                        if (fieldErrorMessages) errorDetails += ` (${fieldErrorMessages})`;
                    }
                } catch (e) { 
                    // console.error("Error parsing error response:", e); // Consider keeping if useful
                }
                // console.error(errorMessage, errorDetails);
                throw new Error(errorDetails);
            }
            
            // Log the response
            try {
                const responseJson = await response.json();
                // console.log("FORM SUBMIT - API response:", JSON.stringify(responseJson, null, 2));
            } catch (e) {
                // console.log("FORM SUBMIT - API response (not JSON):", response);
            }
            
            toast.success(successMessage);
            router.push('/automations');
            router.refresh();
        } catch (error) {
            // console.error("Failed to submit form:", error);
            toast.error(`${errorMessage} ${error instanceof Error ? error.message : 'Please check console for details.'}`);
        } finally { 
            setIsLoading(false); 
        }
    };

    const pikoTargetConnectors = availableConnectors.filter(c => c.category === 'piko');
    const sortedPikoConnectors = React.useMemo(() => 
        [...pikoTargetConnectors].sort((a, b) => a.name.localeCompare(b.name)), 
        [pikoTargetConnectors]
    );
    const sortedAvailableTargetDevices = React.useMemo(() => 
        [...availableTargetDevices].sort((a, b) => a.name.localeCompare(b.name)),
        [availableTargetDevices]
    );

    // Function to insert tokens into action fields
    const handleInsertToken = (
        fieldName: InsertableFieldNames,
        index: number,
        token: string,
        context: 'action',
        headerIndex?: number
    ) => {
        let currentFieldName: string;
        if ((fieldName as string).startsWith('headers.') && headerIndex !== undefined) {
            const fieldKey = (fieldName as string).substring((`headers.${headerIndex}.`).length);
            if (fieldKey === 'keyTemplate' || fieldKey === 'valueTemplate') {
                currentFieldName = `config.actions.${index}.params.headers.${headerIndex}.${fieldKey}`;
            } else {
                // console.error("Invalid action header field name:", fieldName);
                return;
            }
        } else {
            currentFieldName = `config.actions.${index}.params.${fieldName as Exclude<InsertableFieldNames, `headers.${number}.keyTemplate` | `headers.${number}.valueTemplate`>}`;
        }

        try {
            const currentValue = form.getValues(currentFieldName as any) || "";
            form.setValue(currentFieldName as any, currentValue + token, { shouldValidate: true, shouldDirty: true });
        } catch (error) {
            // console.error("Error setting field value:", error, { currentFieldName });
        }
    };

    return (
        <FormProvider {...form}>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader><CardTitle>General Settings</CardTitle></CardHeader>
                        <CardContent>
                             <FormField control={form.control} name="id" render={({ field }) => <input type="hidden" {...field} />} />
                             <GeneralSettingsSection
                                form={form}
                                isLoading={isLoading}
                                allLocations={safeAllLocations}
                                locationScopePopoverOpen={locationScopePopoverOpen}
                                setLocationScopePopoverOpen={setLocationScopePopoverOpen}
                             />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Trigger</CardTitle>
                            <CardDescription className="text-xs text-muted-foreground pt-1">
                                Define what will cause this automation to run.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <FormField
                                control={form.control}
                                name="config.trigger.type"
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                        <FormLabel>Trigger Type:</FormLabel>
                                        <FormControl>
                                            <ToggleGroup
                                                type="single"
                                                variant="outline"
                                                value={field.value}
                                                onValueChange={(value) => {
                                                    if (!value) return;
                                                    const newType = value as AutomationTriggerType;
                                                    
                                                    // Update the display state for UI rendering
                                                    setDisplayTriggerType(newType);
                                                    
                                                    // Store current state before switching
                                                    if (field.value === AutomationTriggerType.EVENT && 
                                                        newType === AutomationTriggerType.SCHEDULED) {
                                                        // Save current EVENT conditions for possible later switch back
                                                        const currentConditions = form.getValues('config.trigger.conditions');
                                                        eventTriggerConditionsRef.current = currentConditions;
                                                        
                                                        // Update the form with a complete SCHEDULED trigger
                                                        form.setValue('config.trigger', {
                                                            type: AutomationTriggerType.SCHEDULED,
                                                            scheduleType: scheduledTriggerConfigRef.current.scheduleType,
                                                            cronExpression: scheduledTriggerConfigRef.current.scheduleType === 'fixed_time' ? 
                                                                scheduledTriggerConfigRef.current.cronExpression || '0 9 * * 1' : undefined,
                                                            offsetMinutes: scheduledTriggerConfigRef.current.scheduleType !== 'fixed_time' ? 
                                                                scheduledTriggerConfigRef.current.offsetMinutes : undefined,
                                                            timeZone: scheduledTriggerConfigRef.current.timeZone,
                                                        }, { shouldValidate: true, shouldDirty: true });
                                                        
                                                    } else if (field.value === AutomationTriggerType.SCHEDULED && 
                                                            newType === AutomationTriggerType.EVENT) {
                                                        // Save current SCHEDULED settings for possible later switch back
                                                        const currentTrigger = form.getValues('config.trigger');
                                                        if (currentTrigger.type === AutomationTriggerType.SCHEDULED) {
                                                            scheduledTriggerConfigRef.current = {
                                                                scheduleType: currentTrigger.scheduleType || 'fixed_time',
                                                                cronExpression: currentTrigger.scheduleType === 'fixed_time' ? ensureDefaultCron(currentTrigger.cronExpression) : undefined,
                                                                offsetMinutes: currentTrigger.scheduleType !== 'fixed_time' ? currentTrigger.offsetMinutes : undefined,
                                                                timeZone: currentTrigger.timeZone,
                                                            };
                                                        }
                                                        
                                                        // Update the form with a complete EVENT trigger
                                                        form.setValue('config.trigger', {
                                                            type: AutomationTriggerType.EVENT,
                                                            conditions: eventTriggerConditionsRef.current,
                                                        }, { shouldValidate: true, shouldDirty: true });
                                                    }
                                                }}
                                                className="flex space-x-1 justify-start"
                                            >
                                                <ToggleGroupItem 
                                                    value={AutomationTriggerType.EVENT} 
                                                    aria-label="Event-based Trigger" 
                                                    className="text-xs justify-center data-[state=on]:bg-accent data-[state=on]:text-accent-foreground px-4 py-2"
                                                >
                                                    <Activity className="h-4 w-4" />
                                                    Event-based
                                                </ToggleGroupItem>
                                                <ToggleGroupItem 
                                                    value={AutomationTriggerType.SCHEDULED} 
                                                    aria-label="Scheduled Trigger" 
                                                    className="text-xs justify-center data-[state=on]:bg-accent data-[state=on]:text-accent-foreground px-4 py-2"
                                                >
                                                    <CalendarDays className="h-4 w-4" />
                                                    Scheduled
                                                </ToggleGroupItem>
                                            </ToggleGroup>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {displayTriggerType === AutomationTriggerType.EVENT && conditionsDataReady && (
                                <TriggerConditionsSection
                                    form={form}
                                    basePath="config.trigger.conditions"
                                    watchedLocationScopeId={watchedLocationScopeId}
                                    allLocations={safeAllLocations}
                                    allAreas={safeAllAreas}
                                    devicesForConditions={devicesForConditions}
                                    allConnectors={availableConnectors}
                                />
                            )}
                            
                            {displayTriggerType === AutomationTriggerType.SCHEDULED && (
                                <div className="space-y-4 p-4 border rounded-md bg-background">
                                    <FormField
                                        control={form.control}
                                        name="config.trigger"
                                        render={({ field }) => {
                                            const currentTrigger = field.value as AutomationTrigger;
                                            
                                            return (
                                            <FormItem>
                                                <FormLabel>Schedule</FormLabel>
                                                <FormControl>
                                                    <ScheduleBuilder
                                                            scheduleType={currentTrigger.type === AutomationTriggerType.SCHEDULED ? currentTrigger.scheduleType : 'fixed_time'}
                                                            onScheduleTypeChange={(newScheduleType) => {
                                                                // Update trigger with new schedule type
                                                                if (newScheduleType === 'fixed_time') {
                                                                    const newTrigger = {
                                                                        type: AutomationTriggerType.SCHEDULED,
                                                                        scheduleType: 'fixed_time' as const,
                                                                        cronExpression: scheduledTriggerConfigRef.current.cronExpression || '0 9 * * 1',
                                                                        timeZone: currentTrigger.type === AutomationTriggerType.SCHEDULED ? currentTrigger.timeZone : undefined,
                                                                    };
                                                                    field.onChange(newTrigger);
                                                                    
                                                                    // Update ref
                                                                    scheduledTriggerConfigRef.current = {
                                                                        scheduleType: 'fixed_time',
                                                                        cronExpression: newTrigger.cronExpression,
                                                                        timeZone: newTrigger.timeZone,
                                                                    };
                                                                } else {
                                                                    const newTrigger = {
                                                                        type: AutomationTriggerType.SCHEDULED,
                                                                        scheduleType: newScheduleType,
                                                                        offsetMinutes: scheduledTriggerConfigRef.current.offsetMinutes || 0,
                                                                        timeZone: currentTrigger.type === AutomationTriggerType.SCHEDULED ? currentTrigger.timeZone : undefined,
                                                                    };
                                                                    field.onChange(newTrigger);
                                                                    
                                                                    // Update ref
                                                                    scheduledTriggerConfigRef.current = {
                                                                        scheduleType: newScheduleType,
                                                                        offsetMinutes: newTrigger.offsetMinutes,
                                                                        timeZone: newTrigger.timeZone,
                                                                    };
                                                                }
                                                            }}
                                                            
                                                            cronExpression={currentTrigger.type === AutomationTriggerType.SCHEDULED && currentTrigger.scheduleType === 'fixed_time' ? currentTrigger.cronExpression : '0 9 * * 1'}
                                                        onCronExpressionChange={(newCron) => {
                                                            const cronValue = ensureDefaultCron(newCron);
                                                            
                                                                // Update trigger with new CRON expression
                                                                field.onChange({
                                                                    ...currentTrigger,
                                                                    cronExpression: cronValue,
                                                                });
                                                                
                                                                // Update backup ref
                                                                scheduledTriggerConfigRef.current = {
                                                                    ...scheduledTriggerConfigRef.current,
                                                                    cronExpression: cronValue,
                                                                };
                                                            }}
                                                            
                                                            offsetMinutes={currentTrigger.type === AutomationTriggerType.SCHEDULED && currentTrigger.scheduleType !== 'fixed_time' ? currentTrigger.offsetMinutes : 0}
                                                            onOffsetChange={(newOffset) => {
                                                                // Update trigger with new offset
                                                                field.onChange({
                                                                    ...currentTrigger,
                                                                    offsetMinutes: newOffset,
                                                                });
                                                        }}
                                                            
                                                        disabled={isLoading}
                                                            locationScope={currentRuleLocationScope}
                                                    />
                                                </FormControl>
                                                <FormDescription className="text-xs pt-1">
                                                        {currentTrigger.type === AutomationTriggerType.SCHEDULED && currentTrigger.scheduleType === 'fixed_time' && (
                                                            <>Raw CRON: <code className="p-0.5 bg-muted rounded text-xs font-mono">{currentTrigger.cronExpression || 'Not set'}</code></>
                                                        )}
                                                        {currentTrigger.type === AutomationTriggerType.SCHEDULED && currentTrigger.scheduleType !== 'fixed_time' && (
                                                            <>Schedule Type: <code className="p-0.5 bg-muted rounded text-xs font-mono">{currentTrigger.scheduleType}</code> with <code className="p-0.5 bg-muted rounded text-xs font-mono">{currentTrigger.offsetMinutes}min</code> offset</>
                                                        )}
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                            );
                                        }}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="config.trigger.timeZone"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className={cn(!!watchedLocationScopeId && "text-muted-foreground/70")}>Time Zone</FormLabel>
                                                <FormControl>
                                                    <TimezoneSelector
                                                        value={field.value || undefined}
                                                        onChange={(newTimeZone) => {
                                                            const tzValue = newTimeZone || undefined;
                                                            
                                                            // Update both the form field and backup ref
                                                            field.onChange(tzValue);
                                                            scheduledTriggerConfigRef.current = {
                                                                ...scheduledTriggerConfigRef.current,
                                                                timeZone: tzValue,
                                                            };
                                                        }}
                                                        disabled={isLoading || !!watchedLocationScopeId}
                                                        placeholder={!!watchedLocationScopeId ? "Uses location's time zone" : "Select a time zone..."}
                                                    />
                                                </FormControl>
                                                <FormDescription className="text-xs">
                                                    {!!watchedLocationScopeId 
                                                        ? "Disabled: Schedule will use the time zone of the selected location scope."
                                                        : ""
                                                    }
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            )}

                            {!conditionsDataReady && displayTriggerType === AutomationTriggerType.EVENT && (
                                <div>
                                    <h3 className="text-sm font-semibold mb-3">Primary Conditions (if this happens...)</h3>
                                    <div className="space-y-2 p-2 border rounded">
                                        <div className="flex gap-2">
                                            <Skeleton className="h-9 w-1/4" />
                                            <Skeleton className="h-9 w-[100px]" />
                                            <Skeleton className="h-9 w-1/3" />
                                            <Skeleton className="h-9 w-10" />
                                        </div>
                                    </div>
                                    <Skeleton className="h-4 w-3/4 mt-1" />
                                </div>
                            )}
                            
                            {displayTriggerType === AutomationTriggerType.EVENT && (
                                <>
                                    <hr className="my-6" />
                                    <TemporalConditionsSection
                                        form={form}
                                        isLoading={isLoading}
                                        initialExpanded={initiallyHasTemporalConditions}
                                        watchedLocationScopeId={watchedLocationScopeId}
                                        allLocations={safeAllLocations}
                                        allAreas={safeAllAreas}
                                        devicesForConditions={devicesForConditions}
                                        allConnectors={availableConnectors}
                                    />
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {displayTriggerType === AutomationTriggerType.EVENT && (
                        <TimeOfDayFilterSection
                            form={form}
                            isLoading={isLoading}
                        />
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Actions (then do this...)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ActionsSection
                                form={form}
                                isLoading={isLoading}
                                triggerType={displayTriggerType ?? AutomationTriggerType.EVENT}
                                handleInsertToken={handleInsertToken}
                                sortedPikoConnectors={sortedPikoConnectors}
                                sortedAvailableTargetDevices={sortedAvailableTargetDevices}
                                sortedAvailableAreas={sortedAvailableAreas}
                                currentRuleLocationScope={currentRuleLocationScope}
                            />
                        </CardContent>
                    </Card>

                    <div className="flex justify-end space-x-2 mt-8">
                        <Button type="submit" disabled={isLoading || !form.formState.isValid}>
                            {isLoading ? 'Saving...' : (initialData.id === 'new' ? 'Create Automation' : 'Save')}
                        </Button>
                    </div>
                </form>
            </Form>
        </FormProvider>
    );
}