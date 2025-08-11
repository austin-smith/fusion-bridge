'use client';

import React from 'react';
import { Building, Box } from 'lucide-react';
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Location, Space } from '@/types/index';

interface LocationSpaceSelectorProps {
  locationFilter: string;
  spaceFilter: string;
  searchTerm: string;
  locations: Location[];
  spaces: Space[];
  onLocationChange: (locationId: string) => void;
  onSpaceChange: (spaceId: string) => void;
  onSearchChange: (term: string) => void;
}

export function LocationSpaceSelector({
  locationFilter,
  spaceFilter,
  searchTerm,
  locations,
  spaces,
  onLocationChange,
  onSpaceChange,
  onSearchChange,
}: LocationSpaceSelectorProps) {
  const handleValueChange = (value: string) => {
    if (value === 'all') {
      onLocationChange('all');
      onSpaceChange('all');
    } else if (value.startsWith('location:')) {
      const locationId = value.replace('location:', '');
      onLocationChange(locationId);
      onSpaceChange('all');
    } else if (value.startsWith('space:')) {
      const spaceId = value.replace('space:', '');
      const selectedSpace = spaces.find(s => s.id === spaceId);
      onSpaceChange(spaceId);
      if (selectedSpace?.locationId) {
        onLocationChange(selectedSpace.locationId);
      }
    }
  };

  const currentValue = spaceFilter !== 'all' 
    ? `space:${spaceFilter}` 
    : locationFilter !== 'all' 
    ? `location:${locationFilter}` 
    : 'all';

  const renderTriggerContent = () => {
    if (spaceFilter !== 'all') {
      const selectedSpace = spaces.find(s => s.id === spaceFilter);
      const selectedLocation = locations.find(l => l.id === selectedSpace?.locationId);
      if (selectedSpace && selectedLocation) {
        return (
          <div className="flex items-center gap-1.5 min-w-0">
            <Box className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium shrink-0">
              {selectedSpace.name}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              ({selectedLocation.name})
            </span>
          </div>
        );
      }
    } else if (locationFilter !== 'all') {
      const selectedLocation = locations.find(l => l.id === locationFilter);
      if (selectedLocation) {
        return (
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate">{selectedLocation.name}</span>
          </div>
        );
      }
    }
    return (
      <div className="flex items-center gap-2">
        <Building className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="font-semibold">All</span>
      </div>
    );
  };

  return (
    <Select value={currentValue} onValueChange={handleValueChange}>
      <SelectTrigger className="w-full sm:w-[220px] h-9">
        {renderTriggerContent()}
      </SelectTrigger>
      <SelectContent>
        {/* Search input */}
        <div className="p-2 border-b">
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8"
          />
        </div>
        
        <SelectItem value="all" className="font-medium">
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">All</span>
          </div>
        </SelectItem>
        
        {/* Separator between "All" and locations */}
        <div className="border-t border-border my-1" />
        
        {/* Filter and group locations/spaces based on search */}
        {locations
          .filter(location => 
            !searchTerm || 
            location.name.toLowerCase().includes(searchTerm.toLowerCase())
          )
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((location, index) => {
            const locationSpaces = spaces
              .filter(space => 
                space.locationId === location.id &&
                (!searchTerm || 
                 space.name.toLowerCase().includes(searchTerm.toLowerCase()))
              )
              .sort((a, b) => a.name.localeCompare(b.name));
            
            // Show location if it matches search or if it has matching spaces
            const shouldShowLocation = !searchTerm || 
              location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              locationSpaces.length > 0;
            
            if (!shouldShowLocation) return null;
            
            return (
              <div key={location.id}>
                {/* Add separator line between location groups */}
                {index > 0 && <div className="border-t border-border my-1" />}
                
                {/* Location header */}
                <SelectItem 
                  value={`location:${location.id}`} 
                  className="font-medium"
                >
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{location.name}</span>
                  </div>
                </SelectItem>
                
                {/* Spaces - nested under location */}
                {locationSpaces.map(space => (
                  <SelectItem 
                    key={space.id} 
                    value={`space:${space.id}`} 
                    className="pl-6"
                  >
                    <div className="flex items-center gap-2">
                      <Box className="h-4 w-4 text-muted-foreground" />
                      <span>{space.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </div>
            );
          })}
      </SelectContent>
    </Select>
  );
} 