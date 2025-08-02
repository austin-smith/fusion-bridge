'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Clock, ChevronDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth } from 'date-fns';

export type TimeFilterValue = 'all' | 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'custom';

/**
 * Type guard to validate TimeFilterValue
 */
export function isTimeFilterValue(value: unknown): value is TimeFilterValue {
  return typeof value === 'string' && 
    ['all', 'today', 'yesterday', 'last7days', 'last30days', 'thisMonth', 'custom'].includes(value);
}

interface TimeFilterDropdownProps {
  value: TimeFilterValue;
  timeStart: string | null;
  timeEnd: string | null;
  onChange: (filter: TimeFilterValue) => void;
  onTimeStartChange: (date: string | null) => void;
  onTimeEndChange: (date: string | null) => void;
  className?: string;
}

// Export the display text function for reuse
export function getTimeFilterDisplayText(
  filter: TimeFilterValue,
  timeStart?: string | null,
  timeEnd?: string | null
): string {
  if (filter === 'custom' && timeStart && timeEnd) {
    const startDate = new Date(timeStart);
    const endDate = new Date(timeEnd);
    return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
  }
  
  switch (filter) {
    case 'all': return 'All Time';
    case 'today': return 'Today';
    case 'yesterday': return 'Yesterday';
    case 'last7days': return 'Last 7 Days';
    case 'last30days': return 'Last 30 Days';
    case 'thisMonth': return 'This Month';
    case 'custom': return 'Custom';
    default: return 'All Time';
  }
}

// Export the date range calculation function for reuse
export function calculateDateRangeForFilter(filter: TimeFilterValue): { start: string | null; end: string | null } {
  const now = new Date();
  
  switch (filter) {
    case 'all':
      return { start: null, end: null };
    case 'today':
      return {
        start: startOfDay(now).toISOString(),
        end: endOfDay(now).toISOString()
      };
    case 'yesterday':
      const yesterday = subDays(now, 1);
      return {
        start: startOfDay(yesterday).toISOString(),
        end: endOfDay(yesterday).toISOString()
      };
    case 'last7days':
      return {
        start: startOfDay(subDays(now, 7)).toISOString(),
        end: endOfDay(now).toISOString()
      };
    case 'last30days':
      return {
        start: startOfDay(subDays(now, 30)).toISOString(),
        end: endOfDay(now).toISOString()
      };
    case 'thisMonth':
      return {
        start: startOfMonth(now).toISOString(),
        end: endOfMonth(now).toISOString()
      };
    default:
      return { start: null, end: null };
  }
}

export function TimeFilterDropdown({
  value,
  timeStart,
  timeEnd,
  onChange,
  onTimeStartChange,
  onTimeEndChange,
  className
}: TimeFilterDropdownProps) {
  const [isCustomPopoverOpen, setIsCustomPopoverOpen] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const getDisplayText = () => {
    return getTimeFilterDisplayText(value, timeStart, timeEnd);
  };

  const getTooltipText = () => {
    if (value === 'custom' && timeStart && timeEnd) {
      return `${format(new Date(timeStart), 'MMM d, yyyy')} - ${format(new Date(timeEnd), 'MMM d, yyyy')}`;
    }
    return null;
  };

  const handlePresetClick = (preset: typeof value) => {
    const { start, end } = calculateDateRangeForFilter(preset);
    onTimeStartChange(start);
    onTimeEndChange(end);
    onChange(preset);
  };

  const handleCustomRangeClick = () => {
    setIsCustomPopoverOpen(true);
    // Pre-populate with current values if they exist, otherwise use sensible defaults
    if (timeStart && timeEnd) {
      setCustomStart(format(new Date(timeStart), 'yyyy-MM-dd'));
      setCustomEnd(format(new Date(timeEnd), 'yyyy-MM-dd'));
    } else {
      // Default to today for both dates
      const today = format(new Date(), 'yyyy-MM-dd');
      setCustomStart(today);
      setCustomEnd(today);
    }
  };

  const applyCustomRange = () => {
    if (customStart && customEnd) {
      const startDate = new Date(customStart);
      const endDate = new Date(customEnd);
      
      onTimeStartChange(startOfDay(startDate).toISOString());
      onTimeEndChange(endOfDay(endDate).toISOString());
      onChange('custom');
      setIsCustomPopoverOpen(false);
    }
  };

  const tooltipText = getTooltipText();

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={className || "w-full sm:w-[160px] h-9 justify-between"}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Clock className="h-4 w-4 flex-shrink-0" />
            {tooltipText ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="truncate text-sm cursor-pointer">
                      {getDisplayText()}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{tooltipText}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="truncate text-sm">
                {getDisplayText()}
              </span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Time Range</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem 
          checked={value === 'all'}
          onCheckedChange={() => handlePresetClick('all')}
          onSelect={(e) => e.preventDefault()}
        >
          All Time
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem 
          checked={value === 'today'}
          onCheckedChange={() => handlePresetClick('today')}
          onSelect={(e) => e.preventDefault()}
        >
          Today
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem 
          checked={value === 'yesterday'}
          onCheckedChange={() => handlePresetClick('yesterday')}
          onSelect={(e) => e.preventDefault()}
        >
          Yesterday
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem 
          checked={value === 'last7days'}
          onCheckedChange={() => handlePresetClick('last7days')}
          onSelect={(e) => e.preventDefault()}
        >
          Last 7 Days
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem 
          checked={value === 'last30days'}
          onCheckedChange={() => handlePresetClick('last30days')}
          onSelect={(e) => e.preventDefault()}
        >
          Last 30 Days
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem 
          checked={value === 'thisMonth'}
          onCheckedChange={() => handlePresetClick('thisMonth')}
          onSelect={(e) => e.preventDefault()}
        >
          This Month
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <Popover open={isCustomPopoverOpen} onOpenChange={setIsCustomPopoverOpen}>
          <PopoverTrigger asChild>
            <DropdownMenuCheckboxItem 
              checked={value === 'custom'}
              onSelect={(e) => {
                e.preventDefault();
                handleCustomRangeClick();
              }}
            >
              Custom Range...
            </DropdownMenuCheckboxItem>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" side="right" align="start" onInteractOutside={(e) => e.preventDefault()}>
            <div className="space-y-4">
              <div className="text-sm font-medium">Custom Date Range</div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Start Date</label>
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">End Date</label>
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              
              <div className="flex gap-2 pt-2">
                <Button 
                  onClick={applyCustomRange}
                  disabled={!customStart || !customEnd}
                  size="sm" 
                  className="flex-1"
                >
                  Apply Range
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setIsCustomPopoverOpen(false)}
                  size="sm" 
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </DropdownMenuContent>
    </DropdownMenu>
  </>
  );
} 