"use client";

import React, { useState, useEffect, useRef } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
type DisposableSubscription = { unsubscribe: () => void; closed?: boolean };

// Import only types, actual implementation will be loaded dynamically
import type {
  WebRTCStreamManager,
  WebRtcUrlConfig,
  ApiVersions as ApiVersionsType,
  TargetStream as TargetStreamType,
  ConnectionError as ConnectionErrorType,
} from "@networkoptix/webrtc-stream-manager";

// Stats sampling interval for fallback path (ms)
const STATS_UPDATE_INTERVAL_MS = 800;

interface WebRTCConnectionDetails {
  pikoSystemId?: string;
  accessToken: string;
  connectionType: "cloud" | "local" | string;
}

interface PikoVideoStats {
  fps: number;
  width?: number;
  height?: number;
}

interface PikoVideoPlayerProps {
  connectorId: string;
  pikoSystemId?: string;
  cameraId: string;
  positionMs?: number;
  className?: string;
  disableFullscreen?: boolean;
  enableStats?: boolean;
  onStats?: (stats: PikoVideoStats) => void;
  // Optional UX hooks/overlays
  onReady?: () => void;
  onError?: (message: string) => void;
  showBuiltInSpinner?: boolean; // default true; allows wrappers to hide built-in spinner
  // Optional: expose the internal HTMLVideoElement for overlays (e.g., dewarping canvas)
  exposeVideoRef?: (el: HTMLVideoElement | null) => void;
  targetStream?: 'AUTO' | 'HIGH' | 'LOW';
}

export const PikoVideoPlayer: React.FC<PikoVideoPlayerProps> = ({
  connectorId,
  pikoSystemId,
  cameraId,
  positionMs,
  className,
  disableFullscreen = false,
  enableStats = false,
  onStats,
  onReady,
  onError,
  showBuiltInSpinner = true,
  exposeVideoRef,
  targetStream = 'AUTO',
}) => {
  const [isLoadingMediaInfo, setIsLoadingMediaInfo] = useState(true);
  const [mediaInfoError, setMediaInfoError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

  const [fetchedPikoSystemId, setFetchedPikoSystemId] = useState<
    string | undefined
  >(undefined);
  const [fetchedAccessToken, setFetchedAccessToken] = useState<string | null>(
    null
  );
  const [fetchedConnectionType, setFetchedConnectionType] = useState<
    string | null
  >(null);

  // Store the dynamically loaded modules
  const [webrtcLib, setWebrtcLib] = useState<{
    WebRTCStreamManager: typeof WebRTCStreamManager;
    ApiVersions: typeof ApiVersionsType;
    TargetStream: typeof TargetStreamType;
    ConnectionError: typeof ConnectionErrorType;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamManagerSubscriptionRef = useRef<DisposableSubscription | null>(
    null
  );
  const statsRafRef = useRef<number | null>(null);
  const statsRvfcRef = useRef<number | null>(null);
  const [isPlaybackReady, setIsPlaybackReady] = useState(false);
  const onReadyRef = useRef<typeof onReady>();
  const onErrorRef = useRef<typeof onError>();

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  // Expose the underlying video element when available
  useEffect(() => {
    if (exposeVideoRef) exposeVideoRef(videoRef.current);
    return () => {
      if (exposeVideoRef) exposeVideoRef(null);
    };
  }, [exposeVideoRef]);

  // Dynamic import of the WebRTC library on the client side only
  useEffect(() => {
    let isMounted = true;
    const loadWebRTCLib = async () => {
      try {
        const webRTCModule = await import(
          "@networkoptix/webrtc-stream-manager"
        );
        if (isMounted) {
          setWebrtcLib({
            WebRTCStreamManager: webRTCModule.WebRTCStreamManager,
            ApiVersions: webRTCModule.ApiVersions,
            TargetStream: webRTCModule.TargetStream,
            ConnectionError: webRTCModule.ConnectionError,
          });
        }
      } catch (err) {
        console.error("Failed to load WebRTC library:", err);
        if (isMounted) {
          setMediaInfoError("Failed to initialize video player components");
        }
      }
    };
    loadWebRTCLib();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setIsLoadingMediaInfo(true);
    setMediaInfoError(null);
    setFetchedPikoSystemId(undefined);
    setFetchedAccessToken(null);
    setFetchedConnectionType(null);
    setIsPlaybackReady(false);

    if (!connectorId || !cameraId) {
      setMediaInfoError("Required information missing for video playback.");
      setIsLoadingMediaInfo(false);
      return;
    }

    let isFetchCancelled = false;
    const apiUrl = new URL("/api/piko/webrtc", window.location.origin);
    apiUrl.searchParams.append("connectorId", connectorId);

    const fetchDetails = async () => {
      try {
        const response = await fetch(apiUrl.toString());
        const responsePayload = await response.json();
        if (isFetchCancelled) return;

        if (!response.ok) {
          throw new Error(
            responsePayload.error ||
              `Failed to fetch connection details (${response.status})`
          );
        }
        if (!responsePayload.success || !responsePayload.data) {
          throw new Error(
            responsePayload.error ||
              "API request failed or returned invalid data."
          );
        }
        const details: WebRTCConnectionDetails = responsePayload.data;

        setFetchedPikoSystemId(details.pikoSystemId);
        setFetchedAccessToken(details.accessToken);
        setFetchedConnectionType(details.connectionType);

        if (details.connectionType === "cloud" && !details.pikoSystemId) {
          throw new Error(
            "Configuration error: System ID for cloud playback is missing."
          );
        }
      } catch (error) {
        if (isFetchCancelled) return;
        console.error("Error fetching connection details:", error);
        const errorMsg =
          error instanceof Error
            ? error.message
            : "Unknown error fetching details.";
        setMediaInfoError(errorMsg);
        toast.error(`Error preparing video: ${errorMsg}`);
      } finally {
        if (isFetchCancelled) return;
        setIsLoadingMediaInfo(false);
      }
    };

    fetchDetails();
    return () => {
      isFetchCancelled = true;
    };
  }, [connectorId, cameraId, retryAttempt]);

  useEffect(() => {
    if (!videoRef.current || !fetchedAccessToken || !cameraId || !webrtcLib) {
      return;
    }

    if (!fetchedConnectionType) {
      if (!isLoadingMediaInfo) {
        setMediaInfoError(
          "Connection type could not be determined from server."
        );
      }
      return;
    }

    if (fetchedConnectionType === "local") {
      setMediaInfoError(
        "Video playback for local Piko connection is not supported."
      );
      setIsLoadingMediaInfo(false);
      return;
    }

    if (fetchedConnectionType === "cloud") {
      if (!fetchedPikoSystemId) {
        setMediaInfoError(
          "Configuration error: System ID for cloud video stream is missing or invalid."
        );
        setIsLoadingMediaInfo(false);
        return;
      }

      const systemIdForLib: string = fetchedPikoSystemId;
      const currentVideoElement = videoRef.current;

      const webRtcConfig: WebRtcUrlConfig = {
        systemId: systemIdForLib,
        cameraId: cameraId,
        accessToken: fetchedAccessToken,
        apiVersion: webrtcLib.ApiVersions.v2,
        targetStream: webrtcLib.TargetStream[targetStream],
        position: positionMs,
      };

      setMediaInfoError(null);

      if (streamManagerSubscriptionRef.current) {
        streamManagerSubscriptionRef.current.unsubscribe();
      }
      if (currentVideoElement) {
        currentVideoElement.srcObject = null;
        if (currentVideoElement.hasAttribute("src"))
          currentVideoElement.removeAttribute("src");
        currentVideoElement.load();
      }

      let connectedStream: MediaStream | null = null;

      try {
        streamManagerSubscriptionRef.current =
          webrtcLib.WebRTCStreamManager.connect(
            webRtcConfig,
            currentVideoElement
          ).subscribe({
            next: (data: [MediaStream | null, any | null, any | null]) => {
              const [stream, error, manager] = data;
              if (stream && currentVideoElement) {
                if (currentVideoElement.srcObject !== stream) {
                  currentVideoElement.srcObject = stream;
                  connectedStream = stream;
                  currentVideoElement.muted = true;
                  currentVideoElement
                    .play()
                    .then(() => {
                      setMediaInfoError(null);
                      setIsPlaybackReady(true);
                      try {
                        onReadyRef.current?.();
                      } catch {}
                    })
                    .catch((e) => {
                      if (connectedStream === stream) {
                        const msg = `Playback failed: ${e.message}`;
                        setMediaInfoError(msg);
                        try {
                          onErrorRef.current?.(msg);
                        } catch {}
                      }
                    });
                }
              }
              if (error) {
                console.warn("WebRTCStreamManager error:", error);
                let message: string;
                if (typeof error === "string") {
                  message = error;
                } else if (
                  typeof error === "number" &&
                  webrtcLib?.ConnectionError
                ) {
                  message =
                    (webrtcLib.ConnectionError as any)[error] || String(error);
                } else if (
                  error &&
                  typeof (error as any).message === "string"
                ) {
                  message = (error as any).message;
                } else {
                  message = "Playback error";
                }
                setMediaInfoError(message);
                toast.error(`WebRTC Error: ${message}`);
                try {
                  onErrorRef.current?.(message);
                } catch {}
                if (
                  streamManagerSubscriptionRef.current &&
                  !streamManagerSubscriptionRef.current.closed
                ) {
                  streamManagerSubscriptionRef.current.unsubscribe();
                  streamManagerSubscriptionRef.current = null;
                }
              }
            },
            error: (err: any) => {
              console.warn("WebRTCStreamManager observable error:", err);
              let errorMsg: string;
              if (typeof err === "string") {
                errorMsg = err;
              } else if (err && typeof (err as any).message === "string") {
                errorMsg = (err as any).message;
              } else {
                errorMsg = "Playback error";
              }
              setMediaInfoError(errorMsg);
              toast.error(`WebRTC Error: ${errorMsg}`);
              try {
                onErrorRef.current?.(errorMsg);
              } catch {}
            },
            complete: () => {
              // Observable completed - no logging needed
            },
          });
      } catch (e) {
        console.warn("Error calling WebRTCStreamManager.connect:", e);
        const errorMsg =
          e instanceof Error ? e.message : "Failed to initiate connection";
        setMediaInfoError(errorMsg);
        toast.error(`WebRTC Error: ${errorMsg}`);
      }

      return () => {
        if (streamManagerSubscriptionRef.current) {
          streamManagerSubscriptionRef.current.unsubscribe();
          streamManagerSubscriptionRef.current = null;
        }
        if (currentVideoElement) {
          currentVideoElement.srcObject = null;
          if (currentVideoElement.hasAttribute("src")) {
            currentVideoElement.removeAttribute("src");
          }
          currentVideoElement.load();
        }
        connectedStream = null;
      };
    } else {
      console.warn(
        `Unsupported Piko connection type: ${fetchedConnectionType}`
      );
      setMediaInfoError(
        `Unsupported Piko connection type: ${fetchedConnectionType}.`
      );
      setIsLoadingMediaInfo(false);
      return;
    }
  }, [
    fetchedPikoSystemId,
    fetchedAccessToken,
    cameraId,
    positionMs,
    fetchedConnectionType,
    isLoadingMediaInfo,
    webrtcLib,
    targetStream,
  ]);

  // Optional FPS stats collection, strictly gated by enableStats
  useEffect(() => {
    if (!enableStats || !videoRef.current) return;
    const video = videoRef.current as any;

    // Prefer requestVideoFrameCallback when available
    if (typeof video.requestVideoFrameCallback === "function") {
      const timestamps: number[] = [];
      const rVFC = (now: number) => {
        timestamps.push(now);
        while (timestamps.length && timestamps[0] < now - 1000)
          timestamps.shift();
        if (timestamps.length > 1 && onStats) {
          const span = now - timestamps[0];
          const fps = span > 0 ? ((timestamps.length - 1) * 1000) / span : 0;
          const vw = (video as HTMLVideoElement).videoWidth;
          const vh = (video as HTMLVideoElement).videoHeight;
          onStats({ fps, width: vw || undefined, height: vh || undefined });
        }
        // keep sampling even when frames are static; rVFC fires on painted frames only
        statsRvfcRef.current = video.requestVideoFrameCallback(rVFC);
      };
      statsRvfcRef.current = video.requestVideoFrameCallback(rVFC);
      return () => {
        const cleanupVideo: any = video;
        if (
          statsRvfcRef.current &&
          cleanupVideo &&
          typeof cleanupVideo.cancelVideoFrameCallback === "function"
        ) {
          cleanupVideo.cancelVideoFrameCallback(statsRvfcRef.current);
        }
        statsRvfcRef.current = null;
      };
    }

    // Fallback: sample decoded frames per second
    let lastFrames = 0;
    let lastTime = performance.now();
    const tick = () => {
      const quality = video.getVideoPlaybackQuality?.();
      const frames = quality?.totalVideoFrames ?? 0;
      const now = performance.now();
      const dt = now - lastTime;
      if (dt >= STATS_UPDATE_INTERVAL_MS && onStats) {
        const fps = Math.max(0, ((frames - lastFrames) * 1000) / dt);
        const vw = (video as HTMLVideoElement).videoWidth;
        const vh = (video as HTMLVideoElement).videoHeight;
        onStats({ fps, width: vw || undefined, height: vh || undefined });
        lastFrames = frames;
        lastTime = now;
      }
      statsRafRef.current = requestAnimationFrame(tick);
    };
    statsRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (statsRafRef.current) cancelAnimationFrame(statsRafRef.current);
      statsRafRef.current = null;
    };
  }, [enableStats, onStats]);

  return (
    <div
      className={`relative aspect-video bg-muted rounded-md overflow-hidden flex items-center justify-center ${className}`}
    >
      {((isLoadingMediaInfo ||
        (!fetchedPikoSystemId &&
          !fetchedAccessToken &&
          !mediaInfoError &&
          !fetchedConnectionType) ||
        !webrtcLib) && showBuiltInSpinner) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground z-10">
          <Loader2 className="h-8 w-8 mb-2 animate-spin" />
          <span>
            {isLoadingMediaInfo
              ? "Loading video info..."
              : "Preparing video player..."}
          </span>
        </div>
      )}
      {!isLoadingMediaInfo && mediaInfoError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive text-center p-4 z-10 bg-muted">
          <AlertCircle className="h-8 w-8 mb-2" />
          <span className="text-sm mt-1 font-medium">{mediaInfoError}</span>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setRetryAttempt((prev) => prev + 1);
            }}
          >
            Retry Playback
          </Button>
        </div>
      )}
      <video
        ref={videoRef}
        controls
        autoPlay
        muted
        playsInline
        preload="auto"
        {...(disableFullscreen && { controlsList: "nofullscreen" })}
        className={`absolute inset-0 w-full h-full z-0 bg-black object-contain ${isLoadingMediaInfo || mediaInfoError || !webrtcLib ? "opacity-0" : "opacity-100"}`}
      />
    </div>
  );
};
