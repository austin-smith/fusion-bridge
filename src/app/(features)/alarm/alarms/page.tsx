'use client';

import React, { useEffect, useMemo } from 'react';
import { useFusionStore } from '@/stores/store';
import type { AlarmZone } from '@/types/index';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ShieldOff, CheckCircle } from 'lucide-react';
import { ArmedState, ArmedStateDisplayNames } from '@/lib/mappings/definitions';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { PageHeader } from '@/components/layout/page-header';

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

  const handleAcknowledgeAlarm = async (zoneId: string) => {
    // For now, acknowledging means disarming. 
    // Future: could have a more complex ack flow or arm back to previous state.
    await updateAlarmZoneArmedState(zoneId, ArmedState.DISARMED);
    // Toast for success/error is handled in the store's disarmAlarmZone action
  };

  if (isLoadingAlarmZones && triggeredZones.length === 0) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Active Alarms" icon={<AlertTriangle className="h-6 w-6 text-destructive" />} />
        <div className="text-center py-10">
          <p>Loading active alarms...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Active Alarms" icon={<AlertTriangle className="h-6 w-6 text-destructive" />} />

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
        <div className="grid gap-6 mt-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                {zone.location && <CardDescription className="text-xs text-muted-foreground">Location: {zone.location.name}</CardDescription>}
              </CardHeader>
              <CardContent className="text-sm space-y-2 pb-4">
                {zone.updatedAt && (
                  <p>
                    Triggered: <span className="font-medium">
                      {formatDistanceToNowStrict(parseISO(zone.updatedAt.toString()), { addSuffix: true })}
                    </span>
                  </p>
                )}
                {zone.lastArmedStateChangeReason && (
                  <p>Reason: <span className="font-medium">{zone.lastArmedStateChangeReason.replace(/_/g, ' ')}</span></p>
                )}
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={() => handleAcknowledgeAlarm(zone.id)} 
                  className="w-full"
                  variant="secondary"
                >
                  <ShieldOff className="mr-2 h-4 w-4" /> Acknowledge & Disarm
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlarmsPage; 