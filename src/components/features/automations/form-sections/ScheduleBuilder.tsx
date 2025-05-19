'use client';

import React, { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parse as parseDateFns } from 'date-fns';

interface ScheduleBuilderProps {
    currentCronExpression: string;
    onCronExpressionChange: (newCronExpression: string) => void;
    disabled?: boolean;
}

const DAYS_OF_WEEK = [
    { id: '1', label: 'Mon' },
    { id: '2', label: 'Tue' },
    { id: '3', label: 'Wed' },
    { id: '4', label: 'Thu' },
    { id: '5', label: 'Fri' },
    { id: '6', label: 'Sat' },
    { id: '0', label: 'Sun' },
];

export function ScheduleBuilder({
    currentCronExpression,
    onCronExpressionChange,
    disabled,
}: ScheduleBuilderProps) {
    const [selectedTime, setSelectedTime] = useState<string>('09:00');
    const [selectedDays, setSelectedDays] = useState<string[]>(['1']);
    const [isTimePopoverOpen, setIsTimePopoverOpen] = useState(false);

    useEffect(() => {
        if (currentCronExpression) {
            const parts = currentCronExpression.split(' ');
            if (parts.length === 5) {
                const [minutePart, hourPart, , , dayOfWeekPart] = parts;
                if (/^([0-9]|[1-5][0-9])$/.test(minutePart) && /^([0-9]|1[0-9]|2[0-3])$/.test(hourPart)) {
                    setSelectedTime(`${hourPart.padStart(2, '0')}:${minutePart.padStart(2, '0')}`);
                }
                if (dayOfWeekPart && dayOfWeekPart !== '*') {
                    const days = dayOfWeekPart.split(',').filter(d => /^[0-6]$/.test(d));
                    if (days.length > 0) setSelectedDays(days);
                    else setSelectedDays([]);
                } else if (dayOfWeekPart === '*') {
                    setSelectedDays([]);
                }
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!selectedTime) return;

        const [hourStr, minuteStr] = selectedTime.split(':');
        const minutePart = parseInt(minuteStr, 10).toString();
        const hourPart = parseInt(hourStr, 10).toString();
        
        const sortedSelectedDays = [...selectedDays].sort((a,b) => parseInt(a) - parseInt(b));
        const dayOfWeekPart = sortedSelectedDays.length === 0 || sortedSelectedDays.length === 7 
                                ? '*' 
                                : sortedSelectedDays.join(',');

        const newCron = `${minutePart} ${hourPart} * * ${dayOfWeekPart}`;
        onCronExpressionChange(newCron);

    }, [selectedTime, selectedDays, onCronExpressionChange]);

    const handleTimeInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedTime(event.target.value);
    };

    return (
        <div className={cn("space-y-4 p-3 border rounded-md bg-muted/20", disabled && "opacity-70 pointer-events-none")}>
            <div>
                <Label className="text-xs mb-1 block">Time of Day</Label>
                <Popover open={isTimePopoverOpen} onOpenChange={setIsTimePopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={isTimePopoverOpen}
                            className={cn(
                                "w-[180px] justify-start text-left font-normal",
                                !selectedTime && "text-muted-foreground"
                            )}
                            disabled={disabled}
                        >
                            <Clock className="mr-2 h-4 w-4" />
                            {selectedTime 
                                ? format(parseDateFns(selectedTime, 'HH:mm', new Date()), 'h:mm a') 
                                : <span>Select time</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <div className="p-2">
                            <Input 
                                type="time"
                                value={selectedTime}
                                onChange={handleTimeInputChange}
                                disabled={disabled}
                                className="w-full"
                            />
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            <div>
                <Label className="text-xs mb-2 block">Day(s) of Week</Label>
                <ToggleGroup
                    type="multiple"
                    variant="outline"
                    value={selectedDays} 
                    onValueChange={(newSelectedDays: string[]) => {
                        setSelectedDays(newSelectedDays || []); 
                    }}
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
                    <p className="text-xs text-destructive mt-1">Select at least one day or it will run every day.</p>
                )}
            </div>
            
            <div className="mt-2">
                <p className="text-xs text-muted-foreground">
                    Runs at {selectedTime ? format(parseDateFns(selectedTime, 'HH:mm', new Date()), 'h:mm a') : "[select time]"} 
                    {selectedDays.length === 0 || selectedDays.length === 7 ? ' every day' : 
                     ' on ' + DAYS_OF_WEEK.filter(d => selectedDays.includes(d.id)).map(d=>d.label).join(', ')}
                    .
                </p>
             </div>
        </div>
    );
} 