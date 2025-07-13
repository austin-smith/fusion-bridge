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
  allAlarmZones: AlarmZone[]; // Needed for duplicate validation
  defaultLocationId?: string; // Default location ID for new zones
  onSubmit: (data: AlarmZoneFormData, zoneId?: string) => Promise<boolean>; // Returns promise indicating success
}

export const AlarmZoneEditDialog: React.FC<AlarmZoneEditDialogProps> = ({ 
  isOpen, 
  onOpenChange, 
  zoneToEdit, 
  allLocations,
  allAlarmZones,
  defaultLocationId,
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
      const locationId = zoneToEdit?.locationId 
                         ?? defaultLocationId 
                         ?? (allLocations.length > 0 ? allLocations[0].id : undefined);
      form.reset({
        name: zoneToEdit?.name || '',
        locationId: locationId,
        description: zoneToEdit?.description || '',
        triggerBehavior: zoneToEdit?.triggerBehavior || 'standard',
      });
      setIsSubmitting(false);
    } 
  }, [isOpen, zoneToEdit, form, allLocations, defaultLocationId]);

  const handleFormSubmit = async (data: AlarmZoneFormData) => {
    // Check for duplicate names within the same location
    const trimmedName = data.name.trim();
    const existingZone = allAlarmZones.find(zone => 
      zone.name.toLowerCase() === trimmedName.toLowerCase() &&
      zone.locationId === data.locationId &&
      zone.id !== zoneToEdit?.id
    );
    
    if (existingZone) {
      form.setError('name', { 
        type: 'manual', 
        message: 'An alarm zone with this name already exists in this location.' 
      });
      return;
    }

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
                      {[...allLocations].sort((a,b) => a.name.localeCompare(b.name)).map((loc) => (
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
                <FormItem>
                  <FormLabel>Trigger Behavior</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex flex-col space-y-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="standard" id="standard" />
                        <Label htmlFor="standard" className="font-normal">
                          Standard (Recommended)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="custom" id="custom" />
                        <Label htmlFor="custom" className="font-normal">
                          Custom
                        </Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormDescription>
                    Standard uses predefined security events. Custom allows fine-tuned control.
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