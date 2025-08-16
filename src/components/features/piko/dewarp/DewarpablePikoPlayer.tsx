'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PikoVideoPlayer } from '@/components/features/piko/piko-video-player';
import { VideoDewarpCanvas } from '@/components/features/piko/dewarp/VideoDewarpCanvas';
import { DewarpViewControls } from '@/components/features/piko/dewarp/DewarpViewControls';
import type { DewarpSettings } from '@/types/video-dewarp';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';

export interface DewarpablePikoPlayerProps {
  connectorId: string;
  cameraId: string;
  pikoSystemId?: string;
  positionMs?: number;
  className?: string;
  dewarpEnabled?: boolean;
  settings?: DewarpSettings;
  onDewarpSettingsChange?: (settings: DewarpSettings) => void;
  editOverlayTopOffsetPx?: number;
  thumbnailSize?: string; // defaults to 320x0
  enableStats?: boolean;
  onStats?: (stats: { fps: number; width?: number; height?: number }) => void;
  exposeVideoRef?: (el: HTMLVideoElement | null) => void;
  targetStream?: 'AUTO' | 'HIGH' | 'LOW';
}

export const DewarpablePikoPlayer: React.FC<DewarpablePikoPlayerProps> = ({
  connectorId,
  cameraId,
  pikoSystemId,
  positionMs,
  className,
  dewarpEnabled = false,
  settings,
  onDewarpSettingsChange,
  editOverlayTopOffsetPx = 0,
  thumbnailSize = '320x0',
  enableStats,
  onStats,
  exposeVideoRef,
  targetStream = 'AUTO',
}) => {
  const [isReady, setIsReady] = useState(false);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const lastVideoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 1280, h: 720 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setCanvasSize({ w: Math.max(1, Math.floor(rect.width)), h: Math.max(1, Math.floor(rect.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const thumbnailSrc = useMemo(() => {
    const url = new URL('/api/piko/device-thumbnail', window.location.origin);
    url.searchParams.append('connectorId', connectorId);
    url.searchParams.append('cameraId', cameraId);
    url.searchParams.append('size', thumbnailSize);
    return url.toString();
  }, [connectorId, cameraId, thumbnailSize]);

  const handleExposeVideoRef = useCallback((el: HTMLVideoElement | null) => {
    if (lastVideoRef.current !== el) {
      lastVideoRef.current = el;
      setVideoEl(el);
      if (exposeVideoRef) exposeVideoRef(el);
    }
  }, [exposeVideoRef]);

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className || ''}`}>
      <PikoVideoPlayer
        connectorId={connectorId}
        pikoSystemId={pikoSystemId}
        cameraId={cameraId}
        positionMs={positionMs}
        className="w-full h-full"
        disableFullscreen
        onReady={() => setIsReady(true)}
        exposeVideoRef={handleExposeVideoRef}
        showBuiltInSpinner={false}
        enableStats={enableStats}
        onStats={onStats}
        targetStream={targetStream}
      />
      {!isReady && (
        <div className="absolute inset-0 z-[5] pointer-events-none transition-opacity duration-200 opacity-100">
          <Image src={thumbnailSrc} alt="" fill unoptimized priority={false} className="object-contain bg-black" />
        </div>
      )}
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div className="rounded-md bg-black/10 p-2">
            <Loader2 className="h-5 w-5 animate-spin text-white/90" />
          </div>
        </div>
      )}
      {dewarpEnabled && isReady && videoEl && settings && (
        <VideoDewarpCanvas
          video={videoEl}
          width={canvasSize.w}
          height={canvasSize.h}
          settings={settings}
          className="absolute inset-0 z-10"
        />
      )}
      {dewarpEnabled && settings && onDewarpSettingsChange && (
        <DewarpViewControls
          settings={settings}
          onChange={onDewarpSettingsChange}
          topOffsetPx={editOverlayTopOffsetPx}
        />
      )}
    </div>
  );
};


