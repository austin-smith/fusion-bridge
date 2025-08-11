import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Copy, EyeIcon, Image as ImageIcon, AlertCircle, Loader2, PlayIcon, Gamepad, Box, Building, Shield, ChevronLeft, ChevronRight, Clock } from "lucide-react";
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
import { getDeviceTypeIcon, getDisplayStateIcon, getEventCategoryIcon } from '@/lib/mappings/presentation';
import { 
  TypedDeviceInfo, 
  DisplayState, 
  DeviceType, 
  EventType, 
  EVENT_TYPE_DISPLAY_MAP,
  EVENT_SUBTYPE_DISPLAY_MAP,
  EventCategory
} from '@/lib/mappings/definitions';
import { cn, formatConnectorCategory } from "@/lib/utils";
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import { Skeleton } from "@/components/ui/skeleton";
import Image from 'next/image';
import { CameraMediaSection } from '@/components/features/common/CameraMediaSection';
import { useDeviceCameraConfig } from '@/hooks/use-device-camera-config';
import { useFusionStore } from '@/stores/store';
import { format, formatDistanceToNow } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  eventSubtype?: string;
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
  events?: EventData[]; // Array of events for navigation
  buttonStyle?: 'default' | 'overlay'; // Style for the trigger button
  asContent?: boolean; // Render only the dialog body without wrapper/trigger
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



export const EventDetailDialogContent: React.FC<EventDetailDialogContentProps> = ({ event, events, buttonStyle = 'default', asContent = false }) => {
  const [isCopied, setIsCopied] = useState(false);
  
  // Navigation state for multiple events
  const [currentEventIndex, setCurrentEventIndex] = useState(() => {
    if (!events) return 0;
    const foundIndex = events.findIndex(e => e.eventUuid === event.eventUuid);
    return foundIndex >= 0 ? foundIndex : 0;
  });
  
  // Keep index in bounds when the events array changes
  useEffect(() => {
    if (!events || events.length === 0) return;
    if (currentEventIndex >= events.length) {
      setCurrentEventIndex(events.length - 1);
    }
  }, [events, currentEventIndex]);
  
  // Use current event from navigation or fallback to provided event
  const currentEvent = useMemo(() => {
    if (events && events.length > 0) {
      const safeIndex = Math.min(currentEventIndex, events.length - 1);
      return events[safeIndex] ?? event;
    }
    return event;
  }, [events, currentEventIndex, event]);
  const hasMultipleEvents = events && events.length > 1;

  // Get store data for location/space/alarm zone lookup
  const spaces = useFusionStore((state) => state.spaces);
  const alarmZones = useFusionStore((state) => state.alarmZones);
  const locations = useFusionStore((state) => state.locations);
  const allDevices = useFusionStore((state) => state.allDevices);

  // Find the device in store using deviceId and connectorId
  const eventDevice = useMemo(() => {
    if (!currentEvent) return undefined;
    return allDevices.find(d => d.deviceId === currentEvent.deviceId && d.connectorId === currentEvent.connectorId);
  }, [allDevices, currentEvent]);

  // Find which space contains this device
  const deviceSpace = useMemo(() => {
    if (!eventDevice) return null;
    if (eventDevice.spaceId) {
      return spaces.find(space => space.id === eventDevice.spaceId) || null;
    }
    return spaces.find(space => space.deviceIds?.includes(eventDevice.id)) || null;
  }, [spaces, eventDevice]);
  
  // Find which alarm zone contains this device
  const deviceAlarmZone = useMemo(() => {
    if (!eventDevice) return null;
    return alarmZones.find(zone => zone.deviceIds?.includes(eventDevice.id));
  }, [alarmZones, eventDevice]);
  
  // Get location information from space or alarm zone
  const deviceLocation = useMemo(() => {
    if (deviceSpace) {
      return locations.find(loc => loc.id === deviceSpace.locationId);
    } else if (deviceAlarmZone) {
      return locations.find(loc => loc.id === deviceAlarmZone.locationId);
    }
    return null;
  }, [deviceSpace, deviceAlarmZone, locations]);
  
  const handleCopy = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      toast.error("Failed to copy text");
    }
  };

  // Use the raw payload for the JSON view tab
  const eventDataForJson = currentEvent.rawPayload || {};
  const jsonString = JSON.stringify(eventDataForJson, null, 2);

  // Get mapped type info & state icon for the modal header
  const typeInfo = currentEvent.deviceTypeInfo || { type: DeviceType.Unmapped }; // Default if missing
  const DeviceIcon = getDeviceTypeIcon(typeInfo.type);
  const StateIcon = currentEvent.displayState ? getDisplayStateIcon(currentEvent.displayState) : null;

  // Build timestamp display for header (own line, right-aligned)
  const timestampInfo = useMemo(() => {
    const ts = currentEvent?.timestamp;
    if (!ts || isNaN(ts)) return null;
    const eventDate = new Date(ts);
    const now = new Date();
    const isToday = eventDate.getDate() === now.getDate() &&
      eventDate.getMonth() === now.getMonth() &&
      eventDate.getFullYear() === now.getFullYear();
    const isThisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) < eventDate;

    const primary = isToday
      ? format(eventDate, 'h:mm a')
      : (isThisWeek ? format(eventDate, 'EEE h:mm a') : format(eventDate, 'MMM d, yyyy'));
    const relative = formatDistanceToNow(eventDate, { addSuffix: true });

    return { eventDate, label: `${primary} · ${relative}` };
  }, [currentEvent?.timestamp]);

  // Construct Media Thumbnail URL if best shot is available
  let mediaThumbnailUrl: string | null = null;
  if (currentEvent.bestShotUrlComponents) {
    const { type, pikoSystemId, connectorId, objectTrackId, cameraId } = currentEvent.bestShotUrlComponents;
    
    if (connectorId && objectTrackId && cameraId) {
      const apiUrl = new URL('/api/piko/best-shot', window.location.origin);
      
      apiUrl.searchParams.append('connectorId', connectorId);
      apiUrl.searchParams.append('objectTrackId', objectTrackId);
      apiUrl.searchParams.append('cameraId', cameraId);
      
      if (type === 'cloud' && pikoSystemId) {
        apiUrl.searchParams.append('pikoSystemId', pikoSystemId);
      }
      
      mediaThumbnailUrl = apiUrl.toString();
    } else {
      console.error("Missing core components required for Media Thumbnail URL:", currentEvent.bestShotUrlComponents);
    }
  }

  // Build camera configuration for events
  const eventCameraOptions = useMemo(() => {
    const options: any = {};
    
    // Handle best shot events
    if (currentEvent.bestShotUrlComponents) {
      options.bestShotUrlComponents = currentEvent.bestShotUrlComponents;
      options.staticThumbnailUrl = `/api/piko/best-shot?connectorId=${currentEvent.bestShotUrlComponents.connectorId}&cameraId=${currentEvent.bestShotUrlComponents.cameraId}&objectTrackId=${currentEvent.bestShotUrlComponents.objectTrackId}`;
    }
    
    // Always include timestamp for video positioning
    options.timestamp = currentEvent.timestamp;
    
    // Pass the already-available space name
    options.spaceName = deviceSpace?.name || null;
    
    return options;
  }, [currentEvent, deviceSpace]);

  // Use the enhanced hook for multi-camera configuration
  const {
    shouldShowMedia,
    hasMultipleCameras,
    cameras,
    selectedCameraIndex,
    mediaConfig,
    selectCamera
  } = useDeviceCameraConfig(
    eventDevice || null,
    {
      ...eventCameraOptions,
      spaceId: deviceSpace?.id,
      spaceName: deviceSpace?.name || null
    }
  );





  const inner = (
    <>
      <DialogHeader className="pb-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DeviceIcon className="h-5 w-5 text-muted-foreground shrink-0" />
              <DialogTitle>
                {EVENT_TYPE_DISPLAY_MAP[currentEvent.eventType as EventType] || currentEvent.eventType || currentEvent.eventCategory || 'Event Details'}
              </DialogTitle>
            </div>
            {hasMultipleEvents && (
              <div className="flex items-center gap-2 mr-8">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentEventIndex(Math.max(0, currentEventIndex - 1))}
                  disabled={currentEventIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  {currentEventIndex + 1} of {events!.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentEventIndex(Math.min(events!.length - 1, currentEventIndex + 1))}
                  disabled={currentEventIndex === events!.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <DialogDescription asChild>
           <div className="pt-2 text-sm text-muted-foreground flex items-center justify-start gap-1.5 flex-wrap">
             <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
               <ConnectorIcon connectorCategory={currentEvent.connectorCategory} size={12} />
               <span className="text-xs">{currentEvent.connectorName || formatConnectorCategory(currentEvent.connectorCategory)}</span>
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
             <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
               {(() => {
                 const CategoryIcon = getEventCategoryIcon(currentEvent.eventCategory as EventCategory);
                 return <CategoryIcon className="h-3 w-3 text-muted-foreground" />;
               })()}
               <span className="text-xs">{EVENT_TYPE_DISPLAY_MAP[currentEvent.eventType as EventType] || currentEvent.eventType}</span>
             </Badge>
             {currentEvent.eventSubtype && (
               <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                 <span className="text-xs">{EVENT_SUBTYPE_DISPLAY_MAP[currentEvent.eventSubtype as keyof typeof EVENT_SUBTYPE_DISPLAY_MAP] ?? currentEvent.eventSubtype}</span>
               </Badge>
             )}
             {currentEvent.displayState && StateIcon && (
               <Badge variant="secondary" className="inline-flex items-center gap-1.5 py-0.5 px-2 font-normal">
                  {React.createElement(StateIcon, { className: "h-3 w-3" })}
                  <span>{currentEvent.displayState}</span>
               </Badge>
             )}
            </div>
          </DialogDescription>
          {timestampInfo && (
            <div className="pt-1 w-full text-xs text-muted-foreground">
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      <time dateTime={timestampInfo.eventDate.toISOString()}>{timestampInfo.label}</time>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="center">
                    <p>{format(timestampInfo.eventDate, 'PPpp')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
      </DialogHeader>
      <Tabs defaultValue="details" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Key Details</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4">
            <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-4">
              {/* MEDIA THUMBNAIL/PLAYER */} 
              {shouldShowMedia && mediaConfig && (
                <CameraMediaSection
                  thumbnailMode={mediaConfig.thumbnailMode}
                  thumbnailUrl={mediaConfig.thumbnailUrl}
                  connectorId={mediaConfig.connectorId}
                  cameraId={mediaConfig.cameraId}
                  refreshInterval={mediaConfig.refreshInterval}
                  videoConfig={mediaConfig.videoConfig}
                  showManualRefresh={false}
                  showTimeAgo={mediaConfig.thumbnailMode === "live-auto-refresh"}
                  className="mb-4"
                  title={mediaConfig.title}
                  titleElement={mediaConfig.titleElement}
                  // Enhanced: Multi-camera carousel support
                  cameras={cameras}
                  selectedCameraIndex={selectedCameraIndex}
                  onCameraChange={selectCamera}
                  showCameraCarousel={hasMultipleCameras}
                  carouselLayout={cameras.length > 6 ? 'dropdown' : 'dots'}
                />
              )}

              {/* Existing Details Section (wrapped in a div for spacing) */}
              <div className="rounded-md border p-0 text-sm">
                {
                  (() => {
                    const deviceName = currentEvent.deviceName || currentEvent.deviceId || 'Unknown Device';
                    const typeInfo = currentEvent.deviceTypeInfo || { type: DeviceType.Unmapped };
                    const DeviceIcon = getDeviceTypeIcon(typeInfo.type);
                    const eventPayload = currentEvent.payload || {};

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
                            <DeviceIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-xs">
                              {typeInfo.type}
                              {typeInfo.subtype && (
                                <span className="text-muted-foreground ml-1">/ {typeInfo.subtype}</span>
                              )}
                            </span>
                          </Badge>
                        )
                      },
                      { key: 'Device ID', value: currentEvent.deviceId, monospace: true, breakAll: true },
                    ];

                    // Also add Object Track ID if available
                    if (currentEvent.bestShotUrlComponents?.objectTrackId) {
                        deviceInfoEntries.push({
                            key: 'Object Track ID',
                            value: currentEvent.bestShotUrlComponents.objectTrackId,
                            monospace: true,
                            breakAll: true
                        });
                    }

                    // Add Location Information - Conditional Rendering (same as device detail modal)
                    if (deviceLocation) {
                      deviceInfoEntries.push({
                        key: 'Location',
                        value: (
                          <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                            <Building className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">{deviceLocation.name}</span>
                          </Badge>
                        )
                      });
                    }

                    // Add Space Information - Conditional Rendering (same as device detail modal)
                    if (deviceSpace) {
                      deviceInfoEntries.push({
                        key: 'Space',
                        value: (
                          <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                            <Box className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">{deviceSpace.name}</span>
                          </Badge>
                        )
                      });
                    }

                    // Add Alarm Zone Information - Conditional Rendering (same as device detail modal)
                    if (deviceAlarmZone) {
                      deviceInfoEntries.push({
                        key: 'Alarm Zone',
                        value: (
                          <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                            <Shield className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">{deviceAlarmZone.name}</span>
                          </Badge>
                        )
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

                        {currentEvent.displayState && StateIcon && (
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
                                  {React.createElement(StateIcon, { className: "h-3 w-3 shrink-0" })}
                                  {currentEvent.displayState}
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
                            {currentEvent.rawEventType && (
                              <DetailRow
                                label="Original Event Type"
                                value={currentEvent.rawEventType}
                                monospace // Use monospace for potentially technical strings
                              />
                            )}
                            {payloadEntries.map(({ key, value }) => {
                              // Convert HTML breaks to line breaks for better readability
                              if (typeof value === 'string' && value.includes('<br')) {
                                const textWithBreaks = value.replace(/<br\s*\/?>/gi, '\n');
                                return (
                                  <DetailRow 
                                    key={key} 
                                    label={key.charAt(0).toUpperCase() + key.slice(1)} 
                                    value={<div className="whitespace-pre-wrap">{textWithBreaks}</div>}
                                  />
                                );
                              }
                              
                              return (
                                <DetailRow 
                                  key={key} 
                                  label={key.charAt(0).toUpperCase() + key.slice(1)} 
                                  value={value !== null && value !== undefined ? String(value) : 'N/A'} 
                                />
                              );
                            })}
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
    </>
  );

  if (asContent) {
    return inner as any;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {buttonStyle === 'overlay' ? (
          <Button variant="outline" size="icon" className="h-10 w-10 rounded-full bg-background/80 hover:bg-background/95 text-foreground/80 hover:text-foreground" title="View event details">
            <EyeIcon className="h-5 w-5" />
            <span className="sr-only">View Event Details</span>
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <EyeIcon className="h-4 w-4" />
            <span className="sr-only">View Event Details</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        {inner}
      </DialogContent>
    </Dialog>
  );
}; 