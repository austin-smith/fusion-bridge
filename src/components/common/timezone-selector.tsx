'use client';

import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTimezonesForCountry, type Timezone as LibTimezone } from 'countries-and-timezones';

// Interface for the options we derive for the selector
interface TimezoneDisplayOption {
    name: string;                // IANA name, e.g., America/New_York
    displayName: string;         // e.g., "America/New York"
    offsetLabel: string;         // e.g., "(UTC-05:00)" - current offset accounting for DST
    sortLabel: string;           // Combined string for sorting: "America/New York (UTC-05:00)"
}

interface TimezoneSelectorProps {
  value?: string; // Current IANA timezone name
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Determines if a timezone is currently observing daylight saving time
 * by comparing current timezone offset with January offset (standard time)
 */
function isCurrentlyDST(timezoneName: string): boolean {
  try {
    const now = new Date();
    const jan = new Date(now.getFullYear(), 0, 1); // January 1st (standard time)
    
    // Get timezone offset in minutes for current date and January
    const getCurrentOffset = (date: Date) => {
      const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
      const local = new Date(date.toLocaleString('en-US', { timeZone: timezoneName }));
      return (utc.getTime() - local.getTime()) / (1000 * 60); // Convert to minutes
    };
    
    const currentOffset = getCurrentOffset(now);
    const janOffset = getCurrentOffset(jan);
    
    // If current offset differs from January offset, we're in DST
    return currentOffset !== janOffset;
  } catch (error) {
    console.warn(`Error checking DST for ${timezoneName}:`, error);
    return false;
  }
}

/**
 * Gets the current offset string for a timezone, accounting for DST
 */
function getCurrentOffsetString(timezone: LibTimezone): string {
  // If the timezone doesn't observe DST, use the standard offset
  if (timezone.utcOffset === timezone.dstOffset) {
    return timezone.utcOffsetStr;
  }
  
  // Check if we're currently in DST for this timezone
  const isDST = isCurrentlyDST(timezone.name);
  
  // Return the appropriate offset
  return isDST ? timezone.dstOffsetStr : timezone.utcOffsetStr;
}

export const TimezoneSelector: React.FC<TimezoneSelectorProps> = ({
  value,
  onChange,
  disabled,
  placeholder = "Select a time zone...",
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const timezones: TimezoneDisplayOption[] = useMemo(() => {
    // Get US timezones, consistent with location-edit-dialog.tsx
    const usTimezones: LibTimezone[] = getTimezonesForCountry('US');
    
    // Map to objects with current offset accounting for DST
    return usTimezones
        .map((tz: LibTimezone) => {
            const displayName = tz.name.replace(/_/g, ' ');
            const offsetLabel = `(UTC${getCurrentOffsetString(tz)})`;
            return {
                name: tz.name,
                displayName,
                offsetLabel,
                sortLabel: `${displayName} ${offsetLabel}`
            };
        })
        .sort((a: TimezoneDisplayOption, b: TimezoneDisplayOption) => a.sortLabel.localeCompare(b.sortLabel));
  }, []);

  const selectedTimezone = timezones.find((tz: TimezoneDisplayOption) => tz.name === value);

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={popoverOpen}
          className={cn(
            "w-full justify-between",
            !value && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <span className="truncate flex items-baseline">
            {selectedTimezone ? (
              <>
                <span>{selectedTimezone.displayName}</span>
                <span className="text-xs text-muted-foreground ml-1">{selectedTimezone.offsetLabel}</span>
              </>
            ) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-(--radix-popover-trigger-width) max-h-(--radix-popover-content-available-height) p-0"
        onWheel={(e) => e.stopPropagation()} 
      >
        <Command>
          <CommandInput placeholder="Search time zone..." />
          <CommandList className="flex-1 max-h-none">
            <ScrollArea className="h-72">
              <CommandEmpty>No time zone found.</CommandEmpty>
              <CommandGroup>
                {timezones.map((tz: TimezoneDisplayOption) => (
                  <CommandItem
                    value={tz.name}
                    key={tz.name}
                    className="flex items-center justify-between"
                    onSelect={() => {
                      onChange(tz.name);
                      setPopoverOpen(false);
                    }}
                  >
                    <div className="flex items-center">
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          tz.name === value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span>{tz.displayName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{tz.offsetLabel}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}; 