'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { AlarmZone, Location } from '@/types/index';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ArmedState } from "@/lib/mappings/definitions";

// Form Schema
const alarmZoneFormSchema = z.object({
  name: z.string().min(1, { message: "Zone name cannot be empty." }),
  locationId: z.string().uuid({ message: "Please select a valid location." }),
  description: z.string().optional(),
  triggerBehavior: z.enum(['standard', 'custom'], { message: "Please select a trigger behavior." }),
});

type AlarmZoneFormData = z.infer<typeof alarmZoneFormSchema>;

// Component Props
interface AlarmZoneEditDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  zoneToEdit?: AlarmZone | null; // Provide for editing, null/undefined for adding
  allLocations: Location[]; // Needed for location dropdown
  onSubmit: (data: AlarmZoneFormData, zoneId?: string) => Promise<boolean>; // Returns promise indicating success
}

export const AlarmZoneEditDialog: React.FC<AlarmZoneEditDialogProps> = ({ 
  isOpen, 
  onOpenChange, 
  zoneToEdit, 
  allLocations,
  onSubmit 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<AlarmZoneFormData>({
    resolver: zodResolver(alarmZoneFormSchema),
    defaultValues: {
      name: '',
      locationId: undefined,
      description: '',
      triggerBehavior: 'standard',
    },
  });

  const isEditing = !!zoneToEdit;
  const dialogTitle = isEditing ? "Edit Alarm Zone" : "Add New Alarm Zone";
  const dialogDescription = isEditing 
    ? "Update the details for this security zone." 
    : "Create a new alarm zone for security management.";

  // Reset form when dialog opens or zoneToEdit changes
  useEffect(() => {
    if (isOpen) {
      const defaultLocationId = zoneToEdit?.locationId 
                                  ?? (allLocations.length > 0 ? allLocations[0].id : undefined);
      form.reset({
        name: zoneToEdit?.name || '',
        locationId: defaultLocationId,
        description: zoneToEdit?.description || '',
        triggerBehavior: zoneToEdit?.triggerBehavior || 'standard',
      });
      setIsSubmitting(false);
    } 
  }, [isOpen, zoneToEdit, form, allLocations]);

  const handleFormSubmit = async (data: AlarmZoneFormData) => {
    setIsSubmitting(true);
    // Call the provided onSubmit function (calls store action)
    const success = await onSubmit(data, zoneToEdit?.id);
    setIsSubmitting(false);
    if (success) {
      onOpenChange(false); // Close dialog on successful submission
    }
    // Error handling/toast is expected within the onSubmit prop implementation
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zone Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Vault Security, Perimeter, ATMs" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <Select 
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    value={field.value}
                    required
                  >
                    <FormControl>
                      <SelectTrigger disabled={allLocations.length === 0}>
                        <SelectValue placeholder="Select a location" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {allLocations.sort((a,b) => a.path.localeCompare(b.path)).map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name} 
                        </SelectItem>
                      ))}
                      {allLocations.length === 0 && (
                           <div className="p-2 text-sm text-muted-foreground">No locations available. Create one first.</div>
                       )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Brief description of this security zone..."
                      className="min-h-[80px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="triggerBehavior"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Trigger Behavior</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col space-y-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="standard" id="standard" />
                        <Label htmlFor="standard" className="font-normal cursor-pointer">
                          <div>
                            <div className="font-medium">Standard</div>
                            <div className="text-sm text-muted-foreground">
                              Use predefined alarm event types for triggering
                            </div>
                          </div>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="custom" id="custom" />
                        <Label htmlFor="custom" className="font-normal cursor-pointer">
                          <div>
                            <div className="font-medium">Custom</div>
                            <div className="text-sm text-muted-foreground">
                              Configure specific trigger rules for this zone
                            </div>
                          </div>
                        </Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormDescription>
                    Standard behavior works for most security zones. Choose custom only if you need specific trigger rules.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || allLocations.length === 0}>
                {isSubmitting ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save' : 'Create Zone')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}; 