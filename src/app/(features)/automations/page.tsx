'use client';

import React, { useEffect, useState, useCallback } from "react";
import { AutomationCardView } from "@/components/features/automations/AutomationCardView";
import { Button } from "@/components/ui/button";
import { Plus, Workflow, History } from "lucide-react";
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelectComboBox } from '@/components/ui/multi-select-combobox';

// Types
interface Location {
  id: string;
  name: string;
}

export default function AutomationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    document.title = 'Automations // Fusion';
  }, []);

  // Fetch locations
  const fetchLocations = useCallback(async () => {
    try {
      const response = await fetch('/api/locations');
      if (response.ok) {
        const data = await response.json();
        const locationsArray = Array.isArray(data) ? data : data.data && Array.isArray(data.data) ? data.data : [];
        setLocations(locationsArray);
      }
    } catch (error) {
      console.error('Failed to fetch locations:', error);
    }
  }, []);

  // Fetch available tags from automations
  const fetchAvailableTags = useCallback(async () => {
    try {
      const response = await fetch('/api/automations');
      if (response.ok) {
        const result = await response.json();
        if (!result.success) {
          console.warn(`Failed to fetch automations for tags: ${result.error}`);
          return;
        }
        const automations = result.data || [];
        const allTags = new Set<string>();
        automations.forEach((automation: any) => {
          if (automation.tags && Array.isArray(automation.tags)) {
            automation.tags.forEach((tag: string) => allTags.add(tag));
          }
        });
        setAvailableTags(Array.from(allTags).sort());
      }
    } catch (error) {
      console.error('Failed to fetch available tags:', error);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
    fetchAvailableTags();
  }, [fetchLocations, fetchAvailableTags]);
  
  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      {/* Custom header for automations page */}
      <div className="flex flex-col mb-6 gap-4 shrink-0">
        {/* Title and Icon Section */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-muted-foreground shrink-0">
            <Workflow className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Automations
            </h1>
          </div>
        </div>

        {/* Actions Section - Always below title */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select 
            value={selectedLocationId || "all"} 
            onValueChange={(value) => setSelectedLocationId(value === "all" ? null : value)}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.sort((a, b) => a.name.localeCompare(b.name)).map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {availableTags.length > 0 && (
            <MultiSelectComboBox
              options={availableTags.map(tag => ({ value: tag, label: tag }))}
              selected={selectedTags}
              onChange={setSelectedTags}
              placeholder="Filter by tags..."
              className="w-full sm:w-[200px]"
            />
          )}

          <Button asChild size="sm" variant="outline">
            <Link href="/automations/executions">
              <History className="h-4 w-4" /> View Logs
            </Link>
          </Button>

          <Button asChild size="sm">
            <Link href="/automations/new">
              <Plus className="h-4 w-4" /> Add Automation
            </Link>
          </Button>
        </div>
      </div>
      
      <AutomationCardView selectedLocationId={selectedLocationId} selectedTags={selectedTags} />
    </div>
  );
} 