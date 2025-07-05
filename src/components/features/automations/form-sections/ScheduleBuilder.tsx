'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormDescription } from '@/components/ui/form';
import { Clock, Sunrise, Sunset, Info, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScheduleBuilderProps {
    scheduleType: 'fixed_time' | 'sunrise' | 'sunset';
    onScheduleTypeChange: (scheduleType: 'fixed_time' | 'sunrise' | 'sunset') => void;
    
    // For fixed_time schedules
    cronExpression?: string;
    onCronExpressionChange: (newCronExpression: string) => void;
    
    // For sunrise/sunset schedules
    offsetMinutes?: number;
    onOffsetChange: (offsetMinutes: number) => void;
    
    disabled?: boolean;
    locationScope?: { id: string; name: string } | null;
}

const DAYS_OF_WEEK = [
    { id: '1', label: 'Mon' },
    { id: '2', label: 'Tue' },
    { id: '3', label: 'Wed' },
    { id: '4', label: 'Thu' },
    { id: '5', label: 'Fri' },
    { id: '6', label: 'Sat' },
    { id: '0', label: 'Sun' },
] as const;

// Helper function to ensure a default cron expression
const ensureDefaultCron = (cron?: string | null): string => {
    return cron && cron.trim() !== "" ? cron : '0 9 * * 1';
};

// Helper function to parse CRON expression
const parseCronExpression = (cronExpression: string) => {
    const parts = cronExpression.split(' ');
    if (parts.length === 5) {
        const [minutePart, hourPart, , , dayOfWeekPart] = parts;
        
        // Validate and parse time components
        if (/^([0-9]|[1-5][0-9])$/.test(minutePart) && /^([0-9]|1[0-9]|2[0-3])$/.test(hourPart)) {
            const time = `${hourPart.padStart(2, '0')}:${minutePart.padStart(2, '0')}`;
            
            // Parse days
            let days: string[] = [];
            if (dayOfWeekPart && dayOfWeekPart !== '*') {
                days = dayOfWeekPart.split(',').filter(d => /^[0-6]$/.test(d));
            }
            
            return { time, days };
        }
    }
    return null;
};

// Helper function to build CRON expression
const buildCronExpression = (time: string, days: string[]): string => {
    const [hourStr, minuteStr] = time.split(':');
    const minutePart = parseInt(minuteStr, 10).toString();
    const hourPart = parseInt(hourStr, 10).toString();
    
    const sortedDays = [...days].sort((a, b) => parseInt(a) - parseInt(b));
    const dayOfWeekPart = sortedDays.length === 0 || sortedDays.length === 7 
        ? '*' 
        : sortedDays.join(',');

    return `${minutePart} ${hourPart} * * ${dayOfWeekPart}`;
};

export function ScheduleBuilder({
    scheduleType,
    onScheduleTypeChange,
    cronExpression,
    onCronExpressionChange,
    offsetMinutes = 0,
    onOffsetChange,
    disabled,
    locationScope,
}: ScheduleBuilderProps) {
    // State for fixed_time schedule
    const [selectedTime, setSelectedTime] = useState<string>('09:00');
    const [selectedDays, setSelectedDays] = useState<string[]>(['1']);

    // Parse CRON expression on mount and when it changes
    const parsedCron = useMemo(() => {
        if (cronExpression && scheduleType === 'fixed_time') {
            return parseCronExpression(cronExpression);
        }
        return null;
    }, [cronExpression, scheduleType]);

    // Initialize state from CRON expression
    useEffect(() => {
        if (parsedCron) {
            setSelectedTime(parsedCron.time);
            setSelectedDays(parsedCron.days);
        }
    }, [parsedCron]);

    // Memoized CRON expression builder
    const handleTimeOrDaysChange = useCallback((newTime?: string, newDays?: string[]) => {
        if (scheduleType === 'fixed_time') {
            const time = newTime ?? selectedTime;
            const days = newDays ?? selectedDays;
            
            if (time) {
                const newCron = buildCronExpression(time, days);
                onCronExpressionChange(newCron);
            }
        }
    }, [scheduleType, selectedTime, selectedDays, onCronExpressionChange]);

    // Optimized event handlers
    const handleTimeInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const newTime = event.target.value;
        setSelectedTime(newTime);
        handleTimeOrDaysChange(newTime, undefined);
    }, [handleTimeOrDaysChange]);

    const handleDaysChange = useCallback((newSelectedDays: string[]) => {
        const days = newSelectedDays || [];
        setSelectedDays(days);
        handleTimeOrDaysChange(undefined, days);
    }, [handleTimeOrDaysChange]);

    // Stepper functions for offset
    const handleOffsetIncrement = useCallback(() => {
        const newValue = Math.min(240, offsetMinutes + 15);
        onOffsetChange(newValue);
    }, [offsetMinutes, onOffsetChange]);

    const handleOffsetDecrement = useCallback(() => {
        const newValue = Math.max(-240, offsetMinutes - 15);
        onOffsetChange(newValue);
    }, [offsetMinutes, onOffsetChange]);

    // Format offset for display
    const formatOffset = useCallback((minutes: number): string => {
        if (minutes === 0) return 'Exactly at';
        const absMinutes = Math.abs(minutes);
        const direction = minutes > 0 ? 'after' : 'before';
        
        if (absMinutes < 60) {
            return `${absMinutes}m ${direction}`;
        } else {
            const hours = Math.floor(absMinutes / 60);
            const remainingMinutes = absMinutes % 60;
            if (remainingMinutes === 0) {
                return `${hours}h ${direction}`;
            } else {
                return `${hours}h ${remainingMinutes}m ${direction}`;
            }
        }
    }, []);

    return (
        <div className={cn("space-y-4", disabled && "opacity-70 pointer-events-none")}>
            {/* Schedule Type Selection */}
            <div className="space-y-3">
                <Label className="text-sm font-medium">Schedule Type</Label>
                <ToggleGroup
                    type="single"
                    variant="outline"
                    value={scheduleType}
                    onValueChange={onScheduleTypeChange}
                    disabled={disabled}
                    className="grid grid-cols-3 gap-2"
                >
                    <ToggleGroupItem 
                        value="fixed_time" 
                        className="flex items-center gap-2 px-3 py-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    >
                        <Clock className="h-4 w-4" />
                        <span className="text-xs">Fixed Time</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem 
                        value="sunrise" 
                        className="flex items-center gap-2 px-3 py-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    >
                        <Sunrise className="h-4 w-4" />
                        <span className="text-xs">Sunrise</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem 
                        value="sunset" 
                        className="flex items-center gap-2 px-3 py-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    >
                        <Sunset className="h-4 w-4" />
                        <span className="text-xs">Sunset</span>
                    </ToggleGroupItem>
                </ToggleGroup>
            </div>

            {/* Schedule Configuration */}
            <Card className="border-dashed">
                <CardContent className="pt-4">
                    {scheduleType === 'fixed_time' && (
                        <div className="space-y-4">
                            {/* Time Selection - Simplified */}
                            <div>
                                <Label className="text-xs mb-2 block">Time of Day</Label>
                                <Input
                                    type="time"
                                    value={selectedTime}
                                    onChange={handleTimeInputChange}
                                    disabled={disabled}
                                    className="w-[180px]"
                                />
                            </div>

                            {/* Days Selection */}
                            <div>
                                <Label className="text-xs mb-2 block">Day(s) of Week</Label>
                                <ToggleGroup
                                    type="multiple"
                                    variant="outline"
                                    value={selectedDays} 
                                    onValueChange={handleDaysChange}
                                    className="flex flex-wrap gap-1 justify-start"
                                    disabled={disabled}
                                >
                                    {DAYS_OF_WEEK.map(day => (
                                        <ToggleGroupItem 
                                            key={day.id} 
                                            value={day.id} 
                                            aria-label={day.label}
                                            className="px-3 py-1.5 h-auto text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                                        >
                                            {day.label}
                                        </ToggleGroupItem>
                                    ))}
                                </ToggleGroup>
                                {selectedDays.length === 0 && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        No days selected - will run every day.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {(scheduleType === 'sunrise' || scheduleType === 'sunset') && (
                        <div className="space-y-4">
                            {/* Offset Configuration with Steppers */}
                            <div>
                                <Label className="text-xs mb-2 block flex items-center gap-1">
                                    {scheduleType === 'sunrise' ? (
                                        <Sunrise className="h-3 w-3" />
                                    ) : (
                                        <Sunset className="h-3 w-3" />
                                    )}
                                    Time Offset
                                </Label>
                                <div className="relative">
                                    <Input
                                        type="text"
                                        value={`${formatOffset(offsetMinutes)} ${scheduleType}`}
                                        readOnly
                                        className="pr-16 text-center"
                                    />
                                    <div className="absolute right-1 inset-y-0 flex items-center">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            onClick={handleOffsetDecrement}
                                            disabled={disabled || offsetMinutes <= -240}
                                        >
                                            <Minus className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            onClick={handleOffsetIncrement}
                                            disabled={disabled || offsetMinutes >= 240}
                                        >
                                            <Plus className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                                <FormDescription className="text-xs mt-1">
                                    Adjust in 15-minute increments (±4 hours max)
                                </FormDescription>
                            </div>

                            {/* Location Context */}
                            {locationScope ? (
                                <div className="p-3 bg-muted/50 rounded-md">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Info className="h-3 w-3" />
                                        <span>Uses sun times for <strong>{locationScope.name}</strong></span>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md dark:bg-yellow-900/20 dark:border-yellow-700/50">
                                    <div className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-300">
                                        <Info className="h-3 w-3" />
                                        <span>Requires location scope to be set for accurate sun times</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
} 