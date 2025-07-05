'use client';

import React, { useCallback, useMemo } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage,
  FormDescription 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { 
  Sun, 
  Moon, 
  Clock, 
  Sunrise,
  Sunset 
} from 'lucide-react';
import type { AutomationFormValues } from '../AutomationForm';
import type { TimeOfDayFilter } from '@/lib/automation-schemas';

interface TimeOfDayFilterSectionProps {
  form: UseFormReturn<AutomationFormValues>;
  isLoading: boolean;
}

// Constants for better maintainability
const DEFAULT_START_TIME = '09:00';
const DEFAULT_END_TIME = '17:00';
const DEFAULT_OFFSET = 0;

// Filter type configurations for cleaner code
const FILTER_TYPES = [
  {
    value: 'any_time' as const,
    icon: Clock,
    label: 'Any Time',
    iconColor: 'text-muted-foreground'
  },
  {
    value: 'during_day' as const,
    icon: Sun,
    label: 'During Day',
    iconColor: 'text-yellow-500'
  },
  {
    value: 'at_night' as const,
    icon: Moon,
    label: 'At Night',
    iconColor: 'text-blue-400'
  },
  {
    value: 'specific_times' as const,
    icon: Clock,
    label: 'Specific Times',
    iconColor: 'text-green-500'
  }
] as const;

// Helper function to create filter configurations
const createFilterConfig = (type: TimeOfDayFilter['type']): TimeOfDayFilter => {
  switch (type) {
    case 'any_time':
      return { type: 'any_time' };
    case 'during_day':
      return { 
        type: 'during_day', 
        sunriseOffsetMinutes: DEFAULT_OFFSET, 
        sunsetOffsetMinutes: DEFAULT_OFFSET 
      };
    case 'at_night':
      return { 
        type: 'at_night', 
        sunsetOffsetMinutes: DEFAULT_OFFSET, 
        sunriseOffsetMinutes: DEFAULT_OFFSET 
      };
    case 'specific_times':
      return { 
        type: 'specific_times', 
        startTime: DEFAULT_START_TIME,
        endTime: DEFAULT_END_TIME
      };
    default:
      return { type: 'any_time' };
  }
};

export function TimeOfDayFilterSection({
  form,
  isLoading,
}: TimeOfDayFilterSectionProps) {
  
  const currentFilter = form.watch('config.trigger.timeOfDayFilter');
  
  // Optimized filter type change handler
  const handleFilterTypeChange = useCallback((value: string) => {
    const filterType = value as TimeOfDayFilter['type'];
    const newFilter = createFilterConfig(filterType);
    form.setValue('config.trigger.timeOfDayFilter', newFilter, { 
      shouldValidate: true, 
      shouldDirty: true 
    });
  }, [form]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Time-of-Day Filter
        </CardTitle>
        <FormDescription className="text-xs">
          Control when this automation can run based on the time of day. Uses sunrise/sunset data from location coordinates.
        </FormDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <FormField
          control={form.control}
          name="config.trigger.timeOfDayFilter.type"
          render={({ field }) => {
            const selectedFilterType = FILTER_TYPES.find(type => type.value === (field.value || 'any_time'));
            const SelectedIcon = selectedFilterType?.icon || Clock;
            
            return (
            <FormItem>
              <FormLabel>Filter Type</FormLabel>
              <FormControl>
                  <Select
                  value={field.value || 'any_time'}
                    onValueChange={handleFilterTypeChange}
                  disabled={isLoading}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          <SelectedIcon className={cn("h-4 w-4", selectedFilterType?.iconColor)} />
                          <span>{selectedFilterType?.label || 'Select filter type'}</span>
                  </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {FILTER_TYPES.map(({ value, icon: Icon, label, iconColor }) => (
                        <SelectItem key={value} value={value}>
                          <div className="flex items-center gap-2">
                            <Icon className={cn("h-4 w-4", iconColor)} />
                            <span>{label}</span>
                  </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
            );
          }}
        />

        {/* Fine-tune Solar Times */}
        {(currentFilter?.type === 'during_day' || currentFilter?.type === 'at_night') && (
          <div className="space-y-4 p-4 border rounded-md bg-muted/25">
            <div className="flex items-center gap-2 text-sm font-medium">
              {currentFilter.type === 'during_day' ? (
                <>
                  <Sun className="h-4 w-4 text-yellow-500" />
                  Fine-tune Daylight Hours
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 text-blue-400" />
                  Fine-tune Nighttime Hours
                </>
              )}
            </div>
            
            <FormDescription className="text-xs text-muted-foreground -mt-2">
              Adjust when {currentFilter.type === 'during_day' ? 'daylight' : 'nighttime'} begins and ends for this automation
            </FormDescription>
            
            <div className="grid grid-cols-2 gap-4">
              {/* For "during_day": Sunrise = Start, Sunset = End */}
              {/* For "at_night": Sunset = Start, Sunrise = End */}
              {/* Always show Start Time first, then End Time */}
              
              {currentFilter.type === 'during_day' ? (
                <>
                  {/* Start Time: Sunrise */}
                  <FormField
                    control={form.control}
                    name="config.trigger.timeOfDayFilter.sunriseOffsetMinutes"
                    render={({ field }) => {
                      const currentValue = field.value || 0;
                      const canDecrease = currentValue > -240;
                      const canIncrease = currentValue < 240;
                      
                      const handleDecrement = () => {
                        const newValue = Math.max(-240, currentValue - 15);
                        field.onChange(newValue);
                      };
                      
                      const handleIncrement = () => {
                        const newValue = Math.min(240, currentValue + 15);
                        field.onChange(newValue);
                      };
                      
                      const formatUnifiedValue = (minutes: number) => {
                        if (minutes === 0) return 'At sunrise';
                        const absMinutes = Math.abs(minutes);
                        const hours = Math.floor(absMinutes / 60);
                        const mins = absMinutes % 60;
                        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                        return minutes > 0 ? `${timeStr} after sunrise` : `${timeStr} before sunrise`;
                      };
                      
                      return (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5 text-sm">
                            <Sunrise className="h-3.5 w-3.5 text-amber-500" />
                            Start Time
                          </FormLabel>
                          <div className="relative">
                            <Input
                              type="text"
                              value={formatUnifiedValue(currentValue)}
                              readOnly
                              className="pr-16 text-center text-sm"
                            />
                            <div className="absolute right-1 inset-y-0 flex items-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={handleDecrement}
                                disabled={isLoading || !canDecrease}
                              >
                                <span className="text-sm">−</span>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={handleIncrement}
                                disabled={isLoading || !canIncrease}
                              >
                                <span className="text-sm">+</span>
                              </Button>
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  {/* End Time: Sunset */}
                  <FormField
                    control={form.control}
                    name="config.trigger.timeOfDayFilter.sunsetOffsetMinutes"
                    render={({ field }) => {
                      const currentValue = field.value || 0;
                      const canDecrease = currentValue > -240;
                      const canIncrease = currentValue < 240;
                      
                      const handleDecrement = () => {
                        const newValue = Math.max(-240, currentValue - 15);
                        field.onChange(newValue);
                      };
                      
                      const handleIncrement = () => {
                        const newValue = Math.min(240, currentValue + 15);
                        field.onChange(newValue);
                      };
                      
                      const formatUnifiedValue = (minutes: number) => {
                        if (minutes === 0) return 'At sunset';
                        const absMinutes = Math.abs(minutes);
                        const hours = Math.floor(absMinutes / 60);
                        const mins = absMinutes % 60;
                        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                        return minutes > 0 ? `${timeStr} after sunset` : `${timeStr} before sunset`;
                      };
                      
                      return (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5 text-sm">
                            <Sunset className="h-3.5 w-3.5 text-orange-500" />
                            End Time
                          </FormLabel>
                          <div className="relative">
                            <Input
                              type="text"
                              value={formatUnifiedValue(currentValue)}
                              readOnly
                              className="pr-16 text-center text-sm"
                            />
                            <div className="absolute right-1 inset-y-0 flex items-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={handleDecrement}
                                disabled={isLoading || !canDecrease}
                              >
                                <span className="text-sm">−</span>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={handleIncrement}
                                disabled={isLoading || !canIncrease}
                              >
                                <span className="text-sm">+</span>
                              </Button>
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </>
              ) : (
                <>
                  {/* Start Time: Sunset (for nighttime) */}
                  <FormField
                    control={form.control}
                    name="config.trigger.timeOfDayFilter.sunsetOffsetMinutes"
                    render={({ field }) => {
                      const currentValue = field.value || 0;
                      const canDecrease = currentValue > -240;
                      const canIncrease = currentValue < 240;
                      
                      const handleDecrement = () => {
                        const newValue = Math.max(-240, currentValue - 15);
                        field.onChange(newValue);
                      };
                      
                      const handleIncrement = () => {
                        const newValue = Math.min(240, currentValue + 15);
                        field.onChange(newValue);
                      };
                      
                      const formatUnifiedValue = (minutes: number) => {
                        if (minutes === 0) return 'At sunset';
                        const absMinutes = Math.abs(minutes);
                        const hours = Math.floor(absMinutes / 60);
                        const mins = absMinutes % 60;
                        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                        return minutes > 0 ? `${timeStr} after sunset` : `${timeStr} before sunset`;
                      };
                      
                      return (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5 text-sm">
                            <Sunset className="h-3.5 w-3.5 text-orange-500" />
                            Start Time
                          </FormLabel>
                          <div className="relative">
                            <Input
                              type="text"
                              value={formatUnifiedValue(currentValue)}
                              readOnly
                              className="pr-16 text-center text-sm"
                            />
                            <div className="absolute right-1 inset-y-0 flex items-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={handleDecrement}
                                disabled={isLoading || !canDecrease}
                              >
                                <span className="text-sm">−</span>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={handleIncrement}
                                disabled={isLoading || !canIncrease}
                              >
                                <span className="text-sm">+</span>
                              </Button>
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  {/* End Time: Sunrise (for nighttime) */}
                  <FormField
                    control={form.control}
                    name="config.trigger.timeOfDayFilter.sunriseOffsetMinutes"
                    render={({ field }) => {
                      const currentValue = field.value || 0;
                      const canDecrease = currentValue > -240;
                      const canIncrease = currentValue < 240;
                      
                      const handleDecrement = () => {
                        const newValue = Math.max(-240, currentValue - 15);
                        field.onChange(newValue);
                      };
                      
                      const handleIncrement = () => {
                        const newValue = Math.min(240, currentValue + 15);
                        field.onChange(newValue);
                      };
                      
                      const formatUnifiedValue = (minutes: number) => {
                        if (minutes === 0) return 'At sunrise';
                        const absMinutes = Math.abs(minutes);
                        const hours = Math.floor(absMinutes / 60);
                        const mins = absMinutes % 60;
                        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                        return minutes > 0 ? `${timeStr} after sunrise` : `${timeStr} before sunrise`;
                      };
                      
                      return (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5 text-sm">
                            <Sunrise className="h-3.5 w-3.5 text-amber-500" />
                            End Time
                          </FormLabel>
                          <div className="relative">
                            <Input
                              type="text"
                              value={formatUnifiedValue(currentValue)}
                              readOnly
                              className="pr-16 text-center text-sm"
                            />
                            <div className="absolute right-1 inset-y-0 flex items-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={handleDecrement}
                                disabled={isLoading || !canDecrease}
                              >
                                <span className="text-sm">−</span>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={handleIncrement}
                                disabled={isLoading || !canIncrease}
                              >
                                <span className="text-sm">+</span>
                              </Button>
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </>
              )}
            </div>
            
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              <strong>Note:</strong> Times adjust in 15-minute increments. Use the <strong>+</strong> and <strong>−</strong> buttons to fine-tune when daylight/nighttime begins and ends for this automation.
            </div>
          </div>
        )}

        {/* Specific Time Range */}
        {currentFilter?.type === 'specific_times' && (
          <div className="space-y-4 p-4 border rounded-md bg-muted/25">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 text-green-500" />
              Time Range
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="config.trigger.timeOfDayFilter.startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        value={field.value || DEFAULT_START_TIME}
                        onChange={field.onChange}
                        disabled={isLoading}
                        className="text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.trigger.timeOfDayFilter.endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        value={field.value || DEFAULT_END_TIME}
                        onChange={field.onChange}
                        disabled={isLoading}
                        className="text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 