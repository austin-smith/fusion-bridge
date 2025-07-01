'use client';

import React, { useMemo } from 'react';
import type { EnrichedEvent } from '@/types/events';
import type { Area } from '@/types/index';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EventGroupCard } from './EventGroupCard'; // Import the actual card
import { differenceInMinutes, isToday, isYesterday, formatRelative } from 'date-fns';
import type { DeviceWithConnector } from '@/types/index'; // <-- Added DeviceWithConnector
import { clusterEventsByProximity } from '@/lib/events/contextual-event-grouper';
import { cn } from '@/lib/utils';

interface EventCardViewProps {
  events: EnrichedEvent[];
  areas: Area[]; // Pass areas for potential grouping/filtering
  allDevices: DeviceWithConnector[]; // <-- Added allDevices prop
}

// Define the structure for a group of events (matching EventGroupCard's expectation)
interface EventGroup {
  groupKey: string;
  areaId?: string;
  areaName?: string;
  startTime: Date; // Earliest event time in the group
  endTime: Date; // Latest event time in the group
  events: EnrichedEvent[];
}

const GROUPING_TIME_WINDOW_MS = 60 * 1000; // 1 minute

export const EventCardView: React.FC<EventCardViewProps> = ({ events, areas, allDevices }) => {

  const areaMap = useMemo(() => { 
    return new Map(areas.map(area => [area.id, area.name]));
  }, [areas]);

  const timeSegments = useMemo(() => {
    // 1. Cluster events using the new contextual grouper
    const contextualEventGroups = clusterEventsByProximity(events);

    if (contextualEventGroups.length === 0) {
      return [];
    }

    // 2. Segment these contextually formed groups into time buckets
    const segments: { label: string; groups: EventGroup[] }[] = [];
    const now = new Date();

    // Adjust cutoff to 15 minutes ago
    const recentCutoff = new Date(now.getTime() - 15 * 60 * 1000); // 15 minutes ago 
    const hourCutoff = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago

    const recentGroups: EventGroup[] = [];
    const pastHourGroups: EventGroup[] = [];
    const todayGroups: EventGroup[] = [];
    const yesterdayGroups: EventGroup[] = [];
    const olderGroups: EventGroup[] = [];

    for (const group of contextualEventGroups) { // Operate on new groups
      if (group.endTime > recentCutoff) {
        recentGroups.push(group);
      } else if (group.endTime > hourCutoff) {
        pastHourGroups.push(group);
      } else if (isToday(group.endTime)) {
        todayGroups.push(group);
      } else if (isYesterday(group.endTime)) {
        yesterdayGroups.push(group);
      } else {
        olderGroups.push(group);
      }
    }

    // Sort each segment's groups by timestamp (newest first)
    const sortNewestFirst = (a: EventGroup, b: EventGroup) => b.endTime.getTime() - a.endTime.getTime();
    
    recentGroups.sort(sortNewestFirst);
    pastHourGroups.sort(sortNewestFirst);
    todayGroups.sort(sortNewestFirst);
    yesterdayGroups.sort(sortNewestFirst);
    olderGroups.sort(sortNewestFirst);

    if (recentGroups.length > 0) segments.push({ label: 'Recent', groups: recentGroups });
    if (pastHourGroups.length > 0) segments.push({ label: 'Past Hour', groups: pastHourGroups });
    if (todayGroups.length > 0) segments.push({ label: 'Today', groups: todayGroups });
    if (yesterdayGroups.length > 0) segments.push({ label: 'Yesterday', groups: yesterdayGroups });
    if (olderGroups.length > 0) segments.push({ label: 'Older', groups: olderGroups });

    return segments;

  }, [events]); // Recalculate when events or areas change. clusterEventsByProximity is pure.

  if (!events || events.length === 0) {
    return (
      <div className="flex-grow flex items-center justify-center p-4">
        <p className="text-muted-foreground">
            No events have been received yet. This page will update periodically.
        </p>
      </div>
    );
  }
  
  if (timeSegments.length === 0 && events.length > 0) {
     // Handle the case where processing might be happening or resulted in no segments
     return (
        <div className="flex-grow flex items-center justify-center p-4">
            <p className="text-muted-foreground">Processing events...</p>
        </div>
     );
  }

  return (
    <ScrollArea className="flex-grow h-full">
      <div className="p-4 space-y-6">
        {timeSegments.map((segment, segIndex) => {
          return (
            <div key={segment.label + segIndex}>
              <div className="flex items-center mb-3 sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  {segment.label}
                </h3>
                <div className="flex-grow border-t border-border ml-4"></div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {segment.groups.map((group) => {
                  return (
                    <EventGroupCard
                      key={group.groupKey}
                      group={group}
                      allDevices={allDevices}
                      areas={areas}
                      isRecentGroup={segment.label === 'Recent'}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
};
