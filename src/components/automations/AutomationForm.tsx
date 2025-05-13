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
import { Form, FormField } from "@/components/ui/form";
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

interface AutomationFormData {
    id: string;
    name: string;
    enabled: boolean;
    configJson: AutomationConfig;
    locationScopeId?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

const FormSchema = z.object({
    id: z.string(),
    name: z.string().min(1),
    enabled: z.boolean(),
    config: AutomationConfigSchema,
    locationScopeId: z.string().uuid().nullable().optional(),
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

    const safeAllLocations = Array.isArray(allLocations) ? allLocations : [];
    const safeAllAreas = Array.isArray(allAreas) ? allAreas : [];
    const conditionsDataReady = devicesForConditions && allLocations && allAreas;

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
                return { ...action, params: { ...restParamsHttp, headers: Array.isArray(headersArray) ? headersArray : [], contentType: currentContentType } };
            }
            return action;
        }) || [];

        const initialTemporalConditions = (config?.temporalConditions ?? []).map(cond => {
            const type = cond.type ?? 'eventOccurred';
            let expectedCount = cond.expectedEventCount;
            
            if (['eventCountEquals', 'eventCountLessThan', 'eventCountGreaterThan', 'eventCountLessThanOrEqual', 'eventCountGreaterThanOrEqual'].includes(type)) {
                if (expectedCount === null || expectedCount === undefined) {
                    expectedCount = 0;
                }
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
        
        const initialConditionsWithIds = addInternalIds(getClonedInitialConditions(config.conditions));

        return {
            id: data.id,
            name: data.name,
            enabled: data.enabled,
            locationScopeId: data.locationScopeId ?? null,
            config: {
                conditions: initialConditionsWithIds,
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
                console.error("Invalid action header field name:", fieldName); 
                return; 
            }
        } else { 
             currentFieldName = `config.actions.${index}.params.${fieldName as Exclude<InsertableFieldNames, `headers.${number}.keyTemplate` | `headers.${number}.valueTemplate`>}`;
         }
        
        try {
            const currentValue = form.getValues(currentFieldName as any) || "";
            form.setValue(currentFieldName as any, currentValue + token, { shouldValidate: true, shouldDirty: true });
        } catch (error) { console.error("Error setting field value:", error, { currentFieldName }); }
    };

    const watchedLocationScopeId = form.watch('locationScopeId');

    const onSubmit = async (data: AutomationFormValues) => {
        setIsLoading(true);
        
        const processedConfig = { 
            ...data.config, 
            actions: data.config.actions.map((action: AutomationAction) => {
                if (action.type === 'sendHttpRequest' && !['POST', 'PUT', 'PATCH'].includes(action.params.method)) {
                    const { bodyTemplate, contentType, ...restParams } = action.params;
                    return { ...action, params: { ...restParams, bodyTemplate: undefined, contentType: undefined } };
                }
                if ((action.type === 'createEvent' || action.type === 'createBookmark')) {
                    
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
            conditions: ((conditionNode: any): any => {
                if (!conditionNode) return conditionNode;
                const { _internalId, ...rest } = conditionNode;
                if (rest.all) {
                    rest.all = rest.all.map((node: any) => (conditionNode as any)(node));
                } else if (rest.any) {
                    rest.any = rest.any.map((node: any) => (conditionNode as any)(node));
                }
                return rest;
            })(data.config.conditions),
        };
        
        const payloadForApi = {
            name: data.name,
            enabled: data.enabled,
            config: processedConfig,
            locationScopeId: data.locationScopeId || null,
        };
        
        const isEditing = initialData.id !== 'new';
        const apiUrl = isEditing ? `/api/automations/${initialData.id}` : '/api/automations';
        const httpMethod = isEditing ? 'PUT' : 'POST';
        const successMessage = isEditing ? "Automation updated!" : "Automation created!";
        const errorMessage = isEditing ? "Failed to update automation." : "Failed to create automation.";
        
        try {
            console.log("Submitting payload:", JSON.stringify(payloadForApi, null, 2));
            const response = await fetch(apiUrl, { 
                method: httpMethod, 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payloadForApi) 
            });
            if (!response.ok) {
                let errorDetails = `API Error: ${response.status} ${response.statusText}`;
                try { 
                    const errorJson = await response.json(); 
                    console.error("Server error details:", errorJson);
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
                } catch { /* Ignore if response isn't JSON */ }
                console.error(errorMessage, errorDetails);
                throw new Error(errorDetails);
            }
            toast.success(successMessage);
            router.push('/automations');
            router.refresh();
        } catch (error) {
            console.error("Failed to submit form:", error);
            toast.error(`${errorMessage} ${error instanceof Error ? error.message : 'Please check console for details.'}`);
        } finally { setIsLoading(false); }
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

    const initiallyHasTemporalConditions = React.useMemo(() => 
        Boolean(initialData?.configJson?.temporalConditions?.length),
        [initialData?.configJson?.temporalConditions]
    );

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
                            <CardTitle>Trigger (if...)</CardTitle>
                            <CardDescription className="text-xs text-muted-foreground pt-1">
                                Define the primary event trigger and optional subsequent time-based conditions.
                            </CardDescription>
                        </CardHeader>
                        {conditionsDataReady ? (
                            <CardContent className="space-y-6"> 
                                <TriggerConditionsSection
                                    form={form}
                                    watchedLocationScopeId={watchedLocationScopeId}
                                    allLocations={safeAllLocations}
                                    allAreas={safeAllAreas}
                                    devicesForConditions={devicesForConditions}
                                />

                                <hr className="my-6" />

                                <TemporalConditionsSection
                                    form={form}
                                    isLoading={isLoading}
                                    initialExpanded={initiallyHasTemporalConditions}
                                    watchedLocationScopeId={watchedLocationScopeId}
                                    allLocations={safeAllLocations}
                                    allAreas={safeAllAreas}
                                    devicesForConditions={devicesForConditions}
                                />
                            </CardContent>
                        ) : (
                            <CardContent className="space-y-6">
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
                                <hr className="my-6" />
                                <div>
                                    <h3 className="text-sm font-semibold mb-3">Temporal Conditions (and if...)</h3>
                                    <Skeleton className="h-6 w-full" />
                                </div>
                            </CardContent>
                        )}
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Actions (then do this...)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ActionsSection
                                form={form}
                                isLoading={isLoading}
                                handleInsertToken={handleInsertToken}
                                sortedPikoConnectors={sortedPikoConnectors}
                                sortedAvailableTargetDevices={sortedAvailableTargetDevices}
                            />
                        </CardContent>
                    </Card>

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