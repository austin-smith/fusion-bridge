'use client';

import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useFusionStore } from '@/stores/store';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from 'lucide-react';
import { EventTimeline } from '@/components/features/events/EventTimeline';

export default function EventsDashboardPage() {
  const {
    dashboardEvents,
    isLoadingDashboardEvents,
    errorDashboardEvents,
    fetchDashboardEvents,
    allDevices,
    fetchAllDevices,
    isLoadingAllDevices,
  } = useFusionStore((state) => ({
    dashboardEvents: state.dashboardEvents,
    isLoadingDashboardEvents: state.isLoadingDashboardEvents,
    errorDashboardEvents: state.errorDashboardEvents,
    fetchDashboardEvents: state.fetchDashboardEvents,
    allDevices: state.allDevices,
    fetchAllDevices: state.fetchAllDevices,
    isLoadingAllDevices: state.isLoadingAllDevices,
  }));

  useEffect(() => {
    fetchDashboardEvents();
    if (allDevices.length === 0 && !isLoadingAllDevices) {
        fetchAllDevices();
    }
  }, [fetchDashboardEvents, fetchAllDevices, allDevices.length, isLoadingAllDevices]);

  useEffect(() => {
    console.log("[EventsDashboardPage] Setting up WebSocket simulation (Refetch strategy)...");

    return () => {
        console.log("[EventsDashboardPage] Cleaning up WebSocket simulation...");
    };
  }, [fetchDashboardEvents]);

  const renderContent = () => {
    if (isLoadingDashboardEvents || (allDevices.length === 0 && isLoadingAllDevices)) {
      return (
        <div className="space-y-4 p-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-8 w-3/4 mt-6" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-20 w-full" />
        </div>
      );
    }

    if (errorDashboardEvents) {
      return (
        <Alert variant="destructive">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Error Fetching Events</AlertTitle>
          <AlertDescription>
            {errorDashboardEvents}
          </AlertDescription>
        </Alert>
      );
    }
    
    if (dashboardEvents.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 border-2 border-dashed border-muted rounded-lg">
          <p className="text-muted-foreground">No recent events found.</p>
        </div>
      );
    }

    return <EventTimeline events={dashboardEvents} allDevices={allDevices} />;
  };

  return (
    <div className="container mx-auto py-8 px-4 md:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight mb-4">Events Dashboard</h1>
      <p className="text-muted-foreground mb-6">
        A timeline view of recent events across your connected systems, grouped by location and time.
      </p>

      <Separator className="mb-8" />

      <Card>
        <CardHeader>
          <CardTitle>Event Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {renderContent()}
        </CardContent>
      </Card>

      {/* Placeholder for filters/controls if needed later */}
      {/* <div className="mt-8"> ... Filters ... </div> */}
    </div>
  );
} 