'use client';

import React, { useState, useMemo, useCallback } from 'react';
import type { Area, Location } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from '@/lib/utils';
import { Building, MapPin, Plus, ChevronDown, ChevronRight } from 'lucide-react';

interface LocationTreeViewProps {
  allLocations: Location[];
  allAreas: Area[];
  searchTerm: string;
  selectedLocationId: string | null;
  selectedAreaId: string | null;
  onSelectItem: (item: { type: 'location' | 'area', location: Location | null, area: Area | null }) => void;
  onAddLocationClick: () => void;
  className?: string;
  hasOriginalData: boolean; // To show/hide initial "Add Location" button and empty state correctly
}

export function LocationTreeView({
  allLocations,
  allAreas,
  searchTerm,
  selectedLocationId,
  selectedAreaId,
  onSelectItem,
  onAddLocationClick,
  className,
  hasOriginalData,
}: LocationTreeViewProps) {
  const [expandedLocations, setExpandedLocations] = useState<Record<string, boolean>>({});

  const areasByLocation = useMemo(() => {
    const grouped: Record<string, Area[]> = {};
    allAreas.forEach(area => {
      const locId = area.locationId ?? 'unassigned';
      if (!grouped[locId]) {
        grouped[locId] = [];
      }
      grouped[locId].push(area);
    });
    Object.values(grouped).forEach(areaGroup => {
      areaGroup.sort((a, b) => a.name.localeCompare(b.name));
    });
    return grouped;
  }, [allAreas]);

  const filteredSortedLocations = useMemo(() => {
    const lowerSearchTerm = searchTerm.toLowerCase();
    const filtered = allLocations.filter(location =>
      location.name.toLowerCase().includes(lowerSearchTerm)
    );
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [allLocations, searchTerm]);

  const isFilteredEmptyState = useMemo(() => {
    return filteredSortedLocations.length === 0 &&
           (searchTerm !== '' || !areasByLocation['unassigned'] || areasByLocation['unassigned'].length === 0);
  }, [filteredSortedLocations, searchTerm, areasByLocation]);


  const toggleLocationExpansion = useCallback((locationId: string) => {
    setExpandedLocations(prev => ({ ...prev, [locationId]: !prev[locationId] }));
  }, []);

  const handleLocationSelect = useCallback((location: Location) => {
    onSelectItem({ type: 'location', location, area: null });
    // Scroll to location element in the main content area
    const element = document.getElementById(`location-${location.id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [onSelectItem]);

  const handleAreaSelect = useCallback((area: Area, parentLocation: Location | null) => {
    onSelectItem({ type: 'area', location: parentLocation, area });
     // Scroll to area card element in the main content area
    const areaElement = document.getElementById(`area-${area.id}`);
    if (areaElement) {
      areaElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [onSelectItem]);


  const renderTreeItem = (location: Location) => {
    const locationAreas = areasByLocation[location.id] || [];
    const isExpanded = expandedLocations[location.id] || false;
    const isSelected = selectedLocationId === location.id && !selectedAreaId;

    return (
      <div key={location.id} className="mb-2">
        <div
          className={cn(
            "flex items-center py-1.5 px-2 rounded-md text-sm cursor-pointer",
            isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
          )}
          onClick={() => handleLocationSelect(location)}
        >
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 mr-1" onClick={(e) => {
            e.stopPropagation();
            toggleLocationExpansion(location.id);
          }}>
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
          <Building className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
          <span className="truncate flex-grow">{location.name}</span>
          <Badge variant="outline" className="ml-1">{locationAreas.length}</Badge>
        </div>

        {isExpanded && locationAreas.length > 0 && (
          <div className="pl-6 mt-1 space-y-1">
            {locationAreas.map(area => (
              <div
                key={area.id}
                className={cn(
                  "flex items-center py-1 px-2 rounded-md text-sm cursor-pointer",
                  selectedAreaId === area.id ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
                )}
                onClick={(e) => {
                    e.stopPropagation(); // Prevent location click when area is clicked
                    handleAreaSelect(area, location);
                }}
              >
                <MapPin className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <span className="truncate">{area.name}</span>
              </div>
            ))}
          </div>
        )}

        {isExpanded && locationAreas.length === 0 && (
          <div className="pl-6 mt-1">
            <p className="text-xs text-muted-foreground py-1 px-2">No areas in this location</p>
          </div>
        )}
      </div>
    );
  };

  const renderUnassignedAreas = () => {
    const unassignedAreas = areasByLocation['unassigned'] || [];
    if (searchTerm !== '' || unassignedAreas.length === 0) return null;

    return (
      <div className="mt-4 pt-3 border-t">
        <div className="text-xs font-semibold uppercase text-muted-foreground mb-2 px-2">
          Unassigned Areas
        </div>
        <div className="space-y-1">
          {unassignedAreas.map(area => (
            <div
              key={area.id}
              className={cn(
                "flex items-center py-1 px-2 rounded-md text-sm cursor-pointer ml-2",
                selectedAreaId === area.id ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
              )}
              onClick={() => handleAreaSelect(area, null)}
            >
              <MapPin className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <span className="truncate">{area.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={cn("w-64 pr-2 pl-4 border-r flex-shrink-0 flex flex-col", className)}>
      <div className="mb-4 pb-3 border-b pt-4">
        <h3 className="font-medium text-sm mb-3">Locations Hierarchy</h3>
        {hasOriginalData && ( // Only show if there's any data at all initially
          <Button variant="secondary" size="sm" className="w-full" onClick={onAddLocationClick}>
            <Plus className="h-3.5 w-3.5" /> Add Location
          </Button>
        )}
      </div>
      <ScrollArea className="flex-grow">
        {filteredSortedLocations.map(location => renderTreeItem(location))}
        {renderUnassignedAreas()}
        {isFilteredEmptyState && (
          <div className="px-2 pt-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">
              {searchTerm !== '' ? 'No locations match your search.' : 'No locations or areas found.'}
            </p>
            {searchTerm === '' && ( // Only show "Add your first location" if not searching
                 <Button variant="link" size="sm" className="h-auto p-0" onClick={onAddLocationClick}>
                    Add your first location
                 </Button>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
} 