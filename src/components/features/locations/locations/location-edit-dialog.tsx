'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { Location } from '@/types/index';
import type { FloorPlanData } from '@/lib/storage/file-storage';
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
import { LocationSunTimesDisplay } from '@/components/features/locations/locations/LocationSunTimesDisplay';
import { FloorPlanUpload } from '@/components/features/locations/locations/floor-plan-upload';
import { FloorPlanDisplay } from '@/components/features/locations/locations/floor-plan-display';
import { Check, ChevronsUpDown, MapPin, RotateCcw, Map, FileImage } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import states, { type State as UsState } from 'states-us';
import { format, parse } from 'date-fns';
import { toast } from 'sonner';

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
  latitude: z.string()
    .nullable()
    .optional()
    .refine((val) => {
      if (!val) return true; // Allow empty
      const num = parseFloat(val);
      return !isNaN(num) && num >= -90 && num <= 90;
    }, { message: "Latitude must be a number between -90 and 90" }),
  longitude: z.string()
    .nullable()
    .optional()
    .refine((val) => {
      if (!val) return true; // Allow empty
      const num = parseFloat(val);
      return !isNaN(num) && num >= -180 && num <= 180;
    }, { message: "Longitude must be a number between -180 and 180" }),
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
  const [isRefreshingCoordinates, setIsRefreshingCoordinates] = useState(false);
  const [selectedFloorPlanFile, setSelectedFloorPlanFile] = useState<File | null>(null);
  const [isUploadingFloorPlan, setIsUploadingFloorPlan] = useState(false);
  const [isDeletingFloorPlan, setIsDeletingFloorPlan] = useState(false);
  const [showFloorPlanUpload, setShowFloorPlanUpload] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(locationToEdit || null);
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
      latitude: null,
      longitude: null,
    },
  });

  // Watch form fields for address validation
  const addressStreet = form.watch('addressStreet');
  const addressCity = form.watch('addressCity');
  const addressState = form.watch('addressState');
  const addressPostalCode = form.watch('addressPostalCode');
  
  // Watch coordinate fields for map validation
  const latitude = form.watch('latitude');
  const longitude = form.watch('longitude');
  
  // Memoized check for whether all address fields are filled
  const allAddressFieldsFilled = useMemo(() => {
    return [addressStreet, addressCity, addressState, addressPostalCode]
      .every(field => field && field.trim() !== '');
  }, [addressStreet, addressCity, addressState, addressPostalCode]);

  // Update currentLocation when locationToEdit prop changes
  useEffect(() => {
    setCurrentLocation(locationToEdit || null);
  }, [locationToEdit]);

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
        latitude: locationToEdit?.latitude || null,
        longitude: locationToEdit?.longitude || null,
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

  // Helper function to generate Google Maps URL with address + coordinates
  const generateGoogleMapsUrl = (latitude: string, longitude: string): string => {
    // Get current address values
    const street = form.getValues('addressStreet');
    const city = form.getValues('addressCity');
    const state = form.getValues('addressState');
    const postal = form.getValues('addressPostalCode');
    
    // If we have a complete address, use it with coordinates for better accuracy
    if (street && city && state && postal) {
      const address = `${street}, ${city}, ${state} ${postal}`;
      const encodedAddress = encodeURIComponent(address);
      return `https://maps.google.com/maps?q=${encodedAddress}+@${latitude},${longitude}`;
    }
    
    // Fallback to just coordinates
    return `https://maps.google.com/maps?q=${latitude},${longitude}`;
  };

  // Check if coordinates are valid for map viewing
  const hasValidCoordinates = useMemo(() => {
    if (!latitude || !longitude) return false;
    
    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    return !isNaN(latNum) && !isNaN(lngNum) && 
           latNum >= -90 && latNum <= 90 && 
           lngNum >= -180 && lngNum <= 180;
  }, [latitude, longitude]);

  // Handle opening coordinates in Google Maps
  const handleViewOnMap = () => {
    if (!hasValidCoordinates || !latitude || !longitude) return;
    
    const mapUrl = generateGoogleMapsUrl(latitude, longitude);
    window.open(mapUrl, '_blank', 'noopener,noreferrer');
  };

  // Handle refreshing coordinates manually
  const handleRefreshCoordinates = async () => {
    // Get current form values for address fields
    const currentAddressValues = form.getValues();
    const addressData = {
      addressStreet: currentAddressValues.addressStreet,
      addressCity: currentAddressValues.addressCity,
      addressState: currentAddressValues.addressState,
      addressPostalCode: currentAddressValues.addressPostalCode,
    };

    // Validate that we have address data before attempting geocoding
    if (!allAddressFieldsFilled) {
      toast.error('Please fill in all address fields before refreshing coordinates');
      return;
    }

    setIsRefreshingCoordinates(true);
    try {
      if (locationToEdit?.id) {
        // For existing locations, use the geocode endpoint
        const response = await fetch(`/api/locations/${locationToEdit.id}/geocode`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(addressData),
        });

        const result = await response.json();

        if (result.success) {
          // Update form with new coordinates
          form.setValue('latitude', result.data.latitude.toString());
          form.setValue('longitude', result.data.longitude.toString());
          toast.success('Coordinates refreshed successfully');
        } else {
          toast.error(result.error || 'Failed to refresh coordinates');
        }
      } else {
        // For new locations, we'll need a different approach or endpoint
        // For now, show a helpful message
        toast.error('Please save the location first, then refresh coordinates');
      }
    } catch (error) {
      console.error('Error refreshing coordinates:', error);
      toast.error('Failed to refresh coordinates');
    } finally {
      setIsRefreshingCoordinates(false);
    }
  };

  // Floor plan handlers
  const handleFloorPlanFileSelect = (file: File) => {
    setSelectedFloorPlanFile(file);
  };

  const handleFloorPlanFileRemove = () => {
    setSelectedFloorPlanFile(null);
  };

  const handleFloorPlanUpload = async () => {
    if (!selectedFloorPlanFile || !currentLocation) return;

    setIsUploadingFloorPlan(true);
    try {
      const formData = new FormData();
      formData.append('floorPlan', selectedFloorPlanFile);

      const response = await fetch(`/api/locations/${currentLocation.id}/floor-plan`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success('Floor plan uploaded successfully!');
        setSelectedFloorPlanFile(null);
        setShowFloorPlanUpload(false);
        // Update local state with the updated location data
        if (result.data && result.data.location) {
          setCurrentLocation(result.data.location);
        }
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Error uploading floor plan:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload floor plan');
    } finally {
      setIsUploadingFloorPlan(false);
    }
  };

  const handleFloorPlanDelete = async () => {
    if (!currentLocation) return;

    setIsDeletingFloorPlan(true);
    try {
      const response = await fetch(`/api/locations/${currentLocation.id}/floor-plan`, {
        method: 'DELETE',
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success('Floor plan deleted successfully!');
        // Update local state to remove floor plan data
        if (currentLocation) {
          setCurrentLocation({
            ...currentLocation,
            floorPlan: null
          });
        }
      } else {
        throw new Error(result.error || 'Delete failed');
      }
    } catch (error) {
      console.error('Error deleting floor plan:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete floor plan');
    } finally {
      setIsDeletingFloorPlan(false);
    }
  };

  const handleFloorPlanReplace = () => {
    setShowFloorPlanUpload(true);
    setSelectedFloorPlanFile(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-0">
            <div className="overflow-y-auto max-h-[calc(90vh-14rem)] px-1 py-2 space-y-6">
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

            {/* Coordinates Section */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-md flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Geographic Coordinates
                  </CardTitle>
                  <div className="flex gap-2">
                    {hasValidCoordinates && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleViewOnMap}
                              disabled={isSubmitting}
                            >
                              <Map className="h-3 w-3" />
                              <span className="sr-only">Open in Google Maps</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Open in Google Maps
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {locationToEdit?.id && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleRefreshCoordinates}
                              disabled={
                                isSubmitting || 
                                isRefreshingCoordinates || 
                                !allAddressFieldsFilled
                              }
                            >
                              <RotateCcw className={cn("h-3 w-3", isRefreshingCoordinates && "animate-spin")} />
                              <span className="sr-only">Refresh Coordinates</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Refresh Coordinates
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="latitude"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Latitude</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            value={field.value ?? ''} 
                            placeholder="Enter latitude"
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="longitude"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Longitude</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            value={field.value ?? ''} 
                            placeholder="Enter longitude"
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Coordinates are automatically determined from the address when creating or updating locations. 
                  You can also enter them manually or use the refresh button to re-geocode the current address.
                </p>

                {/* Sun Times Display - Only show for existing locations with coordinates */}
                {isEditing && locationToEdit && locationToEdit.latitude && locationToEdit.longitude && (
                  <LocationSunTimesDisplay location={locationToEdit} />
                )}
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
                          This default schedule will be applied to all alarm zones in this location unless overridden.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            )}

            {/* Floor Plan Section - Only show for existing locations */}
            {isEditing && locationToEdit && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-md flex items-center gap-2">
                      <FileImage className="h-4 w-4" />
                      Floor Plan
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {!currentLocation?.floorPlan && !showFloorPlanUpload ? (
                    <div className="text-center py-6">
                      <FileImage className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mb-4">
                        No floor plan uploaded yet.
                      </p>
                      <Button 
                        type="button"
                        variant="outline" 
                        onClick={() => setShowFloorPlanUpload(true)}
                        disabled={isSubmitting}
                      >
                        Upload Floor Plan
                      </Button>
                    </div>
                  ) : showFloorPlanUpload ? (
                    <div className="space-y-4">
                      <FloorPlanUpload
                        onFileSelect={handleFloorPlanFileSelect}
                        onFileRemove={handleFloorPlanFileRemove}
                        selectedFile={selectedFloorPlanFile}
                        isUploading={isUploadingFloorPlan}
                        disabled={isSubmitting}
                      />
                      
                      {selectedFloorPlanFile && (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            onClick={handleFloorPlanUpload}
                            disabled={isUploadingFloorPlan || isSubmitting}
                            size="sm"
                          >
                            {isUploadingFloorPlan ? 'Uploading...' : 'Upload'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setShowFloorPlanUpload(false);
                              setSelectedFloorPlanFile(null);
                            }}
                            disabled={isUploadingFloorPlan || isSubmitting}
                            size="sm"
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : currentLocation?.floorPlan ? (
                    <FloorPlanDisplay
                      floorPlan={currentLocation.floorPlan as FloorPlanData}
                      locationId={currentLocation.id}
                      onDelete={handleFloorPlanDelete}
                      onReplace={handleFloorPlanReplace}
                      isDeleting={isDeletingFloorPlan}
                    />
                  ) : null}
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
            </div>
            
            <DialogFooter className="mt-6 pt-4 border-t bg-background">
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