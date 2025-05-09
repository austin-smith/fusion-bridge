'use client';

import React, { useMemo } from 'react';
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
import { AlertTriangle, MoreHorizontal, Clock, ListTree } from 'lucide-react';
import { LOCKED, UNLOCKED, ON, OFF, OPEN, CLOSED, LEAK_DETECTED, DRY, MOTION_DETECTED, NO_MOTION, VIBRATION_DETECTED, NO_VIBRATION, SensorAlertState } from '@/lib/mappings/definitions'; // <-- Import specific states
import type { DeviceWithConnector, Area } from '@/types/index'; // <-- Added Area, DeviceWithConnector
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"; // <-- Added Popover imports
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { SeverityLevel, getGroupSeverity } from '@/lib/mappings/severity'; // <-- Added severity imports
import { Button } from "@/components/ui/button";

// Define the structure for a group of events
// This might be refined later based on the grouping logic in EventCardView
interface EventGroup {
  groupKey: string;
  areaId?: string;
  areaName?: string;
  startTime: Date;
  endTime: Date;
  events: EnrichedEvent[];
}

interface EventGroupCardProps {
  group: EventGroup;
  allDevices: DeviceWithConnector[];
  areas: Area[];
  isRecentGroup: boolean;
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
  significantEvents: EnrichedEvent[]; // <-- NEW: Store the actual events
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

export const EventGroupCard: React.FC<EventGroupCardProps> = ({ group, allDevices, areas, isRecentGroup }) => {
  // Destructure group properties first
  const { areaId, areaName, startTime, endTime, events, groupKey } = group; 
  const eventCount = events.length;
  
  // --- UPGRADED: Better timestamp formatting --- 
  const timeRangeText = useMemo(() => {
    if (Math.abs(endTime.getTime() - startTime.getTime()) < 60 * 1000) {
      return format(startTime, 'h:mm:ss a');
    }
    return `${format(startTime, 'h:mm:ss a')} - ${format(endTime, 'h:mm:ss a')}`;
  }, [startTime, endTime]);

  // Debug logs
  // console.log(`[EventGroupCard] Received areas prop for group ${groupKey}:`, areas);
  // console.log(`[EventGroupCard] Rendering Group: ${groupKey}, Area ID: ${areaId}, Area Name: ${areaName}`);

  // --- Area Piko Camera Calculation (as before) --- 
  const areaPikoCamera = useMemo(() => {
    if (!areaId) return null;
    const currentArea = areas.find(a => a.id === areaId);
    if (!currentArea || !currentArea.deviceIds || currentArea.deviceIds.length === 0) return null;
    const areaDeviceIds = new Set(currentArea.deviceIds);
    const foundCamera = allDevices.find(device => 
        areaDeviceIds.has(device.id) && 
        device.deviceTypeInfo?.type === DeviceType.Camera &&
        device.connectorCategory === 'piko' &&
        device.connectorId && 
        device.deviceId
    );
    return foundCamera || null; // Ensure null return if not found
  }, [areaId, allDevices, areas]); // Correct dependencies

  // --- UPDATED Thumbnail Logic --- 
  const thumbnailUrl = useMemo(() => {
    let bestShotEvent: EnrichedEvent | undefined = undefined;
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (
        event.connectorCategory === 'piko' &&
        event.eventCategory === EventCategory.ANALYTICS &&
        event.bestShotUrlComponents?.objectTrackId &&
        event.bestShotUrlComponents?.cameraId &&
        event.bestShotUrlComponents?.connectorId
      ) {
        bestShotEvent = event;
        break;
      }
    }

    if (bestShotEvent && bestShotEvent.bestShotUrlComponents) {
      const { connectorId, cameraId, objectTrackId } = bestShotEvent.bestShotUrlComponents;
      const url = `/api/piko/best-shot?connectorId=${connectorId}&cameraId=${cameraId}&objectTrackId=${objectTrackId}`;
      // console.log(`[EventGroupCard] Using Best Shot URL: ${url}`);
      return url;
    }

    if (areaPikoCamera) { 
      const timestampMs = endTime.getTime(); 
      // Ensure areaPikoCamera properties are accessed safely
      if (areaPikoCamera.connectorId && areaPikoCamera.deviceId) {
        const url = `/api/piko/device-thumbnail?connectorId=${areaPikoCamera.connectorId}&cameraId=${areaPikoCamera.deviceId}&timestamp=${timestampMs}`;
        // console.log(`[EventGroupCard] Using Area Thumbnail URL: ${url}`);
        return url;
      }
    }
    
    // console.log(`[EventGroupCard] No thumbnail URL found for group ${groupKey}`);
    return undefined;

  }, [events, areaPikoCamera, endTime, groupKey]); // Added groupKey to dependency for logging

  // --- Sizing Logic (as before) --- 
  const cardSizeClass = useMemo(() => {
    if (isRecentGroup) {
      return eventCount > 5 ? "min-h-[220px]" : "min-h-[180px]";
    }
    return eventCount > 5 ? "min-h-[180px]" : "min-h-[140px]";
  }, [eventCount, isRecentGroup]);
  const hasThumbnail = !!thumbnailUrl;

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
  
  return (
    // --- Apply Severity Border --- 
    <Card className={cn(
      "overflow-hidden transition-all duration-150 ease-in-out flex flex-col",
      "border-l-4",
      severityStyles.borderClass,
      cardSizeClass, // Standard min-height
      "bg-card" // Standard background
    )}>
      <CardHeader className={cn(
        "p-3 flex-shrink-0" // Standard padding, no conditional border
      )}>
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <CardTitle className="block text-base font-medium mb-0.5 truncate">{areaName ?? 'Unassigned Area'}</CardTitle>
            <CardDescription className="text-xs flex items-center">
              <Clock className="h-3 w-3 mr-1.5 text-muted-foreground" />
              {timeRangeText}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn(
        "p-3 pt-0 flex-grow flex flex-col min-h-0" // Standard padding
      )}>
        {hasThumbnail ? (
          <div className="aspect-video bg-muted rounded-md relative overflow-hidden">
            <Image 
              src={thumbnailUrl} 
              alt={`${areaName ?? 'Event'} thumbnail`} 
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
             {/* Fallback for image error */} 
             <div 
               className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground text-xs opacity-0"
               style={{ display: 'none' }}
               ref={(el) => { 
                 if (el?.previousSibling instanceof HTMLImageElement) {
                   el.previousSibling.addEventListener('error', () => {
                     el.style.display = 'flex'; 
                     el.style.opacity = '1';
                   });
                 }
               }}
             >
               Error loading image
             </div>

            {/* Conditionally show event count badge */}
            {eventCount > 1 && (
              <div className="absolute top-1.5 left-1.5 z-10">
                <Badge variant="secondary" className="bg-black/60 hover:bg-black/70 backdrop-blur-sm">
                  {eventCount} events
                </Badge>
              </div>
            )}

            {/* --- ICON OVERLAY uses deviceSummaries --- */}
            {deviceSummaries.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <div className="absolute bottom-1.5 right-1.5 z-10 flex items-center gap-0.5 p-0.5 rounded-sm bg-black/60 backdrop-blur-sm cursor-pointer hover:bg-black/75">
                    {/* Use renamed variable for visible icons */}
                    {visibleDeviceSummariesForOverlay.map(summary => {
                      const Icon = getDeviceTypeIcon(summary.deviceTypeInfo.type);
                      const hasSignificant = summary.significantEventTypes.size > 0;
                      const stateColor = getDisplayStateColorClass(summary.latestDisplayState);
                      return (
                        <div key={summary.deviceId} className={cn("p-0.5 rounded-sm relative", 
                            hasSignificant ? "bg-amber-500/30" : "bg-transparent"
                          )}>
                          <Icon className={cn("h-3.5 w-3.5", stateColor === 'text-muted-foreground' ? 'text-white/70' : stateColor)} />
                        </div>
                      );
                    })}
                    {/* Use hiddenOverlayDeviceCount */}
                    {(hiddenOverlayDeviceCount > 0) && (
                        <div className="p-0.5 rounded-sm">
                            <MoreHorizontal className="h-3.5 w-3.5 text-white/70" />
                        </div>
                    )}
                  </div>
                </PopoverTrigger>
                <PopoverContent side="top" align="end" className="w-72 p-0 shadow-xl">
                  <div className="p-3">
                    <p className="font-medium text-sm mb-2">Event Sequence</p>
                  </div>
                  <ScrollArea className="max-h-[300px] w-full">
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
                                      ) : (event.eventType !== EventType.STATE_CHANGED && event.eventType !== EventType.BATTERY_LEVEL_CHANGED) ? (
                                        // For other significant events, show Type / Subtype styled like the table view
                                        (() => {
                                          const typeName = EVENT_TYPE_DISPLAY_MAP[event.eventType as EventType] ?? event.eventType;
                                          const subtypeName = event.eventSubtype ? (EVENT_SUBTYPE_DISPLAY_MAP[event.eventSubtype] ?? event.eventSubtype) : null;
                                          const fullEventName = subtypeName ? `${typeName} / ${subtypeName}` : typeName;
                                          
                                          return (
                                            <TooltipProvider delayDuration={100}>
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
            )}
          </div>
        ) : (
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
              </TooltipProvider>
            ) : (
              <p className="text-xs text-muted-foreground text-center m-auto">No device activity to summarize.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}; 