'use client';

import React, { useMemo, useState } from 'react';
import type { EnrichedEvent } from '@/types/events';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from '@/lib/utils';
import { DeviceType, EventType, EVENT_TYPE_DISPLAY_MAP, DisplayState, EventCategory, EVENT_SUBTYPE_DISPLAY_MAP } from '@/lib/mappings/definitions';
import Image from 'next/image'; // Use Next.js Image for optimization
import { getDeviceTypeIcon, getDisplayStateIcon, getDisplayStateColorClass, getSeverityCardStyles } from '@/lib/mappings/presentation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, formatRelative, formatDistanceToNowStrict } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ConnectorIcon } from '@/components/features/connectors/connector-icon';
import { formatConnectorCategory } from '@/lib/utils';
import type { TypedDeviceInfo } from '@/lib/mappings/definitions';
import { AlertTriangle, MoreHorizontal, Clock, ListTree, Expand, ZoomIn, PlayIcon, Gamepad, ImageOff, Info } from 'lucide-react';
import { LOCKED, UNLOCKED, ON, OFF, OPEN, CLOSED, LEAK_DETECTED, DRY, MOTION_DETECTED, NO_MOTION, VIBRATION_DETECTED, NO_VIBRATION, SensorAlertState } from '@/lib/mappings/definitions'; // <-- Import specific states
import type { DeviceWithConnector, Space } from '@/types/index';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"; // <-- Added Popover imports
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { SeverityLevel, getGroupSeverity } from '@/lib/mappings/severity'; // <-- Added severity imports
import { Button } from "@/components/ui/button";
import { ImagePreviewDialog } from './image-preview-dialog'; // <-- Import the new dialog
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EventDetailDialogContent } from './event-detail-dialog-content'; // <-- Import event detail dialog
import { toast } from 'react-hot-toast';
import { getThumbnailSource, findSpaceCameras, buildThumbnailUrl } from '@/services/event-thumbnail-resolver';

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

// --- Device Summary Logic --- 
interface DeviceSummary {
  deviceId: string;
  deviceName?: string;
  deviceTypeInfo: TypedDeviceInfo;
  connectorCategory: string;
  connectorName?: string;
  latestDisplayState?: DisplayState;
  latestStateTimestamp?: number;
  significantEventTypes: Set<EventType>; // Keep this for quick checks maybe
  significantEvents: EnrichedEvent[];
  eventCount: number;
  priorityScore: number;
}

// Function to calculate priority (adjust weights as needed)
const calculatePriority = (summary: Omit<DeviceSummary, 'priorityScore'>): number => {
  let score = 0;
  if (summary.latestDisplayState) {
    // Higher score for "active" or "alert" states - using imported values
    if ([OPEN, UNLOCKED, LEAK_DETECTED, MOTION_DETECTED, VIBRATION_DETECTED].includes(summary.latestDisplayState)) score += 10;
    else if ([ON].includes(summary.latestDisplayState)) score += 5;
    else score += 1; // Any other state change is notable
  }
  // Add points for significant event types
  summary.significantEventTypes.forEach(type => {
    if ([EventType.ACCESS_DENIED, EventType.DOOR_FORCED_OPEN, EventType.LOITERING, EventType.INTRUSION].includes(type)) score += 15;
    else if ([EventType.ACCESS_GRANTED, EventType.OBJECT_DETECTED].includes(type)) score += 3;
    else score += 1;
  });
  score += summary.eventCount * 0.5; // Minor bonus for more activity
  return score;
};
// --- End Device Summary Logic ---

export const EventGroupCard: React.FC<EventGroupCardProps> = ({ group, allDevices, isRecentGroup, cardSize, onPlayVideo }) => {
  // Destructure group properties first
  const { spaceId, spaceName, startTime, endTime, events, groupKey } = group; 
  const eventCount = events.length;
  
  // --- UPGRADED: Better timestamp formatting --- 
  const timeRangeText = useMemo(() => {
    if (Math.abs(endTime.getTime() - startTime.getTime()) < 60 * 1000) {
      return format(startTime, 'h:mm:ss a');
    }
    return `${format(startTime, 'h:mm:ss a')} - ${format(endTime, 'h:mm:ss a')}`;
  }, [startTime, endTime]);
  
  // --- Find cameras for thumbnail logic --- 
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
    const spaceCameras = allDevices.filter(device => 
      device.connectorCategory === 'piko' && 
      device.deviceTypeInfo?.type === 'Camera' &&
      spaceIds.includes(device.spaceId)
    );
    
    // Try to find the best event for thumbnail (most recent analytics event preferred)
    let bestEvent: EnrichedEvent | undefined;
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      const source = getThumbnailSource(event, spaceCameras);
      if (source?.type === 'best-shot') {
        bestEvent = event;
        break;
      }
    }
    
    // If no best shot event, use the most recent event
    if (!bestEvent) {
      bestEvent = events[events.length - 1];
    }
    
    // Get thumbnail source and build URL
    const source = getThumbnailSource(bestEvent, spaceCameras);
    if (!source) return undefined;
    
    return buildThumbnailUrl(source);
  }, [events, allDevices]);

  const hasThumbnail = !!thumbnailUrl;

  // --- Find camera for video playback logic ---
  const spacePikoCamera = useMemo(() => {
    const deviceIds = events.map(e => e.deviceId);
    const devicesInGroup = allDevices.filter(d => deviceIds.includes(d.deviceId));
    
    // Get space IDs from devices that have space associations
    const spaceIds = [...new Set(devicesInGroup
      .map(d => d.spaceId)
      .filter(Boolean)
    )];
    
    // Find cameras in the same spaces
    const spaceCameras = allDevices.filter(device => 
      device.connectorCategory === 'piko' && 
      device.deviceTypeInfo?.type === 'Camera' &&
      spaceIds.includes(device.spaceId)
    );
    
    return spaceCameras[0] || null;
  }, [events, allDevices]);

  // --- Sizing Logic - SIMPLIFIED --- 
  const cardSizeClass = useMemo(() => {
    // For thumbnail cards, optimized for typical camera image aspect ratios (wider than tall)
    if (hasThumbnail) {
      switch (cardSize) {
        case 'small':
          return "min-h-[160px]"; // Reduced for better image aspect ratio
        case 'medium':
          return "min-h-[200px]"; // Reduced for better image aspect ratio  
        case 'large':
        default:
          return isRecentGroup 
            ? (eventCount > 5 ? "min-h-[280px]" : "min-h-[240px]") // Reduced for better proportions
            : (eventCount > 5 ? "min-h-[240px]" : "min-h-[200px]"); // Better aspect ratio
      }
    } else {
      // Non-thumbnail cards can use smaller heights
      switch (cardSize) {
        case 'small':
          return "min-h-[80px]";
        case 'medium':
          return "min-h-[120px]";
        case 'large':
        default:
          return isRecentGroup 
            ? (eventCount > 5 ? "min-h-[180px]" : "min-h-[140px]")
            : (eventCount > 5 ? "min-h-[140px]" : "min-h-[120px]");
      }
    }
  }, [eventCount, isRecentGroup, cardSize, hasThumbnail]);

  // --- Device Summary Calculation (as before) ---
  const deviceSummaries = useMemo(() => {
    const deviceMap = new Map<string, Omit<DeviceSummary, 'priorityScore'> & { events: EnrichedEvent[] }>();
    const sortedEvents = [...events].sort((a, b) => b.timestamp - a.timestamp);
    sortedEvents.forEach(event => {
      const deviceId = event.deviceId;
      if (!deviceMap.has(deviceId)) {
        deviceMap.set(deviceId, {
          deviceId: deviceId,
          deviceName: event.deviceName,
          deviceTypeInfo: event.deviceTypeInfo,
          connectorCategory: event.connectorCategory,
          connectorName: event.connectorName,
          latestDisplayState: undefined,
          latestStateTimestamp: undefined,
          significantEventTypes: new Set(),
          significantEvents: [],
          eventCount: 0,
          events: []
        });
      }
      const summary = deviceMap.get(deviceId)!;
      summary.eventCount++;
      summary.events.push(event);
      if (event.eventType === EventType.STATE_CHANGED && event.displayState) {
        if (!summary.latestStateTimestamp || event.timestamp > summary.latestStateTimestamp) {
          summary.latestDisplayState = event.displayState;
          summary.latestStateTimestamp = event.timestamp;
        }
      } else {
        if (event.eventType !== EventType.STATE_CHANGED && event.eventType !== EventType.BATTERY_LEVEL_CHANGED) {
          summary.significantEventTypes.add(event.eventType as EventType);
          summary.significantEvents.push(event);
        }
      }
    });
    const finalSummaries: DeviceSummary[] = Array.from(deviceMap.values()).map(summary => ({
      ...summary,
      priorityScore: calculatePriority(summary)
    }));
    return finalSummaries.sort((a, b) => b.priorityScore - a.priorityScore);
  }, [events]);

  // --- Summaries for non-thumbnail view ---
  const MAX_FALLBACK_DEVICES_TO_SHOW = 4;
  const visibleFallbackSummaries = deviceSummaries.slice(0, MAX_FALLBACK_DEVICES_TO_SHOW);
  const hiddenFallbackDeviceCount = deviceSummaries.length - visibleFallbackSummaries.length;

  // --- Summaries for thumbnail overlay icons ---
  const MAX_OVERLAY_ICONS = 3;
  const visibleDeviceSummariesForOverlay = deviceSummaries.slice(0, MAX_OVERLAY_ICONS);
  const hiddenOverlayDeviceCount = deviceSummaries.length - visibleDeviceSummariesForOverlay.length;

  // Function to build detailed summary string for popover/tooltip
  const buildDetailedSummaryString = (summary: DeviceSummary): string => {
      let content = `${summary.deviceName ?? summary.deviceId}`;
      content += ` (${summary.connectorName ?? formatConnectorCategory(summary.connectorCategory)})`;
      if (summary.latestDisplayState && summary.latestStateTimestamp) {
          content += ` -> ${summary.latestDisplayState} (${formatDistanceToNowStrict(new Date(summary.latestStateTimestamp))} ago)`;
      }
      const significantEvents = [...summary.significantEventTypes].map(et => EVENT_TYPE_DISPLAY_MAP[et] ?? et);
      if (significantEvents.length > 0) {
          content += ` | Events: ${significantEvents.join(', ')}`;
      }
      return content;
  };

  // --- Calculate Group Severity & Styles --- 
  const groupSeverity: SeverityLevel = useMemo(() => getGroupSeverity(group), [group]);
  const severityStyles = useMemo(() => getSeverityCardStyles(groupSeverity), [groupSeverity]);
  // --- END Severity Calculation --- 
  
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null);
  const imageFailed = failedThumbnailUrl === thumbnailUrl;

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
        cardSizeClass, // Standard min-height
        "bg-card" // Standard background
      )}>
        <CardHeader className={cn(
          "p-3 flex-shrink-0"
        )}>
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base font-medium mb-0.5 truncate">
                {spaceName ?? 'Unassigned Space'}
              </CardTitle>
              <CardDescription className="text-xs flex items-center mb-1">
                <Clock className="h-3 w-3 mr-1.5 text-muted-foreground" />
                {timeRangeText}
              </CardDescription>

            </div>
          </div>
        </CardHeader>
        {hasThumbnail && thumbnailUrl ? (
           // Thumbnail layout - extends to card edges with overlaid header
           <div className="relative flex-grow flex flex-col overflow-hidden">
             {/* Thumbnail takes full available space */}
             <div className="absolute inset-0 bg-muted group/thumbnail">
               {!imageFailed ? (
                 <Image 
                   src={thumbnailUrl} 
                   alt={`${spaceName ?? 'Event'} thumbnail`} 
                   fill
                   sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                   className="object-cover transition-transform duration-200 group-hover/thumbnail:scale-105"
                   priority={isRecentGroup}
                   onError={() => setFailedThumbnailUrl(thumbnailUrl)}
                 />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <div className="flex items-center justify-center h-12 w-12 rounded-full bg-background/80 border">
                    <ImageOff className="h-6 w-6" />
                  </div>
                </div>
              )}



              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumbnail:opacity-100 transition-opacity duration-200 bg-black/30 space-x-2">
                {!imageFailed && (
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
{events.length > 0 && <EventDetailDialogContent event={events[events.length - 1]} events={events} buttonStyle="overlay" />}
              </div>

              {/* --- METADATA OVERLAY: Event types + Device icons --- */}
              <div className="absolute bottom-1.5 right-1.5 z-10 flex items-center gap-1">
                {/* Event type badges */}
                {(() => {
                  const allEventTypes = new Set<EventType>();
                  const significantEventTypes = new Set<EventType>();
                  const eventTypeCounts = new Map<EventType, number>();
                  
                  // Collect all event types from the group and count them
                  events.forEach(event => {
                    if (event.eventType) {
                      const eventType = event.eventType as EventType;
                      allEventTypes.add(eventType);
                      eventTypeCounts.set(eventType, (eventTypeCounts.get(eventType) || 0) + 1);
                    }
                  });
                  
                  // Also collect significant event types (prioritize these)
                  deviceSummaries.forEach(summary => {
                    summary.significantEventTypes.forEach(type => significantEventTypes.add(type));
                  });
                  
                  // Prioritize significant events, then fall back to any events
                  const eventTypesArray = significantEventTypes.size > 0 
                    ? Array.from(significantEventTypes)
                    : Array.from(allEventTypes);
                  
                  if (eventTypesArray.length === 0) return null;
                  
                  const firstEventType = eventTypesArray[0];
                  const firstEventTypeCount = eventTypeCounts.get(firstEventType) || 0;
                  const remainingTypesCount = eventTypesArray.length - 1;
                  const totalEventsCount = events.length;
                  
                  // Get the most relevant device type for icon
                  const primaryDeviceType = deviceSummaries.length > 0 
                    ? deviceSummaries[0].deviceTypeInfo.type 
                    : events[0]?.deviceTypeInfo?.type;
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
                            {/* --- Integrated Timeline --- */}
                            <div className="px-3 pb-3">
                              <div className="relative border-l border-muted ml-1.5 pl-4 space-y-2">
                                {events.map((event, index) => {
                                  const eventTime = new Date(event.timestamp);
                                  const DeviceIcon = getDeviceTypeIcon(event.deviceTypeInfo.type);
                                  const StateIcon = event.displayState ? getDisplayStateIcon(event.displayState) : null;
                                  const stateColor = getDisplayStateColorClass(event.displayState);
                                  
                                  return (
                                    <div key={event.eventUuid} className="relative">
                                      {/* Timeline node */}
                                      <div className="absolute left-[-21px] top-1 w-3.5 h-3.5 bg-background border-2 border-border rounded-full"></div>
                                      
                                      {/* Event content */}
                                      <div className="text-xs">
                                        {/* Time */}
                                        <div className="text-muted-foreground text-[11px] mb-0.5 flex items-center">
                                          <Clock className="h-3 w-3 mr-1" />
                                          {format(eventTime, 'h:mm:ss a')}
                                        </div>
                                        
                                        {/* Event summary */}
                                        <div className="flex items-start gap-1 mb-1">
                                          <DeviceIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
                                          <div className="flex-grow min-w-0">
                                            <div className="font-medium truncate">
                                              {event.deviceName || event.deviceId}
                                            </div>
                                            
                                            <div className="flex items-center flex-wrap gap-1 mt-0.5">
                                              {(event.eventType === EventType.STATE_CHANGED && event.displayState && StateIcon) ? (
                                                <Badge variant="outline" className={cn("text-[10px] h-5 inline-flex items-center gap-1", stateColor)}>
                                                  <StateIcon className="h-3 w-3" />
                                                  {event.displayState}
                                                </Badge>
                                              ) : (event.eventType === EventType.BUTTON_PRESSED || event.eventType === EventType.BUTTON_LONG_PRESSED) ? (
                                                // Special case for Smart Fob button events - simple inline
                                                <Badge variant="outline" className="text-[10px] h-5 inline-flex items-center gap-1">
                                                  <Gamepad className="h-3 w-3" />
                                                  Button {String(event.payload?.buttonNumber || '?')} {event.eventType === EventType.BUTTON_LONG_PRESSED ? '(Long)' : ''}
                                                </Badge>
                                              ) : (event.eventType !== EventType.STATE_CHANGED && event.eventType !== EventType.BATTERY_LEVEL_CHANGED) ? (
                                                // For other significant events, show Type / Subtype styled like the table view
                                                (() => {
                                                  const typeName = EVENT_TYPE_DISPLAY_MAP[event.eventType as EventType] ?? event.eventType;
                                                  const subtypeName = event.eventSubtype ? (EVENT_SUBTYPE_DISPLAY_MAP[event.eventSubtype] ?? event.eventSubtype) : null;
                                                  const fullEventName = subtypeName ? `${typeName} / ${subtypeName}` : typeName;
                                                  
                                                  return (
                                                    <TooltipProvider>
                                                      <Tooltip>
                                                        <TooltipTrigger asChild>
                                                          {/* Mimic table view badge style */}
                                                          <Badge variant="outline" className="text-[10px] h-5 font-normal">
                                                            {/* Span inside handles truncation */}
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
        ) : (
          <CardContent className={cn(
            "p-3 pt-0 flex-grow flex flex-col min-h-0"
          )}>
            <div className="flex-grow flex flex-col justify-center gap-1.5 py-1 px-3">
              {visibleFallbackSummaries.length > 0 ? (
                <TooltipProvider>
                  {visibleFallbackSummaries.map((summary) => {
                    const DeviceIcon = getDeviceTypeIcon(summary.deviceTypeInfo.type);
                    const StateIcon = summary.latestDisplayState ? getDisplayStateIcon(summary.latestDisplayState) : null;
                    const stateColor = summary.latestDisplayState ? getDisplayStateColorClass(summary.latestDisplayState) : 'text-muted-foreground';
                    const hasSignificantEvents = summary.significantEventTypes.size > 0;
                    
                    return (
                      <Tooltip key={summary.deviceId} delayDuration={100}>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="font-normal px-1.5 py-0.5 text-xs w-full justify-start h-auto">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <DeviceIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                              <span className="truncate flex-grow" title={summary.deviceName ?? summary.deviceId}>{summary.deviceName ?? summary.deviceId}</span>
                              <ConnectorIcon connectorCategory={summary.connectorCategory} size={12} className="flex-shrink-0 opacity-70"/>
                              {StateIcon && summary.latestDisplayState && (
                                <span className={cn("ml-auto pl-1 flex items-center gap-0.5 flex-shrink-0", stateColor)}>
                                  <StateIcon className="h-3 w-3" /> 
                                  <span className="text-xs">{summary.latestDisplayState}</span>
                                </span>
                              )}
                              {hasSignificantEvents && !StateIcon && (
                                 <AlertTriangle className="h-3 w-3 ml-auto pl-1 text-amber-600 flex-shrink-0" /> 
                              )} 
                            </div>
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" align="start" className="whitespace-pre-wrap text-xs">
                          {buildDetailedSummaryString(summary)}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                  {hiddenFallbackDeviceCount > 0 && (
                     <div className="text-center text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                       <MoreHorizontal className="h-3 w-3" />
                       {hiddenFallbackDeviceCount} more device{hiddenFallbackDeviceCount !== 1 ? 's' : ''}
                     </div>
                  )}
                  {/* Event details access for cards without thumbnails */}
                  <div className="flex justify-end mt-2">
    {events.length > 0 && <EventDetailDialogContent event={events[events.length - 1]} events={events} buttonStyle="overlay" />}
                  </div>
                </TooltipProvider>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2">
                  <p className="text-xs text-muted-foreground text-center">No device activity to summarize.</p>
  {events.length > 0 && <EventDetailDialogContent event={events[events.length - 1]} events={events} buttonStyle="overlay" />}
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Image Preview Dialog */}
      <ImagePreviewDialog 
        isOpen={isPreviewOpen} 
        onOpenChange={setIsPreviewOpen} 
        imageUrl={thumbnailUrl} 
        imageAlt={`${spaceName ?? 'Event'} - Preview`} 
        title={`Preview: ${spaceName ?? groupKey}`}
      />


    </>
  );
}; 