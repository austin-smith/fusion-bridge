'use client';

import React, { useState, useMemo, useEffect } from 'react';
import type { Location, Space } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';
import { Building, ChevronDown, ChevronRight, Box } from 'lucide-react';

interface LocationTreeViewProps {
    locations: Location[];
    spaces?: Space[];
    selectedLocationId: string | null;
    selectedSpaceId?: string | null;
    onLocationSelect: (locationId: string | null) => void;
    onSpaceSelect?: (spaceId: string | null) => void;
    searchTerm?: string;
}

export function LocationTreeView({
    locations,
    spaces = [],
    selectedLocationId,
    selectedSpaceId,
    onLocationSelect,
    onSpaceSelect,
    searchTerm = ''
}: LocationTreeViewProps) {
    const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());

    // Load expanded state from localStorage on mount
    useEffect(() => {
        const savedState = localStorage.getItem('locationTreeExpandedState');
        if (savedState) {
            try {
                const expandedIds = JSON.parse(savedState);
                setExpandedLocations(new Set(expandedIds));
            } catch (error) {
                console.warn('Failed to parse saved tree state:', error);
            }
        }
    }, []);

    // Save expanded state to localStorage whenever it changes
    useEffect(() => {
        const expandedArray = Array.from(expandedLocations);
        localStorage.setItem('locationTreeExpandedState', JSON.stringify(expandedArray));
    }, [expandedLocations]);

    // Group spaces by location
    const spacesByLocation = useMemo(() => {
        const grouped: Record<string, Space[]> = {};
        spaces.forEach(space => {
            const locationId = space.locationId || 'unassigned';
            if (!grouped[locationId]) {
                grouped[locationId] = [];
            }
            grouped[locationId].push(space);
        });
        
        // Sort spaces within each location
        Object.values(grouped).forEach(spaceGroup => {
            spaceGroup.sort((a, b) => a.name.localeCompare(b.name));
        });
        
        return grouped;
    }, [spaces]);

    // Filter locations and spaces based on search term
    const filteredLocations = useMemo(() => {
        if (!searchTerm) return locations;
        
        const lowerSearchTerm = searchTerm.toLowerCase();
        return locations.filter(location => {
            // Include location if its name matches
            if (location.name.toLowerCase().includes(lowerSearchTerm)) {
                return true;
            }
            
            // Include location if any of its spaces match
            const locationSpaces = spacesByLocation[location.id] || [];
            return locationSpaces.some(space => 
                space.name.toLowerCase().includes(lowerSearchTerm)
            );
        });
    }, [locations, searchTerm, spacesByLocation]);

    // Group locations by parent
    const grouped: Record<string, Location[]> = {};
    filteredLocations.forEach(location => {
        const parentId = location.parentId || 'root';
        if (!grouped[parentId]) {
            grouped[parentId] = [];
        }
        grouped[parentId].push(location);
    });

    const toggleLocationExpanded = (locationId: string) => {
        setExpandedLocations(prev => {
            const newSet = new Set(prev);
            if (newSet.has(locationId)) {
                newSet.delete(locationId);
            } else {
                newSet.add(locationId);
            }
            return newSet;
        });
    };

    const renderSpace = (space: Space, depth: number) => {
        const isSelected = selectedSpaceId === space.id;
        const deviceCount = space.deviceIds?.length || 0;
        
        // Filter space if search term doesn't match
        if (searchTerm && !space.name.toLowerCase().includes(searchTerm.toLowerCase())) {
            return null;
        }

        return (
            <TooltipProvider key={space.id}>
                <div
                    className={cn(
                        "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
                    )}
                    style={{ paddingLeft: `${depth * 8 + 8}px` }}
                    onClick={() => onSpaceSelect?.(space.id)}
                >
                    <div className="w-4" />
                    <Box className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="flex-1 text-sm">{space.name}</span>
                    {deviceCount > 0 && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                                    {deviceCount}
                                </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                                {deviceCount} device{deviceCount !== 1 ? 's' : ''}
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </TooltipProvider>
        );
    };

    const renderLocation = (location: Location, depth: number = 0) => {
        const childLocations = grouped[location.id] || [];
        const locationSpaces = spacesByLocation[location.id] || [];
        
        // Filter spaces for search term
        const filteredSpaces = searchTerm 
            ? locationSpaces.filter(space => space.name.toLowerCase().includes(searchTerm.toLowerCase()))
            : locationSpaces;
            
        const hasChildren = childLocations.length > 0;
        const hasSpaces = filteredSpaces.length > 0;
        const hasContent = hasChildren || hasSpaces;
        
        const isExpanded = expandedLocations.has(location.id);
        const isSelected = selectedLocationId === location.id && !selectedSpaceId;

        return (
            <TooltipProvider key={location.id}>
                <div className="space-y-1">
                    <div
                        className={cn(
                            "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                            isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
                        )}
                        style={{ paddingLeft: `${depth * 8 + 8}px` }}
                        onClick={() => {
                            if (hasContent) {
                                toggleLocationExpanded(location.id);
                            }
                            onLocationSelect(location.id);
                        }}
                    >
                        {hasContent ? (
                            isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )
                        ) : (
                            <div className="w-4" />
                        )}
                        
                        <Building className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 text-sm font-medium">{location.name}</span>
                        {locationSpaces.length > 0 && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge variant="outline" className="h-5 px-1.5 text-xs">
                                        {locationSpaces.length}
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {locationSpaces.length} space{locationSpaces.length !== 1 ? 's' : ''}
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </div>

                    {isExpanded && hasContent && (
                        <div className="space-y-1">
                            {/* Render child locations first */}
                            {childLocations.map(childLocation => 
                                renderLocation(childLocation, depth + 1)
                            )}
                            
                            {/* Then render spaces */}
                            {filteredSpaces.map(space => 
                                renderSpace(space, depth + 1)
                            )}
                        </div>
                    )}
                </div>
            </TooltipProvider>
        );
    };

    // Root locations (no parent)
    const rootLocations = grouped['root'] || [];

    return (
        <div className="w-64 border-r bg-muted/25 flex flex-col">
            <div className="p-4">
                <h3 className="font-semibold text-sm">Navigation</h3>
                <div className="border-b mt-3 mr-1"></div>
            </div>
            <div className="flex-1 overflow-auto p-2">
                <div className="space-y-1">
                    {rootLocations.map(location => renderLocation(location, 0))}
                    
                    {/* Show unassigned spaces if any exist and no search filter */}
                    {!searchTerm && spacesByLocation['unassigned'] && spacesByLocation['unassigned'].length > 0 && (
                        <div className="mt-4 pt-2 border-t">
                            <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">
                                Unassigned Spaces
                            </div>
                            {spacesByLocation['unassigned'].map(space => 
                                renderSpace(space, 0)
                            )}
                        </div>
                    )}
                    
                    {rootLocations.length === 0 && searchTerm !== '' && (
                        <div className="text-center py-4 text-sm text-muted-foreground">
                            No locations or spaces found matching &quot;{searchTerm}&quot;
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
} 