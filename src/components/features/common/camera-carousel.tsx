'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CameraInfo } from '@/hooks/use-device-camera-config';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CameraCarouselControlsProps {
  cameras: CameraInfo[];
  selectedIndex: number;
  onCameraChange: (index: number) => void;
  layout?: 'dots' | 'dropdown' | 'arrows-only';
  className?: string;
  size?: 'xs' | 'sm' | 'md';
}

export const CameraCarouselControls: React.FC<CameraCarouselControlsProps> = ({
  cameras,
  selectedIndex,
  onCameraChange,
  layout = 'dots',
  className,
  size = 'sm'
}) => {
  if (cameras.length <= 1) {
    return null;
  }

  const selectNext = () => {
    onCameraChange((selectedIndex + 1) % cameras.length);
  };

  const selectPrevious = () => {
    onCameraChange(selectedIndex === 0 ? cameras.length - 1 : selectedIndex - 1);
  };

  // Use dropdown for many cameras
  if (cameras.length > 6 || layout === 'dropdown') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Camera className="h-3 w-3 text-muted-foreground" />
        <Select
          value={selectedIndex.toString()}
          onValueChange={(value) => onCameraChange(parseInt(value))}
        >
          <SelectTrigger className="w-[180px] h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {cameras.map((camera, index) => (
              <SelectItem key={camera.id} value={index.toString()}>
                <span className="text-xs">
                  {camera.name}
                  {camera.spaceName && (
                    <span className="text-muted-foreground ml-1">• {camera.spaceName}</span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // Arrows-only layout
  if (layout === 'arrows-only') {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            size === 'xs' ? 'h-4 w-4' : 'h-6 w-6'
          )}
          onClick={selectPrevious}
          disabled={cameras.length <= 1}
        >
          <ChevronLeft className={cn(size === 'xs' ? 'h-2 w-2' : 'h-3 w-3')} />
          <span className="sr-only">Previous camera</span>
        </Button>
        <span className={cn('text-xs text-muted-foreground', size === 'xs' ? 'px-1 text-[10px]' : 'px-2')}>
          {selectedIndex + 1} / {cameras.length}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            size === 'xs' ? 'h-4 w-4' : 'h-6 w-6'
          )}
          onClick={selectNext}
          disabled={cameras.length <= 1}
        >
          <ChevronRight className={cn(size === 'xs' ? 'h-2 w-2' : 'h-3 w-3')} />
          <span className="sr-only">Next camera</span>
        </Button>
      </div>
    );
  }

  // Default dots layout
  return (
    <div className={cn('flex items-center justify-center', size === 'xs' ? 'gap-1' : 'gap-2', className)}>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          size === 'xs' ? 'h-4 w-4' : 'h-5 w-5',
          size === 'md' && 'h-6 w-6'
        )}
        onClick={selectPrevious}
        disabled={cameras.length <= 1}
      >
        <ChevronLeft className={cn(size === 'xs' ? 'h-2 w-2' : 'h-3 w-3')} />
        <span className="sr-only">Previous camera</span>
      </Button>

      <div className={cn('flex items-center', size === 'xs' ? 'gap-0.5' : 'gap-1')}>
        {cameras.map((camera, index) => (
          <TooltipProvider key={camera.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onCameraChange(index)}
                  className={cn(
                    'rounded-full transition-opacity duration-200',
                    size === 'xs' ? 'h-1 w-1' : size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'
                  )}
                  aria-label={`Switch to ${camera.name}`}
                >
                  <svg viewBox="0 0 8 8" className={cn('h-full w-full', selectedIndex === index ? 'opacity-100' : 'opacity-40 hover:opacity-60')} aria-hidden="true">
                    <circle cx="4" cy="4" r="4" className="fill-current" />
                  </svg>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p>
                  {camera.name}
                  {camera.spaceName && (
                    <span className="text-muted-foreground ml-1">• {camera.spaceName}</span>
                  )}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className={cn(
          size === 'xs' ? 'h-4 w-4' : 'h-5 w-5',
          size === 'md' && 'h-6 w-6'
        )}
        onClick={selectNext}
        disabled={cameras.length <= 1}
      >
        <ChevronRight className={cn(size === 'xs' ? 'h-2 w-2' : 'h-3 w-3')} />
        <span className="sr-only">Next camera</span>
      </Button>
    </div>
  );
};

// Camera indicator showing current selection
interface CameraIndicatorProps {
  cameras: CameraInfo[];
  selectedIndex: number;
  className?: string;
}

export const CameraIndicator: React.FC<CameraIndicatorProps> = ({
  cameras,
  selectedIndex,
  className
}) => {
  if (cameras.length <= 1) {
    return null;
  }

  const selectedCamera = cameras[selectedIndex];

  return (
    <div className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <Camera className="h-3 w-3" />
      <span className="truncate">
        {selectedCamera.name}
        {cameras.length > 1 && (
          <span className="ml-1">({selectedIndex + 1}/{cameras.length})</span>
        )}
      </span>
    </div>
  );
};
