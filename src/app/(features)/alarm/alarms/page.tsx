'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useFusionStore } from '@/stores/store';
import type { AlarmZone } from '@/types/index';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ShieldOff, ShieldMinus, CheckCircle, Building } from 'lucide-react';
import { ArmedState, ArmedStateDisplayNames } from '@/lib/mappings/definitions';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Type alias for alarm zones with location name from API
type AlarmZoneWithLocationName = AlarmZone & { locationName?: string };

// Skeleton Component for Active Alarms Page
const AlarmsPageSkeleton = ({ cardCount = 6 }: { cardCount?: number }) => {
  return (
    <div className="grid gap-6 mt-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
      {[...Array(cardCount)].map((_, cardIndex) => (
        <Card key={cardIndex} className="border-2 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-7 w-32" /> {/* Zone name */}
              <Skeleton className="h-6 w-20" /> {/* Status badge */}
            </div>
            <div className="flex items-center gap-1">
              <Skeleton className="h-3 w-3" /> {/* Building icon */}
              <Skeleton className="h-4 w-24" /> {/* Location name */}
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-2 pb-4">
            <Skeleton className="h-4 w-40" /> {/* Triggered time */}
            <Skeleton className="h-4 w-32" /> {/* Reason */}
          </CardContent>
          <CardFooter className="flex gap-2">
            <Skeleton className="h-10 flex-1" /> {/* Clear button */}
            <Skeleton className="h-10 flex-1" /> {/* Clear & Disarm button */}
          </CardFooter>
        </Card>
      ))}
    </div>
  );
};

const AlarmsPage: React.FC = () => {

  // Set page title
  useEffect(() => {
    document.title = 'Active Alarms // Fusion';
  }, []);

  const {
    alarmZones,
    isLoadingAlarmZones,
    fetchAlarmZones,
    updateAlarmZoneArmedState,
    isLoadingDashboardEvents,
  } = useFusionStore((state) => ({
    alarmZones: state.alarmZones,
    isLoadingAlarmZones: state.isLoadingAlarmZones,
    fetchAlarmZones: state.fetchAlarmZones,
    updateAlarmZoneArmedState: state.updateAlarmZoneArmedState,
    isLoadingDashboardEvents: state.isLoadingDashboardEvents,
  }));

  useEffect(() => {
    // Fetch alarm zones if they haven't been loaded or to ensure freshness
    fetchAlarmZones(); 
  }, [fetchAlarmZones]);

  const triggeredZones = useMemo(() => {
    return alarmZones
      .filter(zone => zone.armedState === ArmedState.TRIGGERED)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()); // Sort by updatedAt, newest first
  }, [alarmZones]);

  const handleClearAlarm = async (zoneId: string) => {
    await updateAlarmZoneArmedState(zoneId, ArmedState.ARMED);
  };

  const handleClearAndDisarmAlarm = async (zoneId: string) => {
    await updateAlarmZoneArmedState(zoneId, ArmedState.DISARMED);
  };

  if (isLoadingAlarmZones) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Active Alarms" icon={<AlertTriangle className="h-6 w-6 text-destructive" />} />
        <AlarmsPageSkeleton cardCount={6} />
      </div>
    );
  }



  return (
    <TooltipProvider>
      <div className="container mx-auto py-10">
        <PageHeader 
          title="Active Alarms" 
          icon={<AlertTriangle className="h-6 w-6 text-destructive" />}
        />

      {triggeredZones.length === 0 && !isLoadingAlarmZones && (
        <Card className="mt-6">
          <CardContent className="pt-10 pb-10 flex flex-col items-center text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <CardTitle className="mb-2 text-xl">No Active Alarms</CardTitle>
            <CardDescription>All monitored zones are currently secure.</CardDescription>
          </CardContent>
        </Card>
      )}

      {triggeredZones.length > 0 && (
        <div className="grid gap-6 mt-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {triggeredZones.map((zone) => (
            <Card key={zone.id} className="border-destructive border-2 ring-4 ring-destructive/30 shadow-lg">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-destructive truncate" title={zone.name}>{zone.name}</CardTitle>
                  <Badge variant="destructive" className="whitespace-nowrap">
                    <AlertTriangle className="h-4 w-4 mr-1.5" />
                    {ArmedStateDisplayNames[zone.armedState] || zone.armedState}
                  </Badge>
                </div>
                {(zone as AlarmZoneWithLocationName).locationName && (
                  <CardDescription className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Building className="h-3 w-3" />
                    {(zone as AlarmZoneWithLocationName).locationName}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="text-sm space-y-2 pb-4">
                {zone.updatedAt && (
                  <p>
                    <span className="text-muted-foreground">Triggered:</span>{' '}
                    <span className="font-medium">
                      {formatDistanceToNowStrict(parseISO(zone.updatedAt.toString()), { addSuffix: true })}
                    </span>
                  </p>
                )}
                {zone.lastArmedStateChangeReason && (
                  <p>
                    <span className="text-muted-foreground">Reason:</span>{' '}
                    <span className="font-medium">{zone.lastArmedStateChangeReason.replace(/_/g, ' ')}</span>
                  </p>
                )}
              </CardContent>
              <CardFooter className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      onClick={() => handleClearAlarm(zone.id)} 
                      className="flex-1"
                      variant="default"
                    >
                      <ShieldMinus className="h-4 w-4" /> Clear
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Clear & Keep Zone Armed
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      onClick={() => handleClearAndDisarmAlarm(zone.id)} 
                      className="flex-1"
                      variant="secondary"
                    >
                      <ShieldOff className="h-4 w-4" /> Clear & Disarm
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Clear & Disarm Zone
                  </TooltipContent>
                </Tooltip>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
    </TooltipProvider>
  );
};

export default AlarmsPage; 