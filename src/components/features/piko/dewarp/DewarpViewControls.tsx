'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Plus, Minus, Aperture } from 'lucide-react';
import type { DewarpSettings } from '@/types/video-dewarp';

interface DewarpViewControlsProps {
  settings: DewarpSettings;
  onChange: (settings: DewarpSettings) => void;
  className?: string;
  topOffsetPx?: number; // reserve a safe area at the top (e.g. overlay header region)
}

/**
 * Computes the safe pitch limit in degrees so the output FOV edge remains within the fisheye circle.
 * Formula: max(0, θ_max − FOV/2) in radians, then converted to degrees.
 * @param outputFovDeg - Output field of view in degrees.
 * @param fisheyeCoverageDeg - Total fisheye coverage in degrees (defaults to 180°, set 200–220° for some 360 lenses).
 * Note: If fisheyeCoverageDeg is not set correctly for the camera, pitch limits may be inaccurate.
 */
function calculateSafePitchLimitDegrees(outputFovDeg: number, fisheyeCoverageDeg: number = 180): number {
  const maxFisheyeTheta = (fisheyeCoverageDeg * Math.PI) / 360; // half-angle in radians
  const outFovRad = (outputFovDeg * Math.PI) / 180;
  return Math.max(0, maxFisheyeTheta - outFovRad / 2) * (180 / Math.PI);
}

export const DewarpViewControls: React.FC<DewarpViewControlsProps> = ({
  settings,
  onChange,
  className = '',
  topOffsetPx = 0,
}) => {
  return (
    <div 
      className={`absolute right-0 bottom-0 left-0 z-30 cursor-move no-drag ${className}`}
      style={{ top: topOffsetPx }}
      onWheel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Scroll up = zoom in (decrease FOV), scroll down = zoom out (increase FOV)
        const delta = e.deltaY > 0 ? 5 : -5; // 5 degree increments
        const newFov = Math.max(30, Math.min(150, settings.fovDeg + delta));
        
        if (newFov !== settings.fovDeg) {
          onChange({ ...settings, fovDeg: newFov });
        }
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const startYaw = settings.yawDeg;
        const startPitch = settings.pitchDeg;
        
        const handleMouseMove = (moveEvent: MouseEvent) => {
          moveEvent.stopPropagation();
          const deltaX = moveEvent.clientX - startX;
          const deltaY = moveEvent.clientY - startY;
          // Sensitivity: 1 pixel = 0.5 degrees
          const yawDelta = deltaX * 0.5;
          const pitchDelta = -deltaY * 0.5; // Invert Y for natural feel
          
          // Limit pitch so the edge of the output FOV stays within the fisheye circle
          const safePitchLimit = calculateSafePitchLimitDegrees(settings.fovDeg);
          
          onChange({
            ...settings,
            yawDeg: startYaw + yawDelta, // Allow infinite rotation (no bounds)
            pitchDeg: Math.max(-safePitchLimit, Math.min(safePitchLimit, startPitch + pitchDelta)),
          });
        };
        
        const handleMouseUp = (upEvent: MouseEvent) => {
          upEvent.stopPropagation();
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      }}
    >
      {/* Top-left stack: icon indicator then controls */}
      <div className="absolute top-4 left-4 flex flex-col gap-3 pointer-events-none">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div 
                className="w-9 h-9 rounded-full bg-blue-500/80 text-white pointer-events-auto flex items-center justify-center"
              >
                <Aperture className="h-5 w-5" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Dewarp mode - drag to pan, use +/- to zoom</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="flex flex-col gap-2 pointer-events-auto">
          <Button
            size="icon"
            variant="secondary"
            className="h-10 w-10 rounded-full bg-black/60 hover:bg-black/80 text-white border-white/20"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const newFov = Math.max(30, settings.fovDeg - 10);
              onChange({ ...settings, fovDeg: newFov });
            }}
          >
            <Plus className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="h-10 w-10 rounded-full bg-black/60 hover:bg-black/80 text-white border-white/20"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const newFov = Math.min(150, settings.fovDeg + 10);
              onChange({ ...settings, fovDeg: newFov });
            }}
          >
            <Minus className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};


