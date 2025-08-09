'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronsUpDown, Check as CheckIcon, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getIconComponentByName } from '@/lib/mappings/presentation';

export type DeviceSelectorComboOption = {
  id: string;
  name: string;
  iconName: string;
  locationId?: string | null;
  spaceId?: string | null;
};

export function DeviceSelectorCombo({
  value,
  onChange,
  disabled = false,
  devices,
  allLocations,
  allSpaces,
  placeholder,
  widthClass = 'w-[300px]',
  error = false,
  showIcon = true,
}: {
  value?: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  devices: DeviceSelectorComboOption[];
  allLocations: any[];
  allSpaces: any[];
  placeholder: string;
  widthClass?: string;
  error?: boolean;
  showIcon?: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  const selected = devices.find((d) => d.id === value) || null;
  const selectedLocation = selected ? allLocations?.find((loc: any) => loc.id === selected.locationId) : null;
  const selectedSpace = selected ? allSpaces?.find((sp: any) => sp.id === selected.spaceId) : null;
  const selectedHierarchy = selectedLocation?.name
    ? selectedSpace?.name
      ? `${selectedLocation.name} › ${selectedSpace.name}`
      : selectedLocation.name
    : selectedSpace?.name || '';
  const SelectedIcon = selected ? getIconComponentByName(selected.iconName) || HelpCircle : HelpCircle;

  return (
    <Popover open={open && !disabled} onOpenChange={(newOpen) => !disabled && setOpen(newOpen)}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(`${widthClass} h-12 py-2 px-3 justify-between text-left`, error && 'border-destructive')}
          disabled={disabled}
        >
          <span className="flex items-start gap-2 overflow-hidden text-left">
            {showIcon && <SelectedIcon className="self-center h-4 w-4 text-muted-foreground" aria-hidden="true" />}
            <span className="flex min-w-0 flex-col text-left">
              <span className="truncate text-[13px] leading-5 font-medium">{selected ? selected.name : placeholder}</span>
              {selected && selectedHierarchy && (
                <span className="truncate text-[11px] leading-4 text-muted-foreground">{selectedHierarchy}</span>
              )}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 self-center" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('p-0', widthClass)} align="start">
        <Command>
          <CommandInput placeholder="Search devices..." className="h-9" disabled={disabled} />
          <CommandList>
            <CommandEmpty>No devices found.</CommandEmpty>
            <CommandGroup>
              {devices.map((device) => {
                const location = allLocations?.find((loc: any) => loc.id === device.locationId);
                const space = allSpaces?.find((sp: any) => sp.id === device.spaceId);
                const hierarchy = location?.name ? (space?.name ? `${location.name} › ${space.name}` : location.name) : space?.name || '';
                const DeviceIcon = getIconComponentByName(device.iconName) || HelpCircle;
                return (
                  <CommandItem
                    key={device.id}
                    value={`${hierarchy ? `${hierarchy} › ` : ''}${device.name}`}
                    onSelect={() => {
                      onChange(device.id);
                      setOpen(false);
                    }}
                  >
                    <CheckIcon className={cn('mr-2 h-4 w-4', value === device.id ? 'opacity-100' : 'opacity-0')} />
                    {showIcon && <DeviceIcon className="mr-2 h-4 w-4 text-muted-foreground" />}
                    <div className="flex flex-col min-w-0 py-0.5">
                      <span className="truncate text-[13px] leading-5 font-medium">{device.name}</span>
                      {hierarchy && <span className="truncate text-[11px] leading-4 text-muted-foreground">{hierarchy}</span>}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}


