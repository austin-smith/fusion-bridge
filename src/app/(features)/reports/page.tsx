'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useFusionStore } from '@/stores/store';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Cpu, Plug, Activity } from 'lucide-react';
import { PieChart, Pie, Cell } from 'recharts';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

export default function ReportsPage() {
  const { allDevices, connectors, mqttStates, pikoStates, webhookStates } = useFusionStore();
  const [eventCount, setEventCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchEventCount = async () => {
      try {
        // Only fetch event count - everything else is in store
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const eventResponse = await fetch(
          `/api/events?timeStart=${sevenDaysAgo.toISOString()}&timeEnd=${new Date().toISOString()}&count=true`
        );
        
        if (eventResponse.ok) {
          const eventData = await eventResponse.json();
          if (eventData.success) {
            setEventCount(eventData.count || 0);
          }
        }
      } catch (error) {
        console.error('Error fetching event count:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEventCount();
  }, []); // Only run once

  // Calculate connector status data for chart
  const connectorStatusData = React.useMemo(() => {
    if (!connectors || connectors.length === 0) {
      return [];
    }

    const statusCounts = { connected: 0, disconnected: 0, error: 0 };
    
    connectors.forEach(connector => {
      let status = 'unknown';
      
      // Check status from appropriate state map based on connector category
      if (connector.category === 'yolink' && mqttStates.has(connector.id)) {
        status = mqttStates.get(connector.id)?.status || 'unknown';
      } else if (connector.category === 'piko' && pikoStates.has(connector.id)) {
        status = pikoStates.get(connector.id)?.status || 'unknown';
      } else if (webhookStates.has(connector.id)) {
        status = webhookStates.get(connector.id) ? 'connected' : 'unknown';
      }
      
      // Map statuses to display categories
      if (status === 'connected') {
        statusCounts.connected++;
      } else if (status === 'error') {
        statusCounts.error++;
      } else {
        statusCounts.disconnected++;
      }
    });
    
    // Convert to chart data format - only include non-zero values
    const chartData = [];
    if (statusCounts.connected > 0) {
      chartData.push({ name: 'Connected', value: statusCounts.connected });
    }
    if (statusCounts.error > 0) {
      chartData.push({ name: 'Error', value: statusCounts.error });
    }
    if (statusCounts.disconnected > 0) {
      chartData.push({ name: 'Disconnected', value: statusCounts.disconnected });
    }
    return chartData;
  }, [connectors, mqttStates, pikoStates, webhookStates]);

  const chartConfig = {
    connected: { label: 'Connected' },
    error: { label: 'Error' },
    disconnected: { label: 'Disconnected' },
  } satisfies ChartConfig;


  return (
    <div className="container mx-auto py-6">
      <PageHeader title="Reports" description="Analytics and insights for your system" />
      
      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-6">
        <Link href="/devices" target="_blank" rel="noopener noreferrer">
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium truncate">Devices</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? <Skeleton className="h-8 w-16" /> : allDevices?.length || 0}
              </div>
            </CardContent>
          </Card>
        </Link>
        
        <Link href="/connectors" target="_blank" rel="noopener noreferrer">
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium truncate">Connectors</CardTitle>
              <Plug className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? <Skeleton className="h-8 w-16" /> : connectors?.length || 0}
              </div>
            </CardContent>
          </Card>
        </Link>
        
        <Link href="/events" target="_blank" rel="noopener noreferrer">
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium truncate">Events <span className="text-xs text-muted-foreground font-normal ml-1">Last 7 days</span></CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? <Skeleton className="h-8 w-16" /> : eventCount || 0}
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate">Status</CardTitle>
            <Plug className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[120px] w-full" />
            ) : connectorStatusData.length > 0 ? (
              <ChartContainer
                config={chartConfig}
                className="mx-auto aspect-square max-h-[120px]"
              >
                <PieChart>
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <Pie
                    data={connectorStatusData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={30}
                    strokeWidth={2}
                  >
                    {connectorStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="flex items-center justify-center h-[120px] text-sm text-muted-foreground">
                No connectors
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}