"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Subscription } from 'rxjs';

// Import only types, actual implementation will be loaded dynamically
import type { 
  WebRTCStreamManager,
  WebRtcUrlConfig,
  ApiVersions as ApiVersionsType,
  TargetStream as TargetStreamType,
  ConnectionError as ConnectionErrorType,
} from '@networkoptix/webrtc-stream-manager';

interface WebRTCConnectionDetails {
  pikoSystemId?: string;
  accessToken: string;
  connectionType: 'cloud' | 'local' | string;
}

interface PikoVideoPlayerProps {
  connectorId: string;
  pikoSystemId?: string;
  cameraId: string;
  positionMs?: number;
  className?: string;
}

export const PikoVideoPlayer: React.FC<PikoVideoPlayerProps> = ({
  connectorId,
  pikoSystemId,
  cameraId,
  positionMs,
  className
}) => {
  const [isMounted, setIsMounted] = useState(false);
  const [isLoadingMediaInfo, setIsLoadingMediaInfo] = useState(true);
  const [mediaInfoError, setMediaInfoError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

  const [fetchedPikoSystemId, setFetchedPikoSystemId] = useState<string | undefined>(undefined);
  const [fetchedAccessToken, setFetchedAccessToken] = useState<string | null>(null);
  const [fetchedConnectionType, setFetchedConnectionType] = useState<string | null>(null);
  
  // Store the dynamically loaded modules
  const [webrtcLib, setWebrtcLib] = useState<{
    WebRTCStreamManager: typeof WebRTCStreamManager;
    ApiVersions: typeof ApiVersionsType;
    TargetStream: typeof TargetStreamType;
    ConnectionError: typeof ConnectionErrorType;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamManagerSubscriptionRef = useRef<Subscription | null>(null);

  // Dynamic import of the WebRTC library on the client side only
  useEffect(() => {
    let isMounted = true;
    const loadWebRTCLib = async () => {
      try {
        const webRTCModule = await import('@networkoptix/webrtc-stream-manager');
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
    return () => { isMounted = false; };
  }, []);

  // Effect to set isMounted to true only on the client side
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    console.log("PikoVideoPlayer: Fetching connection details. ConnectorID:", connectorId, "CameraID:", cameraId, "Retry:", retryAttempt);
    setIsLoadingMediaInfo(true);
    setMediaInfoError(null);
    setFetchedPikoSystemId(undefined);
    setFetchedAccessToken(null);
    setFetchedConnectionType(null);

    if (!connectorId || !cameraId) {
      console.error("PikoVideoPlayer: Missing connectorId or cameraId for fetching details.");
      setMediaInfoError("Required information missing for video playback.");
      setIsLoadingMediaInfo(false);
      return;
    }

    let isFetchCancelled = false;
    const apiUrl = new URL('/api/piko/webrtc', window.location.origin);
    apiUrl.searchParams.append('connectorId', connectorId);

    const fetchDetails = async () => {
      try {
        const response = await fetch(apiUrl.toString());
        const responsePayload = await response.json();
        if (isFetchCancelled) return;

        if (!response.ok) {
          throw new Error(responsePayload.error || `Failed to fetch connection details (${response.status})`);
        }
        if (!responsePayload.success || !responsePayload.data) {
          throw new Error(responsePayload.error || "API request failed or returned invalid data.");
        }
        const details: WebRTCConnectionDetails = responsePayload.data;
        console.log("PikoVideoPlayer: Connection details received:", details);
        
        setFetchedPikoSystemId(details.pikoSystemId);
        setFetchedAccessToken(details.accessToken);
        setFetchedConnectionType(details.connectionType);

        if (details.connectionType === 'cloud' && !details.pikoSystemId) {
            console.error("PikoVideoPlayer: Cloud connection type but API did not return pikoSystemId.");
            throw new Error("Configuration error: System ID for cloud playback is missing.");
        }

      } catch (error) {
        if (isFetchCancelled) return;
        console.error("PikoVideoPlayer: Error fetching connection details:", error);
        const errorMsg = error instanceof Error ? error.message : "Unknown error fetching details.";
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
      console.log("PikoVideoPlayer: [FetchDetailsEffect] Aborted/Cancelled fetching details.");
    };
  }, [connectorId, cameraId, retryAttempt, isMounted]);

  useEffect(() => {
    if (!isMounted || !videoRef.current || !fetchedAccessToken || !cameraId || !webrtcLib) {
      console.log("PikoVideoPlayer: [StreamManagerEffect] Waiting for mount, video ref, access token, camera ID, or WebRTC library.");
      return;
    }

    if (!fetchedConnectionType) {
      console.log("PikoVideoPlayer: [StreamManagerEffect] Waiting for connection type to be determined from API.");
      if (!isLoadingMediaInfo) {
        setMediaInfoError("Connection type could not be determined from server.");
      }
      return;
    }

    if (fetchedConnectionType === 'local') {
      console.warn("PikoVideoPlayer: [StreamManagerEffect] Local Piko connections: Gracefully indicating not supported.");
      setMediaInfoError("Video playback for local Piko connection is not supported.");
      setIsLoadingMediaInfo(false);
      return;
    }

    if (fetchedConnectionType === 'cloud') {
      if (!fetchedPikoSystemId) {
        console.error("PikoVideoPlayer: [StreamManagerEffect] Cloud connection type, but fetchedPikoSystemId is MISSING. Cannot connect.");
        setMediaInfoError("Configuration error: System ID for cloud video stream is missing or invalid.");
        setIsLoadingMediaInfo(false);
        return;
      }

      const systemIdForLib: string = fetchedPikoSystemId;
      const currentVideoElement = videoRef.current;

      console.log("PikoVideoPlayer: [StreamManagerEffect] Proceeding with CLOUD connection. SystemId:",
        systemIdForLib, "cameraId:", cameraId, "tokenExists:", !!fetchedAccessToken, "positionMs:", positionMs);

      const webRtcConfig: WebRtcUrlConfig = {
        systemId: systemIdForLib,
        cameraId: cameraId,
        accessToken: fetchedAccessToken,
        apiVersion: webrtcLib.ApiVersions.v2,
        targetStream: webrtcLib.TargetStream.AUTO,
        position: positionMs,
      };
      
      setMediaInfoError(null);

      console.log("PikoVideoPlayer: [StreamManagerEffect] Calling WebRTCStreamManager.connect with config:", webRtcConfig);
      
      if (streamManagerSubscriptionRef.current) {
        console.log("PikoVideoPlayer: [StreamManagerEffect] Unsubscribing from previous stream manager subscription before new attempt.");
        streamManagerSubscriptionRef.current.unsubscribe();
      }
      if (currentVideoElement) {
          currentVideoElement.srcObject = null;
          if (currentVideoElement.hasAttribute('src')) currentVideoElement.removeAttribute('src');
          currentVideoElement.load();
      }

      let connectedStream: MediaStream | null = null;

      try {
        streamManagerSubscriptionRef.current = webrtcLib.WebRTCStreamManager.connect(webRtcConfig, currentVideoElement)
          .subscribe(
            (data: [MediaStream | null, any | null, any | null]) => {
              const [stream, error, manager] = data;
              if (stream && currentVideoElement) {
                console.log("PikoVideoPlayer: Stream received from WebRTCStreamManager. Manager instance:", manager, "Current Stream ID:", stream.id);
                if (currentVideoElement.srcObject !== stream) {
                  console.log("PikoVideoPlayer: Attaching new stream to video element.");
                  currentVideoElement.srcObject = stream;
                  connectedStream = stream;
                  currentVideoElement.muted = true;
                  currentVideoElement.play().then(() => {
                    console.log("PikoVideoPlayer: video.play() Promise resolved for stream:", stream.id);
                    setMediaInfoError(null);
                  }).catch(e => {
                    console.warn("PikoVideoPlayer: video.play() Promise rejected for stream:", stream.id, e);
                    if (connectedStream === stream) {
                       setMediaInfoError(`Playback failed: ${e.message}`);
                    }
                  });
                } else {
                  console.log("PikoVideoPlayer: Stream received is same as current srcObject. No action taken.");
                }
              }
              if (error) {
                console.error("PikoVideoPlayer: Error reported by WebRTCStreamManager:", error);
                // Log the raw error object and attempt to get a string name if it's a numeric enum
                let detailedErrorMessage = "Unknown error from library.";
                if (typeof error === 'number' && webrtcLib?.ConnectionError) {
                  const errorName = (webrtcLib.ConnectionError as any)[error];
                  detailedErrorMessage = errorName ? `ConnectionError: ${errorName} (Code: ${error})` : `Unknown ConnectionError (Code: ${error})`;
                } else if ((error as any)?.message) {
                  detailedErrorMessage = (error as any).message;
                }
                console.error("PikoVideoPlayer: Detailed ConnectionError:", detailedErrorMessage, "Raw error object:", error);
                setMediaInfoError(detailedErrorMessage);
                toast.error(`Video Error: ${detailedErrorMessage}`);
                if (streamManagerSubscriptionRef.current && !streamManagerSubscriptionRef.current.closed) {
                  streamManagerSubscriptionRef.current.unsubscribe();
                  streamManagerSubscriptionRef.current = null;
                }
              }
            },
            (err: any) => {
              console.error("PikoVideoPlayer: Observable error from WebRTCStreamManager:", err);
              const errorMsg = err.message || "Observable failed.";
              setMediaInfoError(errorMsg);
              toast.error(`Video Error: ${errorMsg}`);
            },
            () => {
              console.log("PikoVideoPlayer: WebRTCStreamManager observable completed.");
            }
          );
      } catch (e) {
        console.error("PikoVideoPlayer: [StreamManagerEffect] Sync error calling WebRTCStreamManager.connect:", e);
        const errorMsg = e instanceof Error ? e.message : "Failed to initiate library connection.";
        setMediaInfoError(errorMsg);
        toast.error(errorMsg);
      }

      return () => {
        console.log("PikoVideoPlayer: [StreamManagerEffect] CLEANUP for cloud connection. Unsubscribing.");
        if (streamManagerSubscriptionRef.current) {
          streamManagerSubscriptionRef.current.unsubscribe();
          streamManagerSubscriptionRef.current = null;
        }
        if (currentVideoElement) {
          console.log("PikoVideoPlayer: [StreamManagerEffect] CLEANUP. Resetting video element.");
          currentVideoElement.srcObject = null;
          if (currentVideoElement.hasAttribute('src')) {
              currentVideoElement.removeAttribute('src');
          }
          currentVideoElement.load(); 
        }
        connectedStream = null; 
      };
    } else {
      console.error(`PikoVideoPlayer: [StreamManagerEffect] Unhandled connection type: ${fetchedConnectionType}. Cannot connect.`);
      setMediaInfoError(`Unsupported Piko connection type: ${fetchedConnectionType}.`);
      setIsLoadingMediaInfo(false);
      return;
    }
  }, [isMounted, fetchedPikoSystemId, fetchedAccessToken, cameraId, positionMs, fetchedConnectionType, isLoadingMediaInfo, webrtcLib]);

  if (!isMounted) {
    // Render a placeholder or null until mounted on the client
    return (
      <div className={`relative aspect-video bg-muted rounded-md overflow-hidden flex items-center justify-center ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={`relative aspect-video bg-muted rounded-md overflow-hidden flex items-center justify-center ${className}`}>
        {(isLoadingMediaInfo || (!fetchedPikoSystemId && !fetchedAccessToken && !mediaInfoError && !fetchedConnectionType) || !webrtcLib) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground z-10">
            <Loader2 className="h-8 w-8 mb-2 animate-spin" />
            <span>{isLoadingMediaInfo ? 'Loading video info...' : 'Preparing video player...'}</span>
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
                console.log("PikoVideoPlayer: Retry button clicked.");
                setRetryAttempt(prev => prev + 1);
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
            className={`absolute inset-0 w-full h-full z-0 bg-black object-contain ${isLoadingMediaInfo || mediaInfoError || !webrtcLib ? 'opacity-0' : 'opacity-100'}`}
        />
    </div>
  );
}; 