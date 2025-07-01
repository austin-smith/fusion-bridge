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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimezoneSelector } from '@/components/common/timezone-selector';
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import states, { type State as UsState } from 'states-us';
import { format, parse } from 'date-fns';

// --- Form Schema --- 
const locationFormSchema = z.object({
  name: z.string().min(1, { message: "Location name cannot be empty." }),
  parentId: z.string().nullable().optional(), // UUID string or null/undefined
  timeZone: z.string().min(1, { message: "Time zone cannot be empty." }),
  externalId: z.string().nullable().optional(),
  addressStreet: z.string().min(1, { message: "Street address cannot be empty." }),
  addressCity: z.string().min(1, { message: "City cannot be empty." }),
  addressState: z.string().min(1, { message: "State cannot be empty." }),
  addressPostalCode: z.string().min(1, { message: "Postal code cannot be empty." }),
  notes: z.string().nullable().optional(),
  activeArmingScheduleId: z.string().nullable().optional(), // Add support for arming schedule
});

type LocationFormData = z.infer<typeof locationFormSchema>;

// --- Component Props --- 
interface LocationEditDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  locationToEdit?: Location | null; // Provide for editing, null/undefined for adding
  allLocations: Location[]; // Needed for parent dropdown
  onSubmit: (data: LocationFormData, locationId?: string) => Promise<boolean>; // Returns promise indicating success
  armingSchedules?: { id: string; name: string; daysOfWeek: number[]; armTimeLocal: string; disarmTimeLocal: string }[]; // Add arming schedules
}

export const LocationEditDialog: React.FC<LocationEditDialogProps> = ({ 
  isOpen, 
  onOpenChange, 
  locationToEdit, 
  allLocations,
  onSubmit,
  armingSchedules = [] // Default to empty array if not provided
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timezonePopoverOpen, setTimezonePopoverOpen] = useState(false);
  const [statePopoverOpen, setStatePopoverOpen] = useState(false);
  const form = useForm<LocationFormData>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: {
      name: '',
      parentId: null,
      timeZone: '',
      externalId: null,
      addressStreet: '',
      addressCity: '',
      addressState: '',
      addressPostalCode: '',
      notes: null,
      activeArmingScheduleId: null, // Add default for activeArmingScheduleId
    },
  });

  const isEditing = !!locationToEdit;
  const dialogTitle = isEditing ? "Edit Location" : "Add New Location";
  const dialogDescription = isEditing 
    ? "Update the details for this location." 
    : "Create a new location.";

  // Reset form when dialog opens or locationToEdit changes
  useEffect(() => {
    if (isOpen) {
      form.reset({
        name: locationToEdit?.name || '',
        parentId: locationToEdit?.parentId || null,
        timeZone: locationToEdit?.timeZone || '',
        externalId: locationToEdit?.externalId || null,
        addressStreet: locationToEdit?.addressStreet || '',
        addressCity: locationToEdit?.addressCity || '',
        addressState: locationToEdit?.addressState || '',
        addressPostalCode: locationToEdit?.addressPostalCode || '',
        notes: locationToEdit?.notes || null,
        activeArmingScheduleId: locationToEdit?.activeArmingScheduleId || null, // Reset activeArmingScheduleId
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

  const usStates: UsState[] = states.filter(s => !s.territory); // Filter out territories for now

  // Add function to format time in a readable way
  const formatTime = (timeString: string): string => {
    try {
      const date = parse(timeString, 'HH:mm', new Date());
      return format(date, 'h:mma'); // Convert 24-hour format to 12-hour with am/pm, no space
    } catch (error) {
      console.warn(`Invalid time string for formatting: ${timeString}`, error);
      return timeString; // Fallback to original string if parsing fails
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="externalId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>External ID</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Parent location field commented out for now */}
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-md">Address Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="addressStreet"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Street</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="md:col-span-1">
                    <FormField
                      control={form.control}
                      name="addressCity"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 md:col-span-2">
                    <FormField
                      control={form.control}
                      name="addressState"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>State</FormLabel>
                          <Popover open={statePopoverOpen} onOpenChange={setStatePopoverOpen}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  aria-expanded={statePopoverOpen}
                                  className={cn(
                                    "w-full justify-between",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value
                                    ? usStates.find(
                                        (s) => s.abbreviation === field.value
                                      )?.name
                                    : "Select state"}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent 
                              className="w-[--radix-popover-trigger-width] max-h-[--radix-popover-content-available-height] p-0"
                              onWheel={(e) => e.stopPropagation()}
                            >
                              <Command>
                                <CommandInput placeholder="Search state..." />
                                <CommandList className="flex-1 max-h-none">
                                  <ScrollArea className="h-72">
                                    <CommandEmpty>No state found.</CommandEmpty>
                                    <CommandGroup>
                                      {usStates.map((s) => (
                                        <CommandItem
                                          value={s.abbreviation} // Store abbreviation
                                          key={s.abbreviation}
                                          onSelect={() => {
                                            form.setValue("addressState", s.abbreviation);
                                            setStatePopoverOpen(false);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4", // Added mr-2 back for alignment
                                              s.abbreviation === field.value
                                                ? "opacity-100"
                                                : "opacity-0"
                                            )}
                                          />
                                          {s.name}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                    <ScrollBar orientation="vertical" />
                                  </ScrollArea>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="addressPostalCode"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Postal Code</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="timeZone"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Time Zone</FormLabel>
                      <FormControl>
                        <TimezoneSelector
                          value={field.value}
                          onChange={field.onChange}
                          disabled={isSubmitting}
                          placeholder="Select a time zone"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Arming Schedule Section */}
            {armingSchedules?.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-md">Default Arming Schedule</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="activeArmingScheduleId"
                    render={({ field }) => (
                      <FormItem>
                        <Select
                          onValueChange={(value) => field.onChange(value === "null" ? null : value)}
                          value={field.value || "null"}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select a default schedule">
                                {field.value ? 
                                  armingSchedules.find(s => s.id === field.value)?.name : 
                                  "None"}
                              </SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="null">
                              <div className="flex flex-col w-full">
                                <span>None</span>
                                <span className="text-muted-foreground text-xs">
                                  Location will not be automatically armed or disarmed
                                </span>
                              </div>
                            </SelectItem>
                            {armingSchedules.map((schedule) => (
                              <SelectItem key={schedule.id} value={schedule.id}>
                                <div className="flex flex-col w-full">
                                  <span>{schedule.name}</span>
                                  <span className="text-muted-foreground text-xs">
                                    {formatTime(schedule.armTimeLocal)} - {formatTime(schedule.disarmTimeLocal)}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-2">
                          This default schedule will be applied to all areas in this location unless overridden.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            )}
            
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea 
                      className="min-h-[100px]" 
                      {...field} 
                      value={field.value ?? ''} 
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
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save' : 'Create Location')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}; 