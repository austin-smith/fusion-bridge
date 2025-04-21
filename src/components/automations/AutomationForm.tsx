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

// Define the form schema by combining parts we need
const FormSchema = z.object({
    id: z.string(),
    name: z.string().min(1, "Name is required"),
    enabled: z.boolean(),
    sourceNodeId: z.string().uuid("Source node must be selected"),
    targetNodeId: z.string().uuid("Target node must be selected"),
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
    const handleInsertToken = (fieldName: keyof AutomationFormValues["config"]["actions"][number]["params"], index: number, token: string) => {
        const currentFieldName = `config.actions.${index}.params.${fieldName}` as const; // Ensure correct type for getValues/setValue
        const currentValue = form.getValues(currentFieldName) || ""; // Get current value or default to empty string
        form.setValue(currentFieldName, currentValue + token, { 
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
                                        <FormLabel>Source System (Trigger)</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Source Node" />
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
                                        <FormLabel>Target System (Action)</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Target Node" />
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
                                                            // When type changes, reset parameters (optional but good practice)
                                                            // form.setValue(`config.actions.${index}.params`, {}); 
                                                            field.onChange(value);
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
                                                            {/* Add other action types here later */}
                                                            {/* <SelectItem value="sendNotification">Send Notification</SelectItem> */}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        
                                        {/* --- Dynamic Parameter Fields --- */}
                                        <div className="space-y-2 border-l-2 pl-4 ml-1 border-muted">
                                            <h3 className="text-sm font-medium text-muted-foreground mb-2">
                                                Parameters for: {actionType === 'createEvent' ? 'Create Piko Event' : 'Selected Action'}
                                            </h3>
                                            
                                            {/* Render fields based on actionType */}
                                            {actionType === 'createEvent' && (
                                                <>
                                                    <FormField
                                                        control={form.control}
                                                        name={`config.actions.${index}.params.sourceTemplate`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <div className="flex items-center justify-between">
                                                                    <FormLabel>Source Template</FormLabel>
                                                                    <TokenInserter 
                                                                        tokens={AVAILABLE_AUTOMATION_TOKENS} 
                                                                        onInsert={(token) => handleInsertToken('sourceTemplate', index, token)}
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
                                                        name={`config.actions.${index}.params.captionTemplate`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <div className="flex items-center justify-between">
                                                                    <FormLabel>Caption Template</FormLabel>
                                                                    <TokenInserter 
                                                                        tokens={AVAILABLE_AUTOMATION_TOKENS} 
                                                                        onInsert={(token) => handleInsertToken('captionTemplate', index, token)}
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
                                                        name={`config.actions.${index}.params.descriptionTemplate`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <div className="flex items-center justify-between">
                                                                    <FormLabel>Description Template</FormLabel>
                                                                    <TokenInserter 
                                                                        tokens={AVAILABLE_AUTOMATION_TOKENS} 
                                                                        onInsert={(token) => handleInsertToken('descriptionTemplate', index, token)}
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

                                            {/* Add other action type fields here later using else if or similar logic */}
                                            {/* e.g., actionType === 'sendNotification' && (...) */}
                                            
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
                        onClick={() => appendAction({ type: 'createEvent', params: { sourceTemplate: '', captionTemplate: '', descriptionTemplate: '' } })}
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