'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { Area, Location } from '@/types/index'; // Import Area
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
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// --- Form Schema (Make locationId required) --- 
const areaFormSchema = z.object({
  name: z.string().min(1, { message: "Area name cannot be empty." }),
  locationId: z.string().uuid({ message: "Please select a valid location." }), // No longer optional/nullable
});

type AreaFormData = z.infer<typeof areaFormSchema>;

// --- Component Props --- 
interface AreaEditDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  areaToEdit?: Area | null; // Provide for editing, null/undefined for adding
  allLocations: Location[]; // Needed for location dropdown
  onSubmit: (data: AreaFormData, areaId?: string) => Promise<boolean>; // Returns promise indicating success
}

export const AreaEditDialog: React.FC<AreaEditDialogProps> = ({ 
  isOpen, 
  onOpenChange, 
  areaToEdit, 
  allLocations,
  onSubmit 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<AreaFormData>({
    resolver: zodResolver(areaFormSchema),
    // Adjust default values - locationId must have a valid default if adding
    // We'll set it based on the first available location in useEffect
    defaultValues: {
      name: '',
      locationId: undefined, // Initialize as undefined
    },
  });

  const isEditing = !!areaToEdit;
  const dialogTitle = isEditing ? "Edit Area" : "Add New Area";
  const dialogDescription = isEditing 
    ? "Update the details for this security area." 
    : "Create a new security area and assign it to a location."; // Updated description

  // Reset form when dialog opens or areaToEdit changes
  useEffect(() => {
    if (isOpen) {
      const defaultLocationId = areaToEdit?.locationId 
                                  ?? (allLocations.length > 0 ? allLocations[0].id : undefined);
      form.reset({
        name: areaToEdit?.name || '',
        locationId: defaultLocationId, // Set required default
      });
      setIsSubmitting(false);
    } 
  }, [isOpen, areaToEdit, form, allLocations]); // Added allLocations dependency

  const handleFormSubmit = async (data: AreaFormData) => {
    setIsSubmitting(true);
    // Call the provided onSubmit function (calls store action)
    const success = await onSubmit(data, areaToEdit?.id);
    setIsSubmitting(false);
    if (success) {
      onOpenChange(false); // Close dialog on successful submission
    }
    // Error handling/toast is expected within the onSubmit prop implementation
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
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
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Ground Floor Zone, Perimeter" {...field} />
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
                  <FormLabel>Location</FormLabel> {/* Removed (Optional) */}
                  <Select 
                    onValueChange={field.onChange} // Simplified onValueChange 
                    defaultValue={field.value} // Use default value from form state
                    value={field.value} // Control the value
                    required // Add required attribute
                  >
                    <FormControl>
                       {/* Add check to disable trigger if no locations exist */}
                      <SelectTrigger disabled={allLocations.length === 0}>
                        <SelectValue placeholder="Select a location" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {/* Remove the '-- None --' option */}
                      {/* <SelectItem value="__NONE__">-- None --</SelectItem> */} 
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
               {/* Disable submit if no locations exist */}
              <Button type="submit" disabled={isSubmitting || allLocations.length === 0}>
                {isSubmitting ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save' : 'Create Area')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}; 