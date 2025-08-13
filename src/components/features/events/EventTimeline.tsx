import React, { useMemo } from 'react';
import type { DashboardEvent } from '@/app/api/events/dashboard/route';
import type { DeviceWithConnector } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { intermediateStateToDisplayString } from '@/lib/mappings/presentation';
import { getDeviceTypeIcon, getDisplayStateIcon, getEventCategoryIcon, getIconComponentByName } from '@/lib/mappings/presentation';
import { EVENT_CATEGORY_DISPLAY_MAP, EVENT_SUBTYPE_DISPLAY_MAP, EVENT_TYPE_DISPLAY_MAP, EventType, EventSubtype, DeviceType } from '@/lib/mappings/definitions';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { formatDistanceToNow, format } from 'date-fns';
import { MapPin, Clock, Layers, Camera } from 'lucide-react';
import Image from 'next/image';
import { buildThumbnailUrl } from '@/services/event-thumbnail-resolver';

// --- Grouping Logic ---

export interface EventGroup {
  id: string;
  spaceId?: string | null;
  spaceName?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  startTime: Date;
  endTime: Date;
  events: DashboardEvent[];
}

// Time difference threshold in milliseconds (e.g., 5 minutes)
const GROUPING_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Groups chronologically sorted events based on time proximity and location/space.
 */
export function groupEventsByTimeAndLocation(events: DashboardEvent[]): EventGroup[] {
  if (!events || events.length === 0) {
    return [];
  }

  const groups: EventGroup[] = [];
  let currentGroup: EventGroup | null = null;

  for (const event of events) {
    if (!currentGroup) {
      // Start the first group
      currentGroup = {
        id: event.eventId,
        spaceId: event.spaceId,
        spaceName: event.spaceName,
        locationId: event.locationId,
        locationName: event.locationName,
        startTime: event.timestamp,
        endTime: event.timestamp,
        events: [event],
      };
      groups.push(currentGroup);
      continue;
    }

    // Check time difference with the *last* event in the current group
    const timeDiff = currentGroup.endTime.getTime() - event.timestamp.getTime(); // Current group end is latest, event is earlier

    // Check location match
    const sameLocation = (
      (event.spaceId && event.spaceId === currentGroup.spaceId) ||
      (!event.spaceId && !currentGroup.spaceId && event.locationId && event.locationId === currentGroup.locationId) ||
      (!event.spaceId && !currentGroup.spaceId && !event.locationId && !currentGroup.locationId)
    );

    if (timeDiff <= GROUPING_THRESHOLD_MS && sameLocation) {
      // Add to current group
      currentGroup.events.push(event);
      // Update group start time if this event is earlier
      if (event.timestamp < currentGroup.startTime) {
        currentGroup.startTime = event.timestamp;
      }
      // End time is always the latest event's time in the sorted list within the group
      // (already handled by initial sort + group creation logic)
    } else {
      // Start a new group
      currentGroup = {
        id: event.eventId,
        spaceId: event.spaceId,
        spaceName: event.spaceName,
        locationId: event.locationId,
        locationName: event.locationName,
        startTime: event.timestamp,
        endTime: event.timestamp,
        events: [event],
      };
      groups.push(currentGroup);
    }
  }

  // Reverse events within each group so the latest appears first visually
  groups.forEach(group => group.events.reverse());

  return groups;
}

// --- Timeline Component ---

interface EventTimelineProps {
  events: DashboardEvent[];
  allDevices: DeviceWithConnector[];
}

export function EventTimeline({ events, allDevices }: EventTimelineProps) {
  const groupedEvents = groupEventsByTimeAndLocation(events);

  // Pre-calculate a map for faster device lookup by ID
  const deviceMap = useMemo(() => {
    const map = new Map<string, DeviceWithConnector>();
    allDevices.forEach(device => map.set(device.id, device));
    return map;
  }, [allDevices]);

  // Pre-calculate a map of spaceId to Piko Cameras in that space
  const spaceCameraMap = useMemo(() => {
    const map = new Map<string, DeviceWithConnector[]>();
    allDevices.forEach(device => {
      // Check if it's a Piko camera and has a spaceId
      const deviceInfo = getDeviceTypeInfo(device.connectorCategory, device.type);
      const spaceId = (device as any).spaceId;

      if (
        device.connectorCategory === 'piko' && 
        deviceInfo.type === DeviceType.Camera &&
        spaceId 
      ) {
        if (!map.has(spaceId)) {
          map.set(spaceId, []);
        }
        map.get(spaceId)?.push(device);
      }
    });
    return map;
  }, [allDevices]);

  if (groupedEvents.length === 0) {
    return <p className="text-muted-foreground">No events to display.</p>;
  }

  return (
    <TooltipProvider delayDuration={100}>
      <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:h-full before:w-0.5 before:bg-linear-to-b before:from-transparent before:via-slate-300 before:to-transparent dark:before:via-slate-700">
        {groupedEvents.map((group) => {

          // Find Piko Camera for this group's space
          const pikoCamera = group.spaceId ? spaceCameraMap.get(group.spaceId)?.[0] : undefined;
          const thumbnailUrl = pikoCamera 
            ? buildThumbnailUrl({
                type: 'space-camera',
                connectorId: pikoCamera.connectorId,
                cameraId: pikoCamera.deviceId,
                timestamp: group.endTime.getTime(),
              })
            : null;

          return (
          <div key={group.id} className="relative">
            {/* Group Header / Time Marker */}
            <div className="flex items-start mb-4">
                {/* Icon container */}
                <div className="shrink-0 w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shadow-md">
                    {thumbnailUrl ? (
                        <Camera className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    ) : (
                        <Layers className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    )}
                </div>
                {/* Text content */}
                <div className="ml-4 grow">
                   <h3 className="text-lg font-semibold">
                       {group.spaceName ? (
                           <>
                               <MapPin className="inline-block w-4 h-4 mr-1.5 text-blue-500" /> {group.spaceName}
                               {group.locationName && <span className="text-sm text-muted-foreground ml-1">({group.locationName})</span>}
                           </>
                       ) : group.locationName ? (
                           <>
                               <MapPin className="inline-block w-4 h-4 mr-1.5 text-indigo-500" /> {group.locationName}
                           </>
                       ) : (
                           <span className="text-muted-foreground italic">Events (No Space/Location)</span>
                       )}
                   </h3>
                   <Tooltip>
                       <TooltipTrigger asChild>
                           <p className="text-sm text-muted-foreground cursor-help flex items-center">
                               <Clock className="w-3.5 h-3.5 mr-1.5" />
                               {formatDistanceToNow(group.endTime, { addSuffix: true })} (Duration: {formatDistanceToNow(group.startTime, { addSuffix: false, includeSeconds: true })})
                           </p>
                       </TooltipTrigger>
                       <TooltipContent side="bottom">
                           {format(group.startTime, 'PPpp')} - {format(group.endTime, 'PPpp')}
                       </TooltipContent>
                   </Tooltip>
                </div>
                 {/* Thumbnail (if exists) */}
                 {thumbnailUrl && (
                     <div className="ml-4 shrink-0 w-24 h-16 relative rounded overflow-hidden shadow-md">
                         <Image
                             src={thumbnailUrl}
                             alt={`Camera view for ${group.spaceName || 'space'} around ${format(group.endTime, 'p')}`}
                             fill
                             style={{ objectFit: 'cover' }}
                             sizes="(max-width: 768px) 10vw, 6rem"
                             onError={(e) => { 
                                 console.warn(`Failed to load thumbnail: ${thumbnailUrl}`);
                             }}
                         />
                     </div>
                 )}
            </div>

            {/* Events within the group */}
            <div className="ml-5 pl-10 space-y-4 border-l-4 border-transparent group-hover:border-slate-200 dark:group-hover:border-slate-800 transition-colors duration-200">
              {group.events.map((event: DashboardEvent) => {
                const DeviceIcon = event.deviceInfo ? getDeviceTypeIcon(event.deviceInfo.type) : getDeviceTypeIcon(DeviceType.Unmapped);
                const StateIcon = event.payload.displayState ? getDisplayStateIcon(event.payload.displayState) : null;
                const CategoryIcon = getEventCategoryIcon(event.category);
                const displayState = intermediateStateToDisplayString(event.payload.intermediateState, event.deviceInfo);
                const typeDisplay = EVENT_TYPE_DISPLAY_MAP[event.type as EventType] || event.type;
                const subtypeDisplay = event.subtype ? EVENT_SUBTYPE_DISPLAY_MAP[event.subtype as EventSubtype] : null;

                return (
                    <Card
                      key={event.eventId}
                      className="shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
                    >
                      <CardHeader className="p-3 bg-muted/30">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <DeviceIcon className="w-5 h-5 text-primary" />
                                <CardTitle className="text-base font-medium">
                                    {event.deviceName || event.deviceId}
                                </CardTitle>
                                {event.deviceInfo?.subtype && <Badge variant="outline" className="text-xs">{event.deviceInfo.subtype}</Badge>}
                            </div>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="text-xs text-muted-foreground cursor-help">
                                        {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {format(event.timestamp, 'PPpp')}
                                </TooltipContent>
                           </Tooltip>
                        </div>
                      </CardHeader>
                      <CardContent className="p-3 text-sm">
                          <div className="flex items-center space-x-2 mb-1">
                             <CategoryIcon className="w-4 h-4 text-muted-foreground" />
                             <span>{typeDisplay}</span>
                             {subtypeDisplay && <Badge variant="secondary">{subtypeDisplay}</Badge>}
                          </div>
                          {displayState && (
                            <div className="flex items-center space-x-2">
                               {StateIcon && <StateIcon className={`w-4 h-4 ${displayState === 'Open' || displayState === 'Leak Detected' || displayState === 'Motion Detected' || displayState === 'Vibration Detected' ? 'text-destructive' : 'text-green-600'}`} />}
                               <span>{displayState}</span>
                            </div>
                          )}
                         {/* Optionally display raw payload for debugging */}
                         {/* <pre className="mt-2 text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 p-2 rounded">{JSON.stringify(event.payload, null, 2)}</pre> */}
                      </CardContent>
                       {/* <CardFooter className="p-2 text-xs text-muted-foreground bg-muted/20">
                          Connector: {event.connectorName} ({event.connectorCategory})
                      </CardFooter> */}
                    </Card>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
} 