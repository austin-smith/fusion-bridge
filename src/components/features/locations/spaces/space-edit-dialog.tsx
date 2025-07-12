'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { Space, Location } from '@/types/index';
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Form Schema
const spaceFormSchema = z.object({
  name: z.string().min(1, { message: "Space name cannot be empty." }),
  locationId: z.string().uuid({ message: "Please select a valid location." }),
  description: z.string().optional(),
});

type SpaceFormData = z.infer<typeof spaceFormSchema>;

// Component Props
interface SpaceEditDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  spaceToEdit?: Space | null; // Provide for editing, null/undefined for adding
  allLocations: Location[]; // Needed for location dropdown
  allSpaces: Space[]; // Needed for duplicate validation
  onSubmit: (data: SpaceFormData, spaceId?: string) => Promise<boolean>; // Returns promise indicating success
}

export const SpaceEditDialog: React.FC<SpaceEditDialogProps> = ({ 
  isOpen, 
  onOpenChange, 
  spaceToEdit, 
  allLocations,
  allSpaces,
  onSubmit 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const form = useForm<SpaceFormData>({
    resolver: zodResolver(spaceFormSchema),
    defaultValues: {
      name: '',
      locationId: undefined,
      description: '',
    },
  });

  const isEditing = !!spaceToEdit;
  const dialogTitle = isEditing ? "Edit Space" : "Add New Space";
  const dialogDescription = isEditing 
    ? "Update the details for this physical space." 
    : "Create a new physical space and assign it to a location.";

  // Reset form when dialog opens or spaceToEdit changes
  useEffect(() => {
    if (isOpen) {
      const defaultLocationId = spaceToEdit?.locationId 
                                  ?? (allLocations.length > 0 ? allLocations[0].id : undefined);
      form.reset({
        name: spaceToEdit?.name || '',
        locationId: defaultLocationId,
        description: spaceToEdit?.description || '',
      });
      setIsSubmitting(false);
    } 
  }, [isOpen, spaceToEdit, form, allLocations]);

  const handleFormSubmit = async (data: SpaceFormData) => {
    // Check for duplicate names within the same location
    const trimmedName = data.name.trim();
    const existingSpace = allSpaces.find(space => 
      space.name.toLowerCase() === trimmedName.toLowerCase() &&
      space.locationId === data.locationId &&
      space.id !== spaceToEdit?.id
    );
    
    if (existingSpace) {
      form.setError('name', { 
        type: 'manual', 
        message: 'A space with this name already exists in this location.' 
      });
      return;
    }

    setIsSubmitting(true);
    // Call the provided onSubmit function (calls store action)
    const success = await onSubmit(data, spaceToEdit?.id);
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
                    <Input placeholder="e.g., Lobby, Server Room, Vault" {...field} />
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
                      placeholder="Brief description of this physical space..."
                      className="min-h-[80px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || allLocations.length === 0}>
                {isSubmitting ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save' : 'Create Space')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}; 