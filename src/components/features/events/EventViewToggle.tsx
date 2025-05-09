'use client';

import React from 'react';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { List, TableProperties, LayoutGrid } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

type ViewMode = 'table' | 'card';

interface EventViewToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
}

export const EventViewToggle: React.FC<EventViewToggleProps> = ({
  viewMode,
  onViewModeChange,
}) => {
  return (
    <>
      <ToggleGroup 
        type="single" 
        defaultValue="table"
        value={viewMode}
        onValueChange={(value) => {
          if (value === 'table' || value === 'card') {
            onViewModeChange(value);
          }
        }}
        className="gap-1"
      >
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem value="table" aria-label="Table View" size="sm" className="h-8 px-2"> 
                <TableProperties className="h-4 w-4" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>
              <p>Table View</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem value="card" aria-label="Card View" size="sm" className="h-8 px-2">
                <LayoutGrid className="h-4 w-4" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>
              <p>Card View</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </ToggleGroup>
      <Separator orientation="vertical" className="h-6 mx-1" /> 
    </>
  );
}; 