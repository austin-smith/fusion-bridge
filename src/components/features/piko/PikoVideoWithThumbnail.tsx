"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { PikoVideoPlayer } from "@/components/features/piko/piko-video-player";

interface PikoVideoWithThumbnailProps {
  connectorId: string;
  cameraId: string;
  pikoSystemId?: string;
  positionMs?: number;
  className?: string;
  disableFullscreen?: boolean;
  enableStats?: boolean;
  onStats?: (stats: { fps: number; width?: number; height?: number }) => void;
  thumbnailSize?: string; // defaults to 320x0
}

export const PikoVideoWithThumbnail: React.FC<PikoVideoWithThumbnailProps> = ({
  connectorId,
  cameraId,
  pikoSystemId,
  positionMs,
  className,
  disableFullscreen,
  enableStats,
  onStats,
  thumbnailSize = "320x0",
}) => {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const thumbnailSrc = useMemo(() => {
    const url = new URL("/api/piko/device-thumbnail", window.location.origin);
    url.searchParams.append("connectorId", connectorId);
    url.searchParams.append("cameraId", cameraId);
    url.searchParams.append("size", thumbnailSize);
    return url.toString();
  }, [connectorId, cameraId, thumbnailSize]);

  return (
    <div className={`relative w-full h-full ${className || ""}`}>
      <PikoVideoPlayer
        connectorId={connectorId}
        pikoSystemId={pikoSystemId}
        cameraId={cameraId}
        positionMs={positionMs}
        className="w-full h-full"
        disableFullscreen={disableFullscreen}
        enableStats={enableStats}
        onStats={onStats}
        onReady={() => setIsReady(true)}
        onError={(msg) => setError(msg)}
        showBuiltInSpinner={false}
      />
      {!isReady && (
        <div className={"absolute inset-0 z-[5] pointer-events-none transition-opacity duration-200 opacity-100"}>
          <Image
            src={thumbnailSrc}
            alt=""
            fill
            unoptimized
            priority={false}
            className="object-contain bg-black"
          />
        </div>
      )}
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div className="rounded-md bg-black/10 p-2">
            <Loader2 className="h-5 w-5 animate-spin text-white/90" />
          </div>
        </div>
      )}
    </div>
  );
};


