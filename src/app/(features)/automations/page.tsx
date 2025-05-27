'use client';

import React, { useEffect, useState, useCallback } from "react";
import { AutomationCardView } from "@/components/features/automations/AutomationCardView";
import { Button } from "@/components/ui/button";
import { PlusCircle, Workflow } from "lucide-react";
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
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
        const automations = await response.json();
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
  
  const pageActions = (
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

      <Button asChild size="sm">
        <Link href="/automations/new">
          <PlusCircle className="h-4 w-4" /> Add Automation
        </Link>
      </Button>
    </div>
  );

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <PageHeader 
        title="Automations"
        icon={<Workflow className="h-6 w-6" />}
        actions={pageActions}
      />
      <AutomationCardView selectedLocationId={selectedLocationId} selectedTags={selectedTags} />
    </div>
  );
} 