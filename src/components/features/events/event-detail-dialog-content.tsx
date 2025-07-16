import React, { useState, useRef, useEffect } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Copy, EyeIcon, Image as ImageIcon, AlertCircle, Loader2, PlayIcon, Gamepad } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { toast } from 'sonner';
import { getDeviceTypeIcon, getDisplayStateIcon } from '@/lib/mappings/presentation';
import { 
  TypedDeviceInfo, 
  DisplayState, 
  DeviceType, 
  EventType, 
  EVENT_TYPE_DISPLAY_MAP 
} from '@/lib/mappings/definitions';
import { cn, formatConnectorCategory } from "@/lib/utils";
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import { Skeleton } from "@/components/ui/skeleton";
import Image from 'next/image';
import { CameraMediaSection } from '@/components/features/common/CameraMediaSection';

// MODIFIED: Interface matching the updated API structure
interface EventData {
  id: number;
  eventUuid: string;
  timestamp: number;
  payload?: Record<string, any> | null;
  rawPayload?: Record<string, any> | null;
  deviceId: string;
  deviceName?: string;
  connectorId: string;
  connectorName?: string;
  deviceTypeInfo: TypedDeviceInfo;
  connectorCategory: string;
  eventCategory: string;
  eventType: string;
  rawEventType?: string;
  displayState?: DisplayState;
  bestShotUrlComponents?: {
    type: 'cloud' | 'local'; // Added type
    pikoSystemId?: string; // Optional
    connectorId: string;
    objectTrackId: string;
    cameraId: string;
  };
}

interface EventDetailDialogContentProps {
  event: EventData;
}

// Define DetailRow component locally for now
const DetailRow = ({label, value, monospace = false, breakAll = false}: {label: string, value: React.ReactNode, monospace?: boolean, breakAll?: boolean}) => (
  <div className="flex flex-row py-1.5 border-b border-muted/40 last:border-0">
    <div className="w-1/3 font-medium text-muted-foreground pl-2">{label}</div>
    <div className={cn("w-2/3 pr-2",
      monospace && "font-mono text-xs",
      breakAll && "break-all"
    )}>
      {value}
    </div>
  </div>
);



export const EventDetailDialogContent: React.FC<EventDetailDialogContentProps> = ({ event }) => {
  const [isCopied, setIsCopied] = useState(false);
  
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      toast.success("Copied JSON to clipboard!");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      toast.error("Failed to copy JSON.");
    }
  };

  // Use the raw payload for the JSON view tab
  const eventDataForJson = event.rawPayload || {};
  const jsonString = JSON.stringify(eventDataForJson, null, 2);

  // Get mapped type info & state icon for the modal header
  const typeInfo = event.deviceTypeInfo || { type: DeviceType.Unmapped }; // Default if missing
  const DeviceIcon = getDeviceTypeIcon(typeInfo.type);
  const StateIcon = event.displayState ? getDisplayStateIcon(event.displayState) : null;

  // MODIFIED: Construct Media Thumbnail URL to point to our API route
  let mediaThumbnailUrl: string | null = null;
  if (event.bestShotUrlComponents) {
    // Destructure all components, including the new 'type' and optional 'pikoSystemId'
    const { type, pikoSystemId, connectorId, objectTrackId, cameraId } = event.bestShotUrlComponents;
    
    // Core components are always required
    if (connectorId && objectTrackId && cameraId) {
        // Construct the base URL for our backend proxy API route
        const apiUrl = new URL('/api/piko/best-shot', window.location.origin); // Use relative path
        
        // Always append the core IDs
        apiUrl.searchParams.append('connectorId', connectorId);
        apiUrl.searchParams.append('objectTrackId', objectTrackId);
        apiUrl.searchParams.append('cameraId', cameraId);
        
        // Conditionally append pikoSystemId ONLY if it's a cloud event
        if (type === 'cloud' && pikoSystemId) {
            apiUrl.searchParams.append('pikoSystemId', pikoSystemId);
        }
        // Note: We don't explicitly pass 'type=local'. The backend proxy
        // will infer the type based on the presence/absence of pikoSystemId 
        // or by looking up the connector config using connectorId.
        
        mediaThumbnailUrl = apiUrl.toString();
    } else {
        console.warn("Missing core components required for Media Thumbnail URL:", event.bestShotUrlComponents);
    }
  }



  // MODIFIED: Prepare props for PikoVideoPlayer, handle potential undefined or local type
  const pikoVideoProps = {
      connectorId: event.connectorId,
      // Pass pikoSystemId only if it's a cloud event and exists
      pikoSystemId: event.bestShotUrlComponents?.type === 'cloud' ? event.bestShotUrlComponents?.pikoSystemId : undefined,
      cameraId: event.bestShotUrlComponents?.cameraId,
      positionMs: event.timestamp
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <EyeIcon className="h-4 w-4" />
           <span className="sr-only">View Event Details</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-center gap-2">
            <DeviceIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <DialogTitle>
              {EVENT_TYPE_DISPLAY_MAP[event.eventType as EventType] || event.eventType || event.eventCategory || 'Event Details'}
            </DialogTitle>
          </div>
          <DialogDescription asChild>
           <div className="pt-2 text-sm text-muted-foreground flex items-center justify-start gap-1.5 flex-wrap">
             <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
               <ConnectorIcon connectorCategory={event.connectorCategory} size={12} />
               <span className="text-xs">{event.connectorName || formatConnectorCategory(event.connectorCategory)}</span>
             </Badge>
             <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
               <DeviceIcon className="h-3 w-3 text-muted-foreground" /> 
               <span className="text-xs">
                 {typeInfo.type}
                 {typeInfo.subtype && (
                   <span className="text-muted-foreground ml-1">/ {typeInfo.subtype}</span>
                 )}
               </span>
             </Badge>
             {event.displayState && StateIcon && (
               <Badge variant="secondary" className="inline-flex items-center gap-1.5 py-0.5 px-2 font-normal">
                  {React.createElement(StateIcon, { className: "h-3 w-3" })}
                  <span>{event.displayState}</span>
               </Badge>
             )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="details" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Key Details</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4">
            <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-4">
              {/* MEDIA THUMBNAIL/PLAYER */} 
              {mediaThumbnailUrl && (
                <CameraMediaSection
                  thumbnailMode="static-url"
                  thumbnailUrl={mediaThumbnailUrl}
                  videoConfig={{
                    connectorId: pikoVideoProps.connectorId,
                    cameraId: event.bestShotUrlComponents?.cameraId || '',
                    pikoSystemId: pikoVideoProps.pikoSystemId,
                    positionMs: pikoVideoProps.positionMs
                  }}
                  showManualRefresh={false}
                  showTimeAgo={false}
                  className="mb-4"
                  title="MEDIA"
                />
              )}

              {/* Existing Details Section (wrapped in a div for spacing) */}
              <div className="rounded-md border p-0 text-sm">
                {
                  (() => {
                    const deviceName = event.deviceName || event.deviceId || 'Unknown Device';
                    const typeInfo = event.deviceTypeInfo || { type: DeviceType.Unmapped };
                    const DeviceIcon = getDeviceTypeIcon(typeInfo.type);
                    const eventPayload = event.payload || {};

                    // Prepare entries for the Device Information section
                    const deviceInfoEntries: { 
                      key: string, 
                      value: React.ReactNode, 
                      monospace?: boolean,
                      breakAll?: boolean
                    }[] = [
                      { key: 'Device Name', value: deviceName },
                      {
                        key: 'Device Type',
                        value: (
                          <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                            <DeviceIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <span className="text-xs">
                              {typeInfo.type}
                              {typeInfo.subtype && (
                                <span className="text-muted-foreground ml-1">/ {typeInfo.subtype}</span>
                              )}
                            </span>
                          </Badge>
                        )
                      },
                      { key: 'Device ID', value: event.deviceId, monospace: true, breakAll: true },
                    ];

                    // Also add Object Track ID if available
                    if (event.bestShotUrlComponents?.objectTrackId) {
                        deviceInfoEntries.push({
                            key: 'Object Track ID',
                            value: event.bestShotUrlComponents.objectTrackId,
                            monospace: true,
                            breakAll: true
                        });
                    }

                    let payloadEntries: { key: string, value: unknown }[] = [];
                    if (eventPayload && typeof eventPayload === 'object') {
                      payloadEntries = Object.entries(eventPayload)
                        // Filter out objectTrackId/eventResourceId as they are implicitly shown via best shot/device ID
                        .filter(([key]) => !['objectTrackId', 'eventResourceId'].includes(key))
                        .filter(([, value]) => typeof value !== 'object' && value !== null && value !== undefined)
                        .map(([key, value]) => ({ key, value }));
                    }

                    // Check if there's nothing to display in the details sections
                    if (deviceInfoEntries.length === 0 && !event.displayState && payloadEntries.length === 0 && !event.rawEventType) {
                      return <p className="p-4 text-muted-foreground">No details available.</p>; 
                    }

                    return (
                      <div className="flex flex-col">
                        {deviceInfoEntries.length > 0 && (
                          <>
                            <div className="py-2">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-medium text-muted-foreground pl-2">DEVICE & OBJECT INFO</span>
                                <div className="h-px grow bg-border"></div>
                              </div>
                            </div>
                            {deviceInfoEntries.map(({ key, value, monospace, breakAll }) => (
                              <DetailRow key={key} label={key} value={value} monospace={monospace} breakAll={breakAll}/>
                            ))}
                          </>
                        )}

                        {event.displayState && StateIcon && (
                          <>
                            <div className="py-2"> 
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-medium text-muted-foreground pl-2">EVENT STATE</span>
                                <div className="h-px grow bg-border"></div>
                              </div>
                            </div>
                            <DetailRow 
                              label="State" 
                              value={
                                <Badge variant="outline" className="inline-flex items-center gap-1.5 py-0.5 px-2 font-normal">
                                  {React.createElement(StateIcon, { className: "h-3 w-3 flex-shrink-0" })}
                                  {event.displayState}
                                </Badge>
                              } 
                            />
                          </>
                        )}

                        {/* Event Data Section */}
                        {payloadEntries.length > 0 && (
                          <>
                            <div className="py-2"> {/* Section header */} 
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-medium text-muted-foreground pl-2">RAW EVENT DATA</span>
                                <div className="h-px grow bg-border"></div>
                              </div>
                            </div>
                            {/* Display Original Event Type if available */}
                            {event.rawEventType && (
                              <DetailRow
                                label="Original Event Type"
                                value={event.rawEventType}
                                monospace // Use monospace for potentially technical strings
                              />
                            )}
                            {payloadEntries.map(({ key, value }) => (
                              <DetailRow 
                                key={key} 
                                label={key.charAt(0).toUpperCase() + key.slice(1)} 
                                // Display value, handle potential null/undefined explicitly
                                value={value !== null && value !== undefined ? String(value) : 'N/A'} 
                              />
                            ))}
                          </>
                        )}
                      </div>
                    );
                  })()
                }
              </div>
            </div>
          </TabsContent>

          <TabsContent value="raw" className="mt-4">
             <div className="relative">
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 h-7 w-7 z-50"
                onClick={() => handleCopy(jsonString)}
                disabled={isCopied}
              >
                {isCopied ?
                  <Check className="h-4 w-4 text-green-500" /> :
                  <Copy className="h-4 w-4 text-neutral-400" />
                }
                <span className="sr-only">{isCopied ? 'Copied' : 'Copy JSON'}</span>
              </Button>
              <SyntaxHighlighter
                language="json"
                style={atomDark}
                wrapLongLines={true}
                codeTagProps={{
                  style: {
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }
                }}
                customStyle={{
                  maxHeight: '24rem',
                  overflowY: 'auto',
                  borderRadius: '6px',
                  fontSize: '13px',
                }}
              >
                {jsonString}
              </SyntaxHighlighter>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter className="pt-4 border-t mt-4">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 