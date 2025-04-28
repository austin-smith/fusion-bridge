'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { Location } from '@/types/index';
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

// --- Form Schema --- 
const locationFormSchema = z.object({
  name: z.string().min(1, { message: "Location name cannot be empty." }),
  parentId: z.string().nullable().optional(), // UUID string or null/undefined
});

type LocationFormData = z.infer<typeof locationFormSchema>;

// --- Component Props --- 
interface LocationEditDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  locationToEdit?: Location | null; // Provide for editing, null/undefined for adding
  allLocations: Location[]; // Needed for parent dropdown
  onSubmit: (data: LocationFormData, locationId?: string) => Promise<boolean>; // Returns promise indicating success
}

export const LocationEditDialog: React.FC<LocationEditDialogProps> = ({ 
  isOpen, 
  onOpenChange, 
  locationToEdit, 
  allLocations,
  onSubmit 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<LocationFormData>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: {
      name: '',
      parentId: null,
    },
  });

  const isEditing = !!locationToEdit;
  const dialogTitle = isEditing ? "Edit Location" : "Add New Location";
  const dialogDescription = isEditing 
    ? "Update the details for this location." 
    : "Create a new location. You can optionally assign it a parent.";

  // Reset form when dialog opens or locationToEdit changes
  useEffect(() => {
    if (isOpen) {
      form.reset({
        name: locationToEdit?.name || '',
        parentId: locationToEdit?.parentId || null,
      });
      setIsSubmitting(false);
    } 
  }, [isOpen, locationToEdit, form]);

  const handleFormSubmit = async (data: LocationFormData) => {
    setIsSubmitting(true);
    // Prevent setting parentId to the location itself when editing
    if (isEditing && data.parentId === locationToEdit?.id) {
        form.setError("parentId", { message: "Cannot set location as its own parent.", type: "manual" });
        setIsSubmitting(false);
        return;
    }
    
    // Call the provided onSubmit function (which calls the store action)
    const success = await onSubmit(data, locationToEdit?.id);
    setIsSubmitting(false);
    if (success) {
      onOpenChange(false); // Close dialog on successful submission
    }
    // Error handling/toast is expected within the onSubmit prop implementation (in the parent component)
  };

  // Filter out the location being edited and its descendants from parent options
  const availableParents = allLocations.filter(loc => {
      if (!locationToEdit) return true; // Allow all if adding
      if (loc.id === locationToEdit.id) return false; // Cannot be its own parent
      // Cannot be a descendant of itself
      return !loc.path.startsWith(`${locationToEdit.path}.`); 
  });

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
                    <Input placeholder="e.g., Main Building, Floor 2, Server Room" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="parentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent Location (Optional)</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(value === '__ROOT__' ? null : value)} 
                    defaultValue={field.value ?? '__ROOT__'} // Use special value for null
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a parent location" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__ROOT__">-- None (Root Level) --</SelectItem>
                      {availableParents.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {/* TODO: Maybe show path or indent based on path for clarity? */}
                          {loc.name}
                        </SelectItem>
                      ))}
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
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save Changes' : 'Create Location')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}; 