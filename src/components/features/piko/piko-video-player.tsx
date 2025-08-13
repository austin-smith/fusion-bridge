"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
type DisposableSubscription = { unsubscribe: () => void; closed?: boolean };

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
  disableFullscreen?: boolean;
}

export const PikoVideoPlayer: React.FC<PikoVideoPlayerProps> = ({
  connectorId,
  pikoSystemId,
  cameraId,
  positionMs,
  className,
  disableFullscreen = false
}) => {
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
  const streamManagerSubscriptionRef = useRef<DisposableSubscription | null>(null);

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

  useEffect(() => {
    setIsLoadingMediaInfo(true);
    setMediaInfoError(null);
    setFetchedPikoSystemId(undefined);
    setFetchedAccessToken(null);
    setFetchedConnectionType(null);

    if (!connectorId || !cameraId) {
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
        
        setFetchedPikoSystemId(details.pikoSystemId);
        setFetchedAccessToken(details.accessToken);
        setFetchedConnectionType(details.connectionType);

        if (details.connectionType === 'cloud' && !details.pikoSystemId) {
            throw new Error("Configuration error: System ID for cloud playback is missing.");
        }

      } catch (error) {
        if (isFetchCancelled) return;
        console.error("Error fetching connection details:", error);
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
    };
  }, [connectorId, cameraId, retryAttempt]);

  useEffect(() => {
    if (!videoRef.current || !fetchedAccessToken || !cameraId || !webrtcLib) {
      return;
    }

    if (!fetchedConnectionType) {
      if (!isLoadingMediaInfo) {
        setMediaInfoError("Connection type could not be determined from server.");
      }
      return;
    }

    if (fetchedConnectionType === 'local') {
      setMediaInfoError("Video playback for local Piko connection is not supported.");
      setIsLoadingMediaInfo(false);
      return;
    }

    if (fetchedConnectionType === 'cloud') {
      if (!fetchedPikoSystemId) {
        setMediaInfoError("Configuration error: System ID for cloud video stream is missing or invalid.");
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
        targetStream: webrtcLib.TargetStream.AUTO,
        position: positionMs,
      };
      
      setMediaInfoError(null);

      if (streamManagerSubscriptionRef.current) {
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
                if (currentVideoElement.srcObject !== stream) {
                  currentVideoElement.srcObject = stream;
                  connectedStream = stream;
                  currentVideoElement.muted = true;
                  currentVideoElement.play().then(() => {
                    setMediaInfoError(null);
                  }).catch(e => {
                    if (connectedStream === stream) {
                       setMediaInfoError(`Playback failed: ${e.message}`);
                    }
                  });
                }
              }
              if (error) {
                console.warn("WebRTCStreamManager error:", error);
                let message: string;
                if (typeof error === 'string') {
                  message = error;
                } else if (typeof error === 'number' && webrtcLib?.ConnectionError) {
                  message = (webrtcLib.ConnectionError as any)[error] || String(error);
                } else if (error && typeof (error as any).message === 'string') {
                  message = (error as any).message;
                } else {
                  message = 'Playback error';
                }
                setMediaInfoError(message);
                toast.error(`WebRTC Error: ${message}`);
                if (streamManagerSubscriptionRef.current && !streamManagerSubscriptionRef.current.closed) {
                  streamManagerSubscriptionRef.current.unsubscribe();
                  streamManagerSubscriptionRef.current = null;
                }
              }
            },
            (err: any) => {
              console.warn("WebRTCStreamManager observable error:", err);
              let errorMsg: string;
              if (typeof err === 'string') {
                errorMsg = err;
              } else if (err && typeof (err as any).message === 'string') {
                errorMsg = (err as any).message;
              } else {
                errorMsg = 'Playback error';
              }
              setMediaInfoError(errorMsg);
              toast.error(`WebRTC Error: ${errorMsg}`);
            },
            () => {
              // Observable completed - no logging needed
            }
          );
      } catch (e) {
        console.warn("Error calling WebRTCStreamManager.connect:", e);
        const errorMsg = e instanceof Error ? e.message : "Failed to initiate connection";
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
          if (currentVideoElement.hasAttribute('src')) {
              currentVideoElement.removeAttribute('src');
          }
          currentVideoElement.load(); 
        }
        connectedStream = null; 
      };
    } else {
      console.warn(`Unsupported Piko connection type: ${fetchedConnectionType}`);
      setMediaInfoError(`Unsupported Piko connection type: ${fetchedConnectionType}.`);
      setIsLoadingMediaInfo(false);
      return;
    }
  }, [fetchedPikoSystemId, fetchedAccessToken, cameraId, positionMs, fetchedConnectionType, isLoadingMediaInfo, webrtcLib]);

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
            {...(disableFullscreen && { controlsList: "nofullscreen" })}
            className={`absolute inset-0 w-full h-full z-0 bg-black object-contain ${isLoadingMediaInfo || mediaInfoError || !webrtcLib ? 'opacity-0' : 'opacity-100'}`}
        />
    </div>
  );
}; 