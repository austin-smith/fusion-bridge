'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ZoomWindow, NormalizedRoi } from '@/types/zoom-window';
import { VideoZoomCanvas } from '@/components/features/piko/zoom/VideoZoomCanvas';
import { ZoomWindowOverlay } from '@/components/features/piko/zoom/ZoomWindowOverlay';
import Image from 'next/image';
import { PikoVideoPlayer } from '@/components/features/piko/piko-video-player';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Crop, X, Box, Building } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface ZoomWindowTileProps {
  windowDef: ZoomWindow;
  getSharedVideoEl?: (sourceDeviceId: string) => HTMLVideoElement | null;
  locked?: boolean;
  onEditRoi?: (id: string, newRoi: NormalizedRoi) => void;
  onRemove?: (id: string) => void;
  overlayHeaders?: boolean;
  deviceName?: string;
  spaceName?: string;
  locationName?: string;
}

export const ZoomWindowTile: React.FC<ZoomWindowTileProps> = ({
  windowDef,
  getSharedVideoEl,
  locked,
  onEditRoi,
  onRemove,
  overlayHeaders = true,
  deviceName,
  spaceName,
  locationName,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 640, h: 360 });
  const [fallbackActive, setFallbackActive] = useState(false);
  const [editingRoi, setEditingRoi] = useState(false);

  useEffect(() => {
    const tryAttach = () => {
      const el = getSharedVideoEl?.(windowDef.sourceDeviceId) ?? null;
      if (el && el.readyState >= 2) {
        setVideoEl(el);
        return true;
      }
      return false;
    };
    if (!tryAttach()) {
      // Poll briefly in case the player just mounted and registry updates shortly
      const start = performance.now();
      const poll = () => {
        if (tryAttach()) return;
        if (performance.now() - start > 1000) {
          setFallbackActive(true);
          return;
        }
        requestAnimationFrame(poll);
      };
      const raf = requestAnimationFrame(poll);
      return () => cancelAnimationFrame(raf);
    }
  }, [getSharedVideoEl, windowDef.sourceDeviceId]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => {
      const r = node.getBoundingClientRect();
      setSize({ w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) });
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const thumbnailSrc = useMemo(() => {
    const url = new URL('/api/piko/device-thumbnail', window.location.origin);
    url.searchParams.append('connectorId', windowDef.connectorId);
    url.searchParams.append('cameraId', windowDef.cameraId);
    url.searchParams.append('size', '320x0');
    return url.toString();
  }, [windowDef.connectorId, windowDef.cameraId]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {/* Header overlay (matches PlayGrid style) */}
      {overlayHeaders ? (
        <div className="absolute inset-x-0 top-0 z-10">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.6)_0%,rgba(0,0,0,0.38)_38%,rgba(0,0,0,0.14)_78%,rgba(0,0,0,0)_100%)] backdrop-blur-[2px]"
            aria-hidden="true"
          />
          <div className="relative z-20 px-2 py-1 flex items-center justify-between gap-2 text-white">
            <div className="min-w-0 flex items-center gap-1.5 text-xs">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Crop className="h-3.5 w-3.5 text-white/80" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Zoom Window</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {deviceName && <span className="truncate">{deviceName}</span>}
              {spaceName ? (
                <>
                  <span className="text-white/60">•</span>
                  <span className="inline-flex items-center gap-1 truncate text-white/80">
                    <Box className="h-3.5 w-3.5" />
                    <span className="truncate">{spaceName}</span>
                  </span>
                </>
              ) : null}
              {locationName ? (
                <>
                  <span className="text-white/60">•</span>
                  <span className="inline-flex items-center gap-1 truncate text-white/80">
                    <Building className="h-3.5 w-3.5" />
                    <span className="truncate">{locationName}</span>
                  </span>
                </>
              ) : null}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 no-drag text-white/90 hover:text-white hover:bg-white/10"
                  aria-label="Zoom tile options"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="no-drag">
                <DropdownMenuItem
                  disabled={locked}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!locked) setEditingRoi(true);
                  }}
                >
                  <Crop className="mr-2 h-4 w-4" />
                  Edit region
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemove?.(windowDef.id);
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ) : null}

      {/* Content */}
      <div className="absolute inset-0">
        {videoEl ? (
          <VideoZoomCanvas
            video={videoEl}
            width={size.w}
            height={size.h}
            roi={windowDef.roi}
            className="absolute inset-0"
          />
        ) : fallbackActive ? (
          <>
            <PikoVideoPlayer
              connectorId={windowDef.connectorId}
              cameraId={windowDef.cameraId}
              className="absolute inset-0 opacity-0 pointer-events-none"
              disableFullscreen
              exposeVideoRef={setVideoEl}
              showBuiltInSpinner={false}
            />
            <Image src={thumbnailSrc} alt="" fill unoptimized priority={false} className="object-contain bg-black" />
          </>
        ) : (
          <Image src={thumbnailSrc} alt="" fill unoptimized priority={false} className="object-contain bg-black" />
        )}

        {/* ROI Edit Overlay */}
        {editingRoi && (
          <ZoomWindowOverlay
            mode="edit"
            roi={windowDef.roi}
            sourceVideoEl={videoEl}
            containerRef={containerRef}
            getVideoSize={() => {
              if (videoEl && videoEl.videoWidth && videoEl.videoHeight) {
                return { w: videoEl.videoWidth, h: videoEl.videoHeight };
              }
              return undefined;
            }}
            onSave={(newRoi) => {
              onEditRoi?.(windowDef.id, newRoi);
              setEditingRoi(false);
            }}
            onCancel={() => setEditingRoi(false)}
          />
        )}
      </div>
    </div>
  );
};


