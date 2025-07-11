'use client';

import React, { useState } from 'react';
import type { Location } from "@/types/index";
import { Button } from "@/components/ui/button";
import { cn } from '@/lib/utils';
import { Building, ChevronDown, ChevronRight } from 'lucide-react';

interface LocationTreeViewProps {
    locations: Location[];
    selectedLocationId: string | null;
    onLocationSelect: (locationId: string | null) => void;
    searchTerm?: string;
}

export function LocationTreeView({
    locations,
    selectedLocationId,
    onLocationSelect,
    searchTerm = ''
}: LocationTreeViewProps) {
    const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());

    // Filter locations based on search term
    const filteredLocations = locations.filter(location =>
        location.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

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

    const renderLocation = (location: Location, depth: number = 0) => {
        const childLocations = grouped[location.id] || [];
        const hasChildren = childLocations.length > 0;
        const isExpanded = expandedLocations.has(location.id);
        const isSelected = selectedLocationId === location.id;

        return (
            <div key={location.id} className="space-y-1">
                <div
                    className={cn(
                        "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
                    )}
                    style={{ paddingLeft: `${depth * 20 + 8}px` }}
                    onClick={() => onLocationSelect(location.id)}
                >
                    {hasChildren && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 p-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleLocationExpanded(location.id);
                            }}
                        >
                            {isExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                            ) : (
                                <ChevronRight className="h-3 w-3" />
                            )}
                        </Button>
                    )}
                    {!hasChildren && <div className="w-4" />}
                    
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 text-sm font-medium">{location.name}</span>
                </div>

                {isExpanded && hasChildren && (
                    <div className="space-y-1">
                        {childLocations.map(childLocation => 
                            renderLocation(childLocation, depth + 1)
                        )}
                    </div>
                )}
            </div>
        );
    };

    // Root locations (no parent)
    const rootLocations = grouped['root'] || [];

    return (
        <div className="space-y-2">
            {rootLocations.map(location => renderLocation(location, 0))}
            
            {rootLocations.length === 0 && searchTerm !== '' && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                    No locations found matching &quot;{searchTerm}&quot;
                </div>
            )}
        </div>
    );
} 