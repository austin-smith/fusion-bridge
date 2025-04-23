'use client';

import React from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray, Controller, FieldError } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

// Import Token Inserter and tokens
import { TokenInserter } from '@/components/automations/TokenInserter';
import { AVAILABLE_AUTOMATION_TOKENS } from '@/lib/automation-tokens';
import type { AutomationAction } from '@/lib/automation-schemas'; // Import the action type

// Define the form schema by combining parts we need
const FormSchema = z.object({
    id: z.string(),
    name: z.string().min(1, "Name is required"),
    enabled: z.boolean(),
    sourceNodeId: z.string().uuid("Source connector must be selected"),
    targetNodeId: z.string().uuid("Target connector must be selected"),
    config: AutomationConfigSchema
});

type AutomationFormValues = z.infer<typeof FormSchema>;
// Infer Node type directly if needed, or adjust props
type NodeSelect = typeof nodes.$inferSelect;

interface AutomationFormProps {
    initialData: AutomationFormData;
    availableNodes: Pick<NodeSelect, 'id' | 'name' | 'category'>[]; // Use inferred Node type
    sourceDeviceTypeOptions: MultiSelectOption[]; // Add the new prop
}

export default function AutomationForm({ 
    initialData, 
    availableNodes, 
    sourceDeviceTypeOptions // Destructure the new prop
}: AutomationFormProps) {
    
    const router = useRouter();
    const [isLoading, setIsLoading] = React.useState<boolean>(false);

    const form = useForm<AutomationFormValues>({
        resolver: zodResolver(FormSchema),
        defaultValues: {
            id: initialData.id,
            name: initialData.name || '',
            enabled: initialData.enabled ?? true,
            sourceNodeId: initialData.sourceNodeId || undefined,
            targetNodeId: initialData.targetNodeId || undefined,
            config: initialData.configJson ? {
                sourceEntityTypes: initialData.configJson.sourceEntityTypes || [],
                eventTypeFilter: initialData.configJson.eventTypeFilter || '',
                actions: initialData.configJson.actions || []
            } : { 
                sourceEntityTypes: [],
                eventTypeFilter: '',
                actions: []
            }
        },
        mode: 'onChange',
    });

    const { fields: actionsFields, append: appendAction, remove: removeAction } = useFieldArray({
        control: form.control,
        name: "config.actions"
    });

    // --- Token Insertion Handler ---
    const handleInsertToken = (
        // Ensure this type covers all possible parameter fields across action types
        fieldName: keyof AutomationAction['params'], 
        index: number, 
        token: string
    ) => {
        // Construct the field name string dynamically
        const currentFieldName = `config.actions.${index}.params.${fieldName}` as const; 
        const currentValue = form.getValues(currentFieldName as any) || ""; // Get current value or default to empty string (use any temporarily if types mismatch)
        form.setValue(currentFieldName as any, currentValue + token, { // Use any temporarily
            shouldValidate: true, // Re-validate after insertion
            shouldDirty: true // Mark field as dirty
        });
    };
    // --- End Token Insertion Handler ---

    const onSubmit = async (data: AutomationFormValues) => {
        setIsLoading(true);
        console.log("Submitting form data:", data);
        
        const isEditing = initialData.id !== 'new';
        const apiUrl = isEditing ? `/api/automations/${initialData.id}` : '/api/automations';
        const httpMethod = isEditing ? 'PUT' : 'POST';
        const successMessage = isEditing ? "Automation updated successfully!" : "Automation created successfully!";
        const errorMessage = isEditing ? "Failed to update automation." : "Failed to create automation.";

        try {
            const response = await fetch(apiUrl, {
                method: httpMethod,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data), // Send the validated form data
            });

            if (!response.ok) {
                // Attempt to parse error details from the response body
                let errorDetails = `API Error: ${response.status} ${response.statusText}`;
                try {
                    const errorJson = await response.json();
                    errorDetails = errorJson.message || errorJson.error || errorDetails;
                } catch (parseError) {
                    // Ignore if response body isn't valid JSON
                }
                console.error(errorMessage, errorDetails);
                throw new Error(errorDetails);
            }

            // Simulate API call delay - REMOVE THIS IN PRODUCTION
            // await new Promise(resolve => setTimeout(resolve, 1000));
            
            toast.success(successMessage);
            // Redirect back to the list page
            // Use replace to prevent back button going to the form page after successful save
            router.replace('/automations'); 
            // Refresh data on the list page to show the new/updated item
            router.refresh(); 

        } catch (error) {
            console.error("Failed to submit form:", error);
            // Display the specific error message from the API if available
            toast.error(`${errorMessage} ${error instanceof Error ? error.message : 'Please try again.'}`);
        } finally {
            setIsLoading(false);
        }
    };

    const sourceNodes = availableNodes.filter(n => n.category === 'yolink'); 
    const targetNodes = availableNodes.filter(n => n.category === 'piko');

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>General Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <input type="hidden" {...form.register("id")} />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Automation Name</FormLabel>
                                        <FormControl>
                                            <Input {...field} disabled={isLoading} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="enabled"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm mt-2 md:mt-0 md:pt-3">
                                         <div className="space-y-0.5">
                                            <FormLabel>Enabled</FormLabel>
                                        </div>
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                                disabled={isLoading}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="sourceNodeId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Source Connector (Trigger)</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Source Connector" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {sourceNodes.map(node => (
                                                    <SelectItem key={node.id} value={node.id}>
                                                        {node.name} ({node.category})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            
                            <FormField
                                control={form.control}
                                name="targetNodeId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Target Connector (Action)</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Target Connector" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {targetNodes.map(node => (
                                                    <SelectItem key={node.id} value={node.id}>
                                                        {node.name} ({node.category})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Trigger Configuration</CardTitle>
                    </CardHeader>
                     <CardContent className="space-y-4">
                        <FormField
                            control={form.control}
                            name="config.sourceEntityTypes"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Source Device Types</FormLabel>
                                    <FormControl>
                                        <MultiSelectCombobox 
                                            options={sourceDeviceTypeOptions}
                                            selected={field.value || []}
                                            onChange={field.onChange}
                                            placeholder="Select device types..."
                                        />
                                    </FormControl>
                                     <FormDescription>
                                        Select which types of devices from the source system can trigger this automation.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        
                        <FormField
                            control={form.control}
                            name="config.eventTypeFilter"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Event Type Filter (Optional)</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder="e.g., DoorSensor.Report, LeakSensor.*" disabled={isLoading} />
                                    </FormControl>
                                    <FormDescription>
                                        Use * as wildcard. Leave blank to allow all event types.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>

                <div>
                    <h2 className="text-xl font-semibold mb-4">Actions</h2>
                    <div className="space-y-4">
                        {actionsFields.map((fieldItem, index) => {
                            // Watch the type of the current action
                            const actionType = form.watch(`config.actions.${index}.type`);
                            // Helper to get a specific param field name string
                            const paramFieldName = (field: keyof AutomationAction['params']) => `config.actions.${index}.params.${field}` as const;

                            return (
                                <Card key={fieldItem.id} className="relative border border-dashed pt-8">
                                    <Button 
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute top-1 right-1 text-muted-foreground hover:text-destructive h-6 w-6"
                                        onClick={() => removeAction(index)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        <span className="sr-only">Remove Action</span>
                                    </Button>
                                    <CardContent className="space-y-4">
                                        <FormField
                                            control={form.control}
                                            name={`config.actions.${index}.type`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Action #{index + 1} Type</FormLabel>
                                                    <Select 
                                                        onValueChange={(value) => {
                                                            const newType = value as AutomationAction['type'];
                                                            
                                                            if (newType === 'createEvent') {
                                                                const newAction: AutomationAction = { // Explicitly type here
                                                                    type: 'createEvent',
                                                                    params: { sourceTemplate: '', captionTemplate: '', descriptionTemplate: '' }
                                                                };
                                                                // Call setValue within the block with the correctly typed object
                                                                form.setValue(`config.actions.${index}`, newAction, { shouldValidate: true });
                                                            } else if (newType === 'createBookmark') {
                                                                const newAction: AutomationAction = { // Explicitly type here
                                                                    type: 'createBookmark',
                                                                    params: { nameTemplate: '', descriptionTemplate: '', durationMsTemplate: '5000', tagsTemplate: '' } 
                                                                };
                                                                 // Call setValue within the block with the correctly typed object
                                                                 form.setValue(`config.actions.${index}`, newAction, { shouldValidate: true });
                                                            } else {
                                                                // Fallback logic
                                                                console.warn(`Unexpected action type selected: ${value}. Defaulting to createEvent.`);
                                                                const defaultAction: AutomationAction = { // Explicitly type here
                                                                    type: 'createEvent',
                                                                    params: { sourceTemplate: '', captionTemplate: '', descriptionTemplate: '' }
                                                                };
                                                                 // Call setValue within the block with the correctly typed object
                                                                form.setValue(`config.actions.${index}`, defaultAction, { shouldValidate: true });
                                                            }

                                                            // Pass the correctly typed value to RHF's internal state tracking
                                                            field.onChange(newType); 
                                                        }} 
                                                        defaultValue={field.value}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select Action Type" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="createEvent">Create Piko Event</SelectItem>
                                                            <SelectItem value="createBookmark">Create Piko Bookmark</SelectItem>
                                                            {/* Add other action types here later */}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        
                                        {/* --- Dynamic Parameter Fields --- */}
                                        <div className="space-y-2 border-l-2 pl-4 ml-1 border-muted">
                                            <h3 className="text-sm font-medium text-muted-foreground mb-2">
                                                Parameters for: {
                                                    actionType === 'createEvent' ? 'Create Piko Event' : 
                                                    actionType === 'createBookmark' ? 'Create Piko Bookmark' : 
                                                    'Selected Action'
                                                }
                                            </h3>
                                             {/* Description for Create Bookmark */}
                                              <p className="text-xs text-muted-foreground">
                                                 {actionType === 'createBookmark' && "This action will attempt to create a bookmark on any Piko cameras associated with the triggering device."}
                                             </p>
                                             {/* Description for Create Event */}
                                             <p className="text-xs text-muted-foreground">
                                                 {actionType === 'createEvent' && "This action creates a generic event in the target Piko system. If the triggering device has Piko camera associations, the event will be explicitly associated to those cameras."}
                                             </p>
                                            
                                            {/* Render fields based on actionType */}
                                            {actionType === 'createEvent' && (
                                                <>
                                                    <FormField
                                                        control={form.control}
                                                        name={paramFieldName('sourceTemplate' as any)} 
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <div className="flex items-center justify-between">
                                                                    <FormLabel>Source</FormLabel>
                                                                    <TokenInserter 
                                                                        tokens={AVAILABLE_AUTOMATION_TOKENS} 
                                                                        onInsert={(token) => handleInsertToken('sourceTemplate' as any, index, token)}
                                                                        className="ml-2"
                                                                    />
                                                                </div>
                                                                <FormControl>
                                                                    <Textarea 
                                                                        placeholder="e.g., YoLink Event - {{device.name}}"
                                                                        {...field}
                                                                        disabled={isLoading}
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name={paramFieldName('captionTemplate' as any)}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <div className="flex items-center justify-between">
                                                                    <FormLabel>Caption</FormLabel>
                                                                    <TokenInserter 
                                                                        tokens={AVAILABLE_AUTOMATION_TOKENS} 
                                                                        onInsert={(token) => handleInsertToken('captionTemplate' as any, index, token)}
                                                                        className="ml-2"
                                                                    />
                                                                </div>
                                                                <FormControl>
                                                                    <Textarea 
                                                                        placeholder="e.g., {{device.name}} Event: {{event.data.state}} at {{event.time}}"
                                                                        {...field}
                                                                        disabled={isLoading}
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name={paramFieldName('descriptionTemplate' as any)}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <div className="flex items-center justify-between">
                                                                    <FormLabel>Description</FormLabel>
                                                                    <TokenInserter 
                                                                        tokens={AVAILABLE_AUTOMATION_TOKENS} 
                                                                        onInsert={(token) => handleInsertToken('descriptionTemplate' as any, index, token)}
                                                                        className="ml-2"
                                                                    />
                                                                </div>
                                                                <FormControl>
                                                                    <Textarea 
                                                                        placeholder="Device: {{event.deviceId}} Type: {{event.event}} State: {{event.data.state}}"
                                                                        {...field}
                                                                        disabled={isLoading}
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </>
                                            )}

                                            {actionType === 'createBookmark' && (
                                                <>
                                                    <FormField
                                                        control={form.control}
                                                        name={paramFieldName('nameTemplate' as any)} 
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <div className="flex items-center justify-between">
                                                                    <FormLabel>Name</FormLabel>
                                                                    <TokenInserter 
                                                                        tokens={AVAILABLE_AUTOMATION_TOKENS} 
                                                                        onInsert={(token) => handleInsertToken('nameTemplate' as any, index, token)}
                                                                        className="ml-2"
                                                                    />
                                                                </div>
                                                                <FormControl>
                                                                    <Input placeholder="e.g., Alert: {{device.name}}" {...field} disabled={isLoading} />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                     <FormField
                                                        control={form.control}
                                                        name={paramFieldName('descriptionTemplate' as any)} 
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <div className="flex items-center justify-between">
                                                                    <FormLabel>Description</FormLabel>
                                                                    <TokenInserter 
                                                                        tokens={AVAILABLE_AUTOMATION_TOKENS} 
                                                                        onInsert={(token) => handleInsertToken('descriptionTemplate' as any, index, token)}
                                                                        className="ml-2"
                                                                    />
                                                                </div>
                                                                <FormControl>
                                                                    <Textarea placeholder="e.g., Device: {{device.name}} triggered event {{event.event}}" {...field} disabled={isLoading} />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name={paramFieldName('durationMsTemplate' as any)} 
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <div className="flex items-center justify-between">
                                                                    <FormLabel>Duration (ms)</FormLabel>
                                                                    <TokenInserter 
                                                                        tokens={AVAILABLE_AUTOMATION_TOKENS} 
                                                                        onInsert={(token) => handleInsertToken('durationMsTemplate' as any, index, token)}
                                                                        className="ml-2"
                                                                    />
                                                                </div>
                                                                <FormControl>
                                                                    {/* Using Input type="text" as it's a template */}
                                                                    <Input placeholder="e.g., 5000" {...field} disabled={isLoading} />
                                                                </FormControl>
                                                                 <FormDescription>
                                                                    Bookmark duration in milliseconds. Use tokens or enter a number.
                                                                </FormDescription>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                     <FormField
                                                        control={form.control}
                                                        name={paramFieldName('tagsTemplate' as any)} 
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <div className="flex items-center justify-between">
                                                                    <FormLabel>Tags</FormLabel>
                                                                    <TokenInserter 
                                                                        tokens={AVAILABLE_AUTOMATION_TOKENS} 
                                                                        onInsert={(token) => handleInsertToken('tagsTemplate' as any, index, token)}
                                                                        className="ml-2"
                                                                    />
                                                                </div>
                                                                <FormControl>
                                                                    <Input placeholder="e.g., Alert,{{device.type}},Automation" {...field} disabled={isLoading} />
                                                                </FormControl>
                                                                <FormDescription>
                                                                    Comma-separated list of tags. Use tokens or enter text.
                                                                </FormDescription>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </>
                                            )}
                                            
                                            {/* Placeholder if no type or unknown type selected */}
                                            {!actionType && (
                                                <p className="text-sm text-muted-foreground">Select an action type to configure its parameters.</p>
                                            )}
                                        </div>
                                        {/* --- End Dynamic Parameter Fields --- */}
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
                        onClick={() => appendAction({ 
                            type: 'createEvent', 
                            params: { sourceTemplate: '', captionTemplate: '', descriptionTemplate: '' } 
                        })}
                        disabled={isLoading}
                    >
                        <Plus className="h-4 w-4" /> Add Action
                    </Button>
                </div>

                <div className="flex justify-end space-x-2">
                     <Button type="submit" disabled={isLoading}>
                        {isLoading ? 'Saving...' : (initialData.id === 'new' ? 'Create Automation' : 'Save Changes')}
                    </Button>
                </div>
            </form>
        </Form>
    );
} 