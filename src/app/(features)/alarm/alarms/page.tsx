'use client';

import React, { useEffect, useMemo } from 'react';
import { useFusionStore } from '@/stores/store';
import type { Area } from '@/types/index'; // Assuming Area type includes updatedAt and locationName
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
    areas,
    isLoadingAreas,
    fetchAreas, // Ensure areas are fetched if not already
    disarmArea, // Action to disarm/acknowledge
    isLoadingDashboardEvents, // Re-use this to avoid adding new loading state for now
  } = useFusionStore((state) => ({
    areas: state.areas,
    isLoadingAreas: state.isLoadingAreas,
    fetchAreas: state.fetchAreas,
    disarmArea: state.disarmArea,
    isLoadingDashboardEvents: state.isLoadingDashboardEvents, // Placeholder for a more specific loading if needed
  }));

  useEffect(() => {
    // Fetch areas if they haven't been loaded or to ensure freshness
    // Consider if a more sophisticated data fetching/staleness strategy is needed later
    fetchAreas(); 
  }, [fetchAreas]);

  const triggeredAreas = useMemo(() => {
    return areas
      .filter(area => area.armedState === ArmedState.TRIGGERED)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()); // Sort by updatedAt, newest first
  }, [areas]);

  const handleAcknowledgeAlarm = async (areaId: string) => {
    // For now, acknowledging means disarming. 
    // Future: could have a more complex ack flow or arm back to previous state.
    await disarmArea(areaId);
    // Toast for success/error is handled in the store's disarmArea action
  };

  if (isLoadingAreas && triggeredAreas.length === 0) {
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

      {triggeredAreas.length === 0 && !isLoadingAreas && (
        <Card className="mt-6">
          <CardContent className="pt-10 pb-10 flex flex-col items-center text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <CardTitle className="mb-2 text-xl">No Active Alarms</CardTitle>
            <CardDescription>All monitored areas are currently secure.</CardDescription>
          </CardContent>
        </Card>
      )}

      {triggeredAreas.length > 0 && (
        <div className="grid gap-6 mt-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {triggeredAreas.map((area) => (
            <Card key={area.id} className="border-destructive border-2 ring-4 ring-destructive/30 shadow-lg">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-destructive truncate" title={area.name}>{area.name}</CardTitle>
                  <Badge variant="destructive" className="whitespace-nowrap">
                    <AlertTriangle className="h-4 w-4 mr-1.5" />
                    {ArmedStateDisplayNames[area.armedState] || area.armedState}
                  </Badge>
                </div>
                {area.locationName && <CardDescription className="text-xs text-muted-foreground">Location: {area.locationName}</CardDescription>}
              </CardHeader>
              <CardContent className="text-sm space-y-2 pb-4">
                {area.updatedAt && (
                  <p>
                    Triggered: <span className="font-medium">
                      {formatDistanceToNowStrict(parseISO(area.updatedAt.toString()), { addSuffix: true })}
                    </span>
                  </p>
                )}
                {area.lastArmedStateChangeReason && (
                  <p>Reason: <span className="font-medium">{area.lastArmedStateChangeReason.replace(/_/g, ' ')}</span></p>
                )}
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={() => handleAcknowledgeAlarm(area.id)} 
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