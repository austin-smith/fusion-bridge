'use client';

import React, { useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown, X, Plus } from 'lucide-react';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { cn } from '@/lib/utils';
import type { Location } from '@/types';
import type { AutomationFormValues } from '../AutomationForm'; // Adjust path as needed

const descriptionStyles = "text-xs text-muted-foreground mt-1";
const NO_LOCATION_SCOPE_VALUE = '__none__';

interface GeneralSettingsSectionProps {
  form: UseFormReturn<AutomationFormValues>;
  isLoading: boolean;
  allLocations: Location[];
  locationScopePopoverOpen: boolean;
  setLocationScopePopoverOpen: (open: boolean) => void;
}

export function GeneralSettingsSection({
  form,
  isLoading,
  allLocations,
  locationScopePopoverOpen,
  setLocationScopePopoverOpen,
}: GeneralSettingsSectionProps) {
  const [newTag, setNewTag] = useState('');

  const addTag = (tag: string) => {
    if (!tag.trim()) return;
    const currentTags = form.getValues('tags') || [];
    if (!currentTags.includes(tag.trim())) {
      form.setValue('tags', [...currentTags, tag.trim()], { shouldDirty: true });
    }
    setNewTag('');
  };

  const removeTag = (tagToRemove: string) => {
    const currentTags = form.getValues('tags') || [];
    form.setValue('tags', currentTags.filter(tag => tag !== tagToRemove), { shouldDirty: true });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(newTag);
    }
  };

  return (
    <div className="space-y-4">
      {/* First row: Name, Location, Enabled */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FormField 
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
            <FormItem className="flex flex-col">
                <FormLabel className={cn("mb-1.5", fieldState.error && "text-destructive")}>Automation Name</FormLabel>
                <FormControl><Input {...field} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
                <FormDescription className={descriptionStyles}>Give your automation a descriptive name.</FormDescription>
                <FormMessage />
            </FormItem>
        )} />
        <FormField
          control={form.control}
          name="locationScopeId"
          render={({ field, fieldState }) => {
            // Explicitly watch the value to ensure display updates correctly
            const watchedValue = form.watch('locationScopeId'); 
            
            // Calculate display based on watched value
            const locationName = watchedValue && watchedValue !== NO_LOCATION_SCOPE_VALUE
                ? (allLocations.find(loc => loc.id === watchedValue)?.name ?? '[Invalid/Missing Location]') 
                : "Any Location" ;

            return (
                <FormItem className="flex flex-col">
                    <FormLabel className={cn("mb-1.5", fieldState.error && "text-destructive")}>Location Scope</FormLabel>
                    <Popover open={locationScopePopoverOpen} onOpenChange={setLocationScopePopoverOpen}>
                        <PopoverTrigger asChild>
                            <FormControl>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={locationScopePopoverOpen}
                                    className={cn("w-full justify-between font-normal", fieldState.error && 'border-destructive', !field.value && "text-muted-foreground")}
                                    disabled={isLoading}
                                >
                                    <span className="truncate">
                                        {/* Use the calculated locationName based on watched value */} 
                                        {locationName}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" style={{width: 'var(--radix-popover-trigger-width)'}}>
                            <Command>
                                <CommandInput placeholder="Search location..." />
                                <CommandList>
                                    <CommandEmpty>No location found.</CommandEmpty>
                                    <CommandGroup>
                                        <CommandItem
                                            key={NO_LOCATION_SCOPE_VALUE}
                                            value={NO_LOCATION_SCOPE_VALUE} // Allows searching for "Any Location"
                                            onSelect={() => {
                                                field.onChange(null);
                                                setLocationScopePopoverOpen(false);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    // Check visibility based on watched value
                                                    (!watchedValue || watchedValue === NO_LOCATION_SCOPE_VALUE) ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            Any Location
                                        </CommandItem>
                                        {allLocations.sort((a,b) => a.name.localeCompare(b.name)).map(loc => (
                                            <CommandItem 
                                                key={loc.id} 
                                                value={loc.name} // Search by name
                                                onSelect={() => {
                                                    field.onChange(loc.id);
                                                    setLocationScopePopoverOpen(false);
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        // Check visibility based on watched value
                                                        watchedValue === loc.id ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                {loc.name}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                    <FormDescription className={descriptionStyles}>Optionally limit this automation to a specific location.</FormDescription>
                    <FormMessage />
                </FormItem>
            );
        }}
        />
        <FormField control={form.control} name="enabled" render={({ field }) => (
            <FormItem className="flex flex-col">
                <FormLabel className="mb-1.5">Status</FormLabel>
                <div className="flex items-center space-x-2">
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isLoading} aria-label="Toggle Automation Enabled State" /></FormControl>
                    {field.value ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-800/50">
                            Enabled
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800/80 dark:text-gray-300 dark:border-gray-700/50">
                            Disabled
                        </Badge>
                    )}
                </div>
                <FormDescription className={descriptionStyles}>Enable or disable this automation.</FormDescription>
                <FormMessage />
            </FormItem>
        )} />
      </div>

      {/* Second row: Tags */}
      <FormField
        control={form.control}
        name="tags"
        render={({ field, fieldState }) => {
          const currentTags = field.value || [];
          return (
            <FormItem className="flex flex-col">
              <FormLabel className={cn("mb-1.5", fieldState.error && "text-destructive")}>Tags</FormLabel>
              
              {/* Display existing tags */}
              {currentTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {currentTags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {tag}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 ml-1 hover:bg-transparent"
                        onClick={() => removeTag(tag)}
                        disabled={isLoading}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Add new tag input */}
              <div className="flex gap-2">
                <FormControl>
                  <Input
                    placeholder="Add a tag..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isLoading}
                    className={cn(fieldState.error && 'border-destructive')}
                  />
                </FormControl>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addTag(newTag)}
                  disabled={isLoading || !newTag.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              <FormDescription className={descriptionStyles}>
                Add tags to categorize and filter your automations.
              </FormDescription>
              <FormMessage />
            </FormItem>
          );
        }}
      />
    </div>
  );
} 