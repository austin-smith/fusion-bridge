'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ZoomWindow, NormalizedRoi } from '@/types/zoom-window';
import { VideoZoomCanvas } from '@/components/features/piko/zoom/VideoZoomCanvas';
import { ZoomWindowOverlay } from '@/components/features/piko/zoom/ZoomWindowOverlay';
import Image from 'next/image';
import { PikoVideoPlayer } from '@/components/features/piko/piko-video-player';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Crop, X, Box, Building, Loader2 } from 'lucide-react';
import type { HeaderStyle } from '@/types/play';
import { TileHeader } from '@/components/features/play/TileHeader';
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
  headerStyle?: HeaderStyle;
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
  headerStyle = 'overlay',
  deviceName,
  spaceName,
  locationName,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 640, h: 360 });
  const [fallbackActive, setFallbackActive] = useState(false);
  const [renderBump, setRenderBump] = useState(0);
  const [editingRoi, setEditingRoi] = useState(false);

  useEffect(() => {
    const tryAttach = () => {
      const el = getSharedVideoEl?.(windowDef.sourceDeviceId) ?? null;
      if (el) {
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
        if (performance.now() - start > 3000) {
          setFallbackActive(true);
          return;
        }
        requestAnimationFrame(poll);
      };
      const raf = requestAnimationFrame(poll);
      return () => cancelAnimationFrame(raf);
    }
  }, [getSharedVideoEl, windowDef.sourceDeviceId]);

  // Re-render when the shared video becomes ready to render frames
  useEffect(() => {
    if (!videoEl) return;
    const bump = () => setRenderBump((n) => n + 1);
    const events: Array<keyof HTMLVideoElementEventMap> = ['loadedmetadata', 'loadeddata', 'canplay', 'playing', 'resize'];
    events.forEach((ev) => videoEl.addEventListener(ev, bump as EventListener));
    let raf: number | undefined;
    // short polling in case events are missed
    const start = performance.now();
    const poll = () => {
      if (videoEl && videoEl.videoWidth && videoEl.videoHeight && videoEl.readyState >= 2) {
        bump();
        return;
      }
      if (performance.now() - start < 1500) {
        raf = requestAnimationFrame(poll);
      }
    };
    raf = requestAnimationFrame(poll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      events.forEach((ev) => videoEl.removeEventListener(ev, bump as EventListener));
    };
  }, [videoEl]);

  // Prevent exposeVideoRef loops by only setting when ref actually changes
  const lastExposedRef = useRef<HTMLVideoElement | null>(null);
  const safeSetVideoEl = React.useCallback((el: HTMLVideoElement | null) => {
    // Ignore null unmounts to avoid toggling back to fallback and ref thrash
    if (el === null) return;
    if (lastExposedRef.current !== el) {
      lastExposedRef.current = el;
      setVideoEl(el);
    }
  }, []);

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

  const isRenderable = Boolean(videoEl && videoEl.readyState >= 2 && videoEl.videoWidth && videoEl.videoHeight);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black group">
      {headerStyle === 'standard' ? (
        <TileHeader
          headerStyle={headerStyle}
          icon={<Crop className="h-3.5 w-3.5" />}
          title={deviceName}
          spaceName={spaceName}
          locationName={locationName}
          actions={(
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
          )}
        />
      ) : null}

      {headerStyle !== 'standard' ? (
        <TileHeader
          headerStyle={headerStyle}
          icon={<Crop className="h-3.5 w-3.5" />}
          title={deviceName}
          spaceName={spaceName}
          locationName={locationName}
          actions={(
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
          )}
        />
      ) : null}

      {/* Content */}
      <div className={headerStyle === 'standard' ? 'absolute inset-x-0 bottom-0 top-8' : 'absolute inset-0'}>
        {isRenderable ? (
          <VideoZoomCanvas
            video={videoEl}
            width={size.w}
            height={size.h}
            roi={windowDef.roi}
            className="absolute inset-0"
          />
        ) : (
          <>
            {/* Always render the hidden player to accelerate attach; keep thumbnail visible */}
            <PikoVideoPlayer
              connectorId={windowDef.connectorId}
              cameraId={windowDef.cameraId}
              className="absolute inset-0 opacity-0 pointer-events-none"
              disableFullscreen
              exposeVideoRef={safeSetVideoEl}
              showBuiltInSpinner={false}
            />
            <Image src={thumbnailSrc} alt="" fill unoptimized priority={false} className="object-contain bg-black" />
          </>
        )}

        {!isRenderable && (
          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
            <div className="rounded-md bg-black/10 p-2">
              <Loader2 className="h-5 w-5 animate-spin text-white/90" />
            </div>
          </div>
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


