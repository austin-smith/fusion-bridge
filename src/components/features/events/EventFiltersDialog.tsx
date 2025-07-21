'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Filter, ChevronDown, Plug, CircleX } from 'lucide-react';
import { ConnectorIcon } from '@/components/features/connectors/connector-icon';
import { formatConnectorCategory } from '@/lib/utils';
import { LocationSpaceSelector } from '@/components/common/LocationSpaceSelector';
import { TimeFilterDropdown } from '@/components/features/events/TimeFilterDropdown';
import { EVENT_CATEGORY_DISPLAY_MAP } from '@/lib/mappings/definitions';
import type { Location, Space } from '@/types';

interface EventFiltersDialogProps {
  // Location/Space filters
  locationFilter: string;
  spaceFilter: string;
  locationSpaceSearchTerm: string;
  locations: Location[];
  spaces: Space[];
  onLocationChange: (value: string) => void;
  onSpaceChange: (value: string) => void;
  onLocationSpaceSearchChange: (value: string) => void;
  
  // Connector category filter
  connectorCategoryFilter: string;
  connectorCategories: string[];
  onConnectorCategoryChange: (value: string) => void;
  
  // Event category filters
  eventCategoryFilter: string[];
  alarmEventsOnly: boolean;
  onEventCategoryChange: (categories: string[]) => void;
  onAlarmEventsOnlyChange: (value: boolean) => void;
  
  // Time filters
  timeFilter: 'all' | 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'custom';
  timeStart: string | null;
  timeEnd: string | null;
  onTimeFilterChange: (value: 'all' | 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'custom') => void;
  onTimeStartChange: (value: string | null) => void;
  onTimeEndChange: (value: string | null) => void;
  
  // Actions
  onResetFilters: () => void;
}

export function EventFiltersDialog({
  locationFilter,
  spaceFilter,
  locationSpaceSearchTerm,
  locations,
  spaces,
  onLocationChange,
  onSpaceChange,
  onLocationSpaceSearchChange,
  connectorCategoryFilter,
  connectorCategories,
  onConnectorCategoryChange,
  eventCategoryFilter,
  alarmEventsOnly,
  onEventCategoryChange,
  onAlarmEventsOnlyChange,
  timeFilter,
  timeStart,
  timeEnd,
  onTimeFilterChange,
  onTimeStartChange,
  onTimeEndChange,
  onResetFilters,
}: EventFiltersDialogProps) {


  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Filter className="h-4 w-4" />
          <span>Filters</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] w-full max-h-[90vh] overflow-y-auto sm:max-w-[525px] sm:max-h-none sm:overflow-visible rounded-lg">
        <DialogHeader>
          <DialogTitle>Event Filters</DialogTitle>
          <DialogDescription>
            Filter events by location, connector type, categories, and time range.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Location/Space Filter */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Location & Space</h4>
            <LocationSpaceSelector
              locationFilter={locationFilter}
              spaceFilter={spaceFilter}
              searchTerm={locationSpaceSearchTerm}
              locations={locations}
              spaces={spaces}
              onLocationChange={onLocationChange}
              onSpaceChange={onSpaceChange}
              onSearchChange={onLocationSpaceSearchChange}
            />
          </div>

          {/* Connector Category Filter */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Connector Type</h4>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <div className="flex items-center gap-2">
                    {connectorCategoryFilter === 'all' ? (
                      <Plug className="h-4 w-4" />
                    ) : (
                      <ConnectorIcon connectorCategory={connectorCategoryFilter} size={16} />
                    )}
                    <span>
                      {connectorCategoryFilter === 'all' 
                        ? 'All' 
                        : formatConnectorCategory(connectorCategoryFilter)}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-full">
                <DropdownMenuItem onClick={() => onConnectorCategoryChange('all')}>
                  <div className="flex items-center gap-2">
                    <Plug className="h-4 w-4" />
                    All
                  </div>
                </DropdownMenuItem>
                {connectorCategories.map((category: string) => (
                  <DropdownMenuItem 
                    key={category} 
                    onClick={() => onConnectorCategoryChange(category)}
                  >
                    <div className="flex items-center gap-2">
                      <ConnectorIcon connectorCategory={category} size={16} />
                      <span>{formatConnectorCategory(category)}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Event Categories Filter */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Event Categories</h4>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span>
                    Categories ({eventCategoryFilter.length === Object.keys(EVENT_CATEGORY_DISPLAY_MAP).length
                      ? 'All' 
                      : eventCategoryFilter.length})
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-full">
                <DropdownMenuCheckboxItem
                  checked={alarmEventsOnly}
                  onCheckedChange={onAlarmEventsOnlyChange}
                  onSelect={(e) => e.preventDefault()}
                >
                  Alarm events only
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Event Categories</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {Object.entries(EVENT_CATEGORY_DISPLAY_MAP).map(([categoryKey, displayName]) => (
                  <DropdownMenuCheckboxItem
                    key={categoryKey}
                    checked={eventCategoryFilter.includes(categoryKey)}
                    onCheckedChange={(checked) => {
                      const newCategories = checked 
                        ? [...eventCategoryFilter, categoryKey] 
                        : eventCategoryFilter.filter((item: string) => item !== categoryKey);
                      onEventCategoryChange(newCategories);
                    }}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {displayName}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Time Filter */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Time Range</h4>
            <TimeFilterDropdown
              value={timeFilter}
              timeStart={timeStart}
              timeEnd={timeEnd}
              onChange={onTimeFilterChange}
              onTimeStartChange={onTimeStartChange}
              onTimeEndChange={onTimeEndChange}
            />
          </div>


        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button 
            variant="outline" 
            onClick={() => {
              onResetFilters();
            }}
          >
            <CircleX className="h-4 w-4" />
            Reset Filters
          </Button>
          <DialogClose asChild>
            <Button variant="default">Apply Filters</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
} 