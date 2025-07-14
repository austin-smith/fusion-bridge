'use client';

import React from 'react';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { List, TableProperties, LayoutGrid, Grid3X3, Grid2X2, Grip, Check } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ViewMode = 'table' | 'card';
type CardSize = 'small' | 'medium' | 'large';

interface EventViewToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  cardSize: CardSize;
  onCardSizeChange: (value: CardSize) => void;
}

export const EventViewToggle: React.FC<EventViewToggleProps> = ({
  viewMode,
  onViewModeChange,
  cardSize,
  onCardSizeChange,
}) => {
  const getCardSizeIcon = (size: CardSize) => {
    switch (size) {
      case 'small': return Grid3X3;
      case 'medium': return Grid2X2;
      case 'large': return LayoutGrid;
    }
  };

  const getCardSizeLabel = (size: CardSize) => {
    switch (size) {
      case 'small': return 'Small Cards';
      case 'medium': return 'Medium Cards';
      case 'large': return 'Large Cards';
    }
  };

  // Get current view display info
  const currentIcon = viewMode === 'table' ? TableProperties : getCardSizeIcon(cardSize);
  const currentLabel = viewMode === 'table' ? 'Table' : getCardSizeLabel(cardSize);

  return (
    <>
      <DropdownMenu>
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 gap-1"
                >
                  {React.createElement(currentIcon, { className: "h-4 w-4" })}
                  <span className="sr-only">View Options</span>
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>View: {currentLabel}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => onViewModeChange('table')}
            className={cn(
              "flex items-center gap-2",
              viewMode === 'table' && "bg-accent text-accent-foreground"
            )}
          >
            <TableProperties className="h-4 w-4" />
            Table
            {viewMode === 'table' && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {(['small', 'medium', 'large'] as CardSize[]).map((size) => {
            const Icon = getCardSizeIcon(size);
            const isSelected = viewMode === 'card' && cardSize === size;
            return (
              <DropdownMenuItem
                key={size}
                onClick={() => {
                  onViewModeChange('card');
                  onCardSizeChange(size);
                }}
                className={cn(
                  "flex items-center gap-2",
                  isSelected && "bg-accent text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {getCardSizeLabel(size)}
                {isSelected && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      
      <Separator orientation="vertical" className="h-6 mx-1" /> 
    </>
  );
}; 