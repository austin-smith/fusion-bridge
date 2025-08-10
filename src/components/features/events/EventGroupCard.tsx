'use client';

import React, { useMemo, useState } from 'react';
import type { EnrichedEvent } from '@/types/events';
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from '@/lib/utils';
import { EventType, EVENT_TYPE_DISPLAY_MAP, EventCategory, EVENT_SUBTYPE_DISPLAY_MAP } from '@/lib/mappings/definitions';
import Image from 'next/image'; // Use Next.js Image for optimization
import { getDeviceTypeIcon, getDisplayStateIcon, getDisplayStateColorClass, getSeverityCardStyles, getEventCategoryIcon } from '@/lib/mappings/presentation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Clock, ZoomIn, PlayIcon, VideoOff } from 'lucide-react';
import type { DeviceWithConnector, Space } from '@/types/index';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"; // <-- Added Popover imports
import { ScrollArea } from "@/components/ui/scroll-area";
import { SeverityLevel, getGroupSeverity } from '@/lib/mappings/severity'; // <-- Added severity imports
import { Button } from "@/components/ui/button";
import { ImagePreviewDialog } from './image-preview-dialog'; // <-- Import the new dialog
import { EventDetailDialogContent } from './event-detail-dialog-content'; // <-- Import event detail dialog
import { toast } from 'react-hot-toast';
import { getThumbnailSource, buildThumbnailUrl } from '@/services/event-thumbnail-resolver';
import { useDeviceCameraConfig } from '@/hooks/use-device-camera-config';
import { CameraCarouselControls } from '@/components/features/common/camera-carousel';

// Define the structure for a group of events
// This might be refined later based on the grouping logic in EventCardView
interface EventGroup {
  groupKey: string;
  spaceId?: string;
  spaceName?: string;
  startTime: Date;
  endTime: Date;
  events: EnrichedEvent[];
}

type CardSize = 'small' | 'medium' | 'large';

interface EventGroupCardProps {
  group: EventGroup;
  allDevices: DeviceWithConnector[];
  spaces: Space[];
  isRecentGroup: boolean;
  cardSize: CardSize;
  onPlayVideo?: (bestShotEvent: EnrichedEvent | undefined, spacePikoCamera: DeviceWithConnector | null, allDevices: DeviceWithConnector[]) => void;
}

// --- Removed device summary logic to unify card layouts ---

export const EventGroupCard: React.FC<EventGroupCardProps> = ({ group, allDevices, isRecentGroup, cardSize, onPlayVideo }) => {
  // Destructure group properties first
  const { spaceId, spaceName, startTime, endTime, events, groupKey } = group; 
  const eventCount = events.length;
  const isUnassigned = !spaceId;
  const displayName = isUnassigned ? 'Unassigned Space' : (spaceName ?? '');
  
  // --- UPGRADED: Better timestamp formatting --- 
  const timeRangeText = useMemo(() => {
    const timeFmt = 'h:mm:ss a';
    const isSameDayRange = isSameDay(startTime, endTime);

    const labelFor = (d: Date): string => {
      if (isToday(d)) return '';
      if (isYesterday(d)) return 'Yesterday ';
      return `${format(d, 'MMM d, yyyy')} `;
    };

    // Single moment (under 1 minute duration)
    if (Math.abs(endTime.getTime() - startTime.getTime()) < 60 * 1000) {
      const prefix = labelFor(endTime);
      return `${prefix}${format(startTime, timeFmt)}`;
    }

    // Same-day range
    if (isSameDayRange) {
      const prefix = labelFor(endTime);
      const range = `${format(startTime, timeFmt)} - ${format(endTime, timeFmt)}`;
      return prefix ? `${prefix}${range}` : range;
    }

    // Cross-day range (rare, but handle explicitly)
    const startPrefix = labelFor(startTime);
    const endPrefix = labelFor(endTime);
    return `${startPrefix}${format(startTime, timeFmt)} - ${endPrefix}${format(endTime, timeFmt)}`;
  }, [startTime, endTime]);

  // Find a representative device from the events to determine space cameras
  const representativeDevice = useMemo(() => {
    const deviceIds = events.map(e => e.deviceId);
    return allDevices.find(d => deviceIds.includes(d.deviceId)) || null;
  }, [events, allDevices]);

  // Use multi-camera hook for enhanced camera functionality
  const {
    shouldShowMedia: shouldShowCameras,
    hasMultipleCameras,
    cameras,
    selectedCameraIndex,
    selectCamera,
    selectNext,
    selectPrevious
  } = useDeviceCameraConfig(representativeDevice, {
    spaceId: spaceId,
    spaceName: spaceName || undefined
  });
  
  // --- Enhanced thumbnail logic with camera selection support --- 
  const thumbnailUrl = useMemo(() => {
    // Find cameras based on space associations for devices in the events
    const deviceIds = events.map(e => e.deviceId);
    const devicesInGroup = allDevices.filter(d => deviceIds.includes(d.deviceId));
    
    // Get space IDs from devices that have space associations
    const spaceIds = [...new Set(devicesInGroup
      .map(d => d.spaceId)
      .filter(Boolean)
    )];
    
    // Find cameras in the same spaces
    let spaceCameras = allDevices.filter(device => 
      device.connectorCategory === 'piko' && 
      device.deviceTypeInfo?.type === 'Camera' &&
      spaceIds.includes(device.spaceId)
    );

    // Determine selected camera device if available
    let selectedCameraDevice: DeviceWithConnector | undefined;
    if (cameras.length > 0 && selectedCameraIndex < cameras.length) {
      selectedCameraDevice = allDevices.find(d => d.id === cameras[selectedCameraIndex].id);
      if (selectedCameraDevice) {
        // Put selected camera first in the list for any downstream logic
        spaceCameras = [selectedCameraDevice, ...spaceCameras.filter(c => c.id !== selectedCameraDevice!.id)];
      }
    }
    
    // Choose a representative event/time
    let bestEvent: EnrichedEvent | undefined;
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      const source = getThumbnailSource(event, spaceCameras);
      if (source?.type === 'best-shot') {
        bestEvent = event;
        break;
      }
    }

    const representativeTimestamp = (bestEvent?.timestamp ?? events[events.length - 1]?.timestamp) || Date.now();

    // If a selected camera exists, always show its thumbnail at the representative time
    if (selectedCameraDevice) {
      // Request a smaller thumbnail for card rendering
      return `/api/piko/device-thumbnail?connectorId=${selectedCameraDevice.connectorId}&cameraId=${selectedCameraDevice.deviceId}&timestamp=${representativeTimestamp}&size=640x0`;
    }
    
    // Fallback: previous logic (best-shot or space camera)
    const source = getThumbnailSource(bestEvent || events[events.length - 1], spaceCameras);
    if (!source) return undefined;
    
    return buildThumbnailUrl(source, '640x0');
  }, [events, allDevices, cameras, selectedCameraIndex]);

  // unified layout does not branch on thumbnail presence

  // Get the currently selected camera for video playback (maintains compatibility)
  const spacePikoCamera = cameras.length > 0 ? 
    allDevices.find(d => d.id === cameras[selectedCameraIndex]?.id) || null : 
    null;

  // --- Media aspect ratio (static across sizes) ---
  const mediaAspectClass = 'aspect-video';

  // --- Primary event/type computation aligned with badge logic ---
  const primaryInfo = useMemo(() => {
    const allEventTypes = new Set<EventType>();
    const significantEventTypes = new Set<EventType>();
    const eventTypeCounts = new Map<EventType, number>();

    events.forEach(event => {
      if (!event.eventType) return;
      const eventType = event.eventType as EventType;
      allEventTypes.add(eventType);
      eventTypeCounts.set(eventType, (eventTypeCounts.get(eventType) || 0) + 1);
      if (eventType !== EventType.STATE_CHANGED && eventType !== EventType.BATTERY_LEVEL_CHANGED) {
        significantEventTypes.add(eventType);
      }
    });

    const eventTypesArray = significantEventTypes.size > 0
      ? Array.from(significantEventTypes)
      : Array.from(allEventTypes);

    const firstEventType = eventTypesArray[0];

    // Find most recent event matching the firstEventType
    let primaryEvent: EnrichedEvent | undefined;
    if (firstEventType) {
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].eventType === firstEventType) {
          primaryEvent = events[i];
          break;
        }
      }
    }

    return {
      allEventTypes,
      significantEventTypes,
      eventTypeCounts,
      eventTypesArray,
      firstEventType,
      primaryEvent,
    };
  }, [events]);

  // --- Calculate Group Severity & Styles --- 
  const groupSeverity: SeverityLevel = useMemo(() => getGroupSeverity(group), [group]);
  const severityStyles = useMemo(() => getSeverityCardStyles(groupSeverity), [groupSeverity]);
  // --- END Severity Calculation --- 
  
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null);
  const imageFailed = failedThumbnailUrl === thumbnailUrl;
  const hasImage = !!thumbnailUrl && !imageFailed;

  // Calculate bestShotEvent once, as it's used in multiple places
  const bestShotEvent = useMemo(() => {
    return events.find(event => 
      event.connectorCategory === 'piko' &&
      event.eventCategory === EventCategory.ANALYTICS &&
      event.bestShotUrlComponents?.objectTrackId &&
      event.bestShotUrlComponents?.cameraId &&
      event.bestShotUrlComponents?.connectorId
    ); // Finds first, could be refined to find latest if multiple exist
  }, [events]);

  const handlePlayVideo = () => {
    if (onPlayVideo) {
      onPlayVideo(bestShotEvent, spacePikoCamera, allDevices);
    } else {
      console.warn("[EventGroupCard] onPlayVideo prop not provided.");
      toast.error("Video playback handler not available.");
    }
  };

  return (
    <>
      <Card className={cn(
        "overflow-hidden transition-all duration-150 ease-in-out flex flex-col",
        "border-l-4",
        severityStyles.borderClass,
        "bg-card",
        "shadow-md hover:shadow-lg"
      )}>
        <CardHeader className={cn(
          "p-3 flex-shrink-0"
        )}>
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base font-medium mb-0.5">
                {isUnassigned ? (
                  <span className="text-muted-foreground">{displayName}</span>
                ) : (
                  displayName
                )}
              </CardTitle>
              <CardDescription className="text-xs flex items-center mb-1">
                <Clock className="h-3 w-3 mr-1.5 text-muted-foreground" />
                {timeRangeText}
              </CardDescription>

            </div>
          </div>
        </CardHeader>
        {/* Unified media frame layout with aspect ratio */}
        <div className={cn("relative w-full overflow-hidden group/thumbnail", mediaAspectClass)}>
          <div className="absolute inset-0 bg-muted">
            {hasImage ? (
              <Image
                key={thumbnailUrl}
                src={thumbnailUrl as string}
                alt={`${displayName} thumbnail`}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                className="object-cover transition-transform duration-200 group-hover/thumbnail:scale-105"
                priority={isRecentGroup}
                onError={() => setFailedThumbnailUrl(thumbnailUrl!)}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-background/80 border">
                  {(() => {
                    const rawCategory = primaryInfo.primaryEvent?.eventCategory;
                    const normalizedCategory: EventCategory | undefined = rawCategory && (Object.values(EventCategory) as unknown as string[]).includes(rawCategory as string)
                      ? (rawCategory as unknown as EventCategory)
                      : EventCategory.UNKNOWN;
                    const CategoryIcon = getEventCategoryIcon(normalizedCategory);
                    return <CategoryIcon className="h-6 w-6" />;
                  })()}
                </div>
              </div>
            )}

            {/* Hover overlay actions */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumbnail:opacity-100 transition-opacity duration-200 bg-black/30 space-x-2">
              {hasImage && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-full bg-background/80 hover:bg-background/95 text-foreground/80 hover:text-foreground"
                  onClick={() => setIsPreviewOpen(true)}
                  title="View larger image"
                >
                  <ZoomIn className="h-5 w-5" />
                </Button>
              )}
              {(bestShotEvent || spacePikoCamera) && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-full bg-background/80 hover:bg-background/95 text-foreground/80 hover:text-foreground"
                  onClick={handlePlayVideo}
                  title="Play video"
                >
                  <PlayIcon className="h-5 w-5" />
                </Button>
              )}
              {events.length > 0 && (
                <EventDetailDialogContent event={events[events.length - 1]} events={events} buttonStyle="overlay" />
              )}
            </div>

            {/* Top-left controls/indicators */}
            {hasImage && hasMultipleCameras && (
              <div className="absolute top-2 left-2 z-20">
                <div className="bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1">
                  <CameraCarouselControls
                    cameras={cameras}
                    selectedIndex={selectedCameraIndex}
                    onCameraChange={selectCamera}
                    layout="dots"
                    size="xs"
                    className="text-white"
                  />
                </div>
              </div>
            )}
            {!hasMultipleCameras && cameras.length === 0 && (
              <div className="absolute top-2 left-2 z-20">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="secondary"
                        className="text-[10px] h-4 px-1 bg-black/60 hover:bg-black/70 backdrop-blur-sm text-white flex items-center gap-1"
                      >
                        <VideoOff className="h-3.5 w-3.5" />
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>No associated cameras</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}

            {/* --- METADATA OVERLAY: Event types + Device icons --- */}
            <div className="absolute bottom-1.5 right-1.5 z-10 flex items-center gap-1">
              {(() => {
                const { eventTypesArray, eventTypeCounts, firstEventType } = primaryInfo;
                if (!firstEventType || eventTypesArray.length === 0) return null;

                const firstEventTypeCount = eventTypeCounts.get(firstEventType) || 0;
                const remainingTypesCount = eventTypesArray.length - 1;
                const totalEventsCount = events.length;

                // Device icon sourced from the primary event
                const primaryDeviceType = primaryInfo.primaryEvent?.deviceTypeInfo?.type;
                const DeviceIcon = primaryDeviceType ? getDeviceTypeIcon(primaryDeviceType) : null;

                return (
                  <div className="flex items-center gap-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-4 px-1 bg-black/60 hover:bg-black/70 backdrop-blur-sm text-white flex-shrink-0 flex items-center gap-1 cursor-pointer"
                        >
                          {DeviceIcon && <DeviceIcon className="h-3 w-3" />}
                          {EVENT_TYPE_DISPLAY_MAP[firstEventType] ?? firstEventType}
                          {firstEventTypeCount > 1 && ` (${firstEventTypeCount}x)`}
                        </Badge>
                      </PopoverTrigger>
                      <PopoverContent side="top" align="end" className="w-72 p-0 shadow-xl flex flex-col">
                        <div className="p-3 flex-shrink-0">
                          <p className="font-medium text-sm mb-2">Event Sequence</p>
                        </div>
                        <ScrollArea className="flex-grow min-h-0 w-full" type="scroll">
                          <div className="px-3 pb-3">
                            <div className="relative border-l border-muted ml-1.5 pl-4 space-y-2">
                              {events.map((event) => {
                                const eventTime = new Date(event.timestamp);
                                const DeviceIcon = getDeviceTypeIcon(event.deviceTypeInfo.type);
                                const StateIcon = event.displayState ? getDisplayStateIcon(event.displayState) : null;
                                const stateColor = getDisplayStateColorClass(event.displayState);

                                return (
                                  <div key={event.eventUuid} className="relative">
                                    <div className="absolute left-[-21px] top-1 w-3.5 h-3.5 bg-background border-2 border-border rounded-full"></div>
                                    <div className="text-xs">
                                      <div className="text-muted-foreground text-[11px] mb-0.5 flex items-center">
                                        <Clock className="h-3 w-3 mr-1" />
                                        {format(eventTime, 'h:mm:ss a')}
                                      </div>
                                      <div className="flex items-start gap-1 mb-1">
                                        <DeviceIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
                                        <div className="flex-grow min-w-0">
                                          <div className="font-medium truncate">{event.deviceName || event.deviceId}</div>
                                          <div className="flex items-center flex-wrap gap-1 mt-0.5">
                                            {(event.eventType === EventType.STATE_CHANGED && event.displayState && StateIcon) ? (
                                              <Badge variant="outline" className={cn("text-[10px] h-5 inline-flex items-center gap-1", stateColor)}>
                                                <StateIcon className="h-3 w-3" />
                                                {event.displayState}
                                              </Badge>
                                            ) : (event.eventType !== EventType.STATE_CHANGED && event.eventType !== EventType.BATTERY_LEVEL_CHANGED) ? (
                                              (() => {
                                                const typeName = EVENT_TYPE_DISPLAY_MAP[event.eventType as EventType] ?? event.eventType;
                                                const subtypeName = event.eventSubtype ? (EVENT_SUBTYPE_DISPLAY_MAP[event.eventSubtype] ?? event.eventSubtype) : null;
                                                const fullEventName = subtypeName ? `${typeName} / ${subtypeName}` : typeName;
                                                return (
                                                  <TooltipProvider>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <Badge variant="outline" className="text-[10px] h-5 font-normal">
                                                          <span className="block max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
                                                            {typeName}
                                                            {subtypeName && (
                                                              <span className="text-muted-foreground ml-1">/ {subtypeName}</span>
                                                            )}
                                                          </span>
                                                        </Badge>
                                                      </TooltipTrigger>
                                                      <TooltipContent>
                                                        <p>{fullEventName}</p>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  </TooltipProvider>
                                                );
                                              })()
                                            ) : null}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                    {remainingTypesCount > 0 ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="secondary"
                              className="text-[10px] h-4 px-1 bg-black/60 hover:bg-black/70 backdrop-blur-sm text-white/80"
                            >
                              +{remainingTypesCount}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              {eventTypesArray.slice(1).map(eventType => {
                                const count = eventTypeCounts.get(eventType) || 0;
                                const displayName = EVENT_TYPE_DISPLAY_MAP[eventType] ?? eventType;
                                return count > 1 ? `${displayName} (${count}x)` : displayName;
                              }).join(', ')}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : totalEventsCount > firstEventTypeCount && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] h-4 px-1 bg-black/60 hover:bg-black/70 backdrop-blur-sm text-white/80"
                      >
                        +{totalEventsCount - firstEventTypeCount}
                      </Badge>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </Card>

      {/* Image Preview Dialog */}
      <ImagePreviewDialog 
        isOpen={isPreviewOpen} 
        onOpenChange={setIsPreviewOpen} 
        imageUrl={thumbnailUrl} 
        imageAlt={`${displayName} - Preview`} 
        title={`Preview: ${displayName}`}
      />


    </>
  );
}; 