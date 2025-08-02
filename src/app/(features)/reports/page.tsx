'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useFusionStore } from '@/stores/store';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Cpu, Plug, ShieldAlert, CircleX } from 'lucide-react';
import { TimeFilterDropdown, getTimeFilterDisplayText } from "@/components/features/events/TimeFilterDropdown";
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import type { ReportsLayouts } from '@/types/reports';
import { DASHBOARD_CARD_IDS } from '@/types/reports';
import { useReportsData } from '@/hooks/reports';
import { EventsByConnectorChart, AutomationSuccessRateChart, AutomationExecutionsChart } from '@/components/features/reports/charts';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

export default function ReportsPage() {
  const { allDevices, connectors } = useFusionStore();
  
  // Use reports data hook for all data management
  const reportsData = useReportsData();
  
  // Extract data from hooks for easier access
  const { timeFilter, eventData, automationData, alarmData, isLoading } = reportsData;

  // Grid layout configuration (memoized to prevent recreation on every render)
  const defaultLayouts: ReportsLayouts = useMemo(() => ({
    lg: [
      { i: DASHBOARD_CARD_IDS.DEVICES, x: 0, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: DASHBOARD_CARD_IDS.CONNECTORS, x: 4, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: DASHBOARD_CARD_IDS.ACTIVE_ALARMS, x: 8, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: DASHBOARD_CARD_IDS.AUTOMATION_SUCCESS, x: 0, y: 2, w: 5, h: 5, minW: 4, minH: 3 },
      { i: DASHBOARD_CARD_IDS.AUTOMATION_EXECUTIONS, x: 5, y: 2, w: 7, h: 5, minW: 4, minH: 3 },
      { i: DASHBOARD_CARD_IDS.EVENTS_CHART, x: 0, y: 7, w: 12, h: 5, minW: 8, minH: 4 },
    ],
    md: [
      { i: DASHBOARD_CARD_IDS.DEVICES, x: 0, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: DASHBOARD_CARD_IDS.CONNECTORS, x: 4, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: DASHBOARD_CARD_IDS.ACTIVE_ALARMS, x: 8, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: DASHBOARD_CARD_IDS.AUTOMATION_SUCCESS, x: 0, y: 2, w: 5, h: 5, minW: 4, minH: 3 },
      { i: DASHBOARD_CARD_IDS.AUTOMATION_EXECUTIONS, x: 5, y: 2, w: 7, h: 5, minW: 4, minH: 3 },
      { i: DASHBOARD_CARD_IDS.EVENTS_CHART, x: 0, y: 7, w: 12, h: 5, minW: 8, minH: 4 },
    ],
    sm: [
      { i: DASHBOARD_CARD_IDS.DEVICES, x: 0, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: DASHBOARD_CARD_IDS.CONNECTORS, x: 4, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: DASHBOARD_CARD_IDS.ACTIVE_ALARMS, x: 8, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: DASHBOARD_CARD_IDS.AUTOMATION_SUCCESS, x: 0, y: 4, w: 12, h: 5, minW: 6, minH: 3 },
      { i: DASHBOARD_CARD_IDS.AUTOMATION_EXECUTIONS, x: 0, y: 9, w: 12, h: 5, minW: 6, minH: 3 },
      { i: DASHBOARD_CARD_IDS.EVENTS_CHART, x: 0, y: 14, w: 12, h: 5, minW: 6, minH: 4 },
    ],
    xs: [
      { i: DASHBOARD_CARD_IDS.DEVICES, x: 0, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: DASHBOARD_CARD_IDS.CONNECTORS, x: 4, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: DASHBOARD_CARD_IDS.ACTIVE_ALARMS, x: 8, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: DASHBOARD_CARD_IDS.AUTOMATION_SUCCESS, x: 0, y: 4, w: 12, h: 5, minW: 6, minH: 3 },
      { i: DASHBOARD_CARD_IDS.AUTOMATION_EXECUTIONS, x: 0, y: 9, w: 12, h: 5, minW: 6, minH: 3 },
      { i: DASHBOARD_CARD_IDS.EVENTS_CHART, x: 0, y: 14, w: 12, h: 5, minW: 6, minH: 4 },
    ],
    xxs: [
      { i: DASHBOARD_CARD_IDS.DEVICES, x: 0, y: 0, w: 12, h: 2, minW: 6, minH: 2 },
      { i: DASHBOARD_CARD_IDS.CONNECTORS, x: 0, y: 2, w: 12, h: 2, minW: 6, minH: 2 },
      { i: DASHBOARD_CARD_IDS.ACTIVE_ALARMS, x: 0, y: 4, w: 12, h: 2, minW: 6, minH: 2 },
      { i: DASHBOARD_CARD_IDS.AUTOMATION_SUCCESS, x: 0, y: 6, w: 12, h: 5, minW: 6, minH: 3 },
      { i: DASHBOARD_CARD_IDS.AUTOMATION_EXECUTIONS, x: 0, y: 11, w: 12, h: 5, minW: 6, minH: 3 },
      { i: DASHBOARD_CARD_IDS.EVENTS_CHART, x: 0, y: 16, w: 12, h: 5, minW: 6, minH: 4 },
    ]
  }), []);

  const [layouts, setLayouts] = useState<ReportsLayouts>(defaultLayouts);
  const [layoutsLoaded, setLayoutsLoaded] = useState(false);

  // Load saved layouts from localStorage synchronously
  useEffect(() => {
    const savedLayouts = localStorage.getItem('fusion-reports-layouts');
    if (savedLayouts) {
      try {
        const parsedLayouts = JSON.parse(savedLayouts);
        setLayouts(parsedLayouts);
      } catch (error) {
        console.error('Error loading saved layouts:', error);
      }
    }
    setLayoutsLoaded(true);
  }, []);

  // Save layout changes to localStorage
  const onLayoutChange = useCallback((layout: Layout[], layouts: ReportsLayouts) => {
    setLayouts(layouts);
    localStorage.setItem('fusion-reports-layouts', JSON.stringify(layouts));
  }, []);

  // Function to reset layout to defaults
  const resetLayout = useCallback(() => {
    localStorage.removeItem('fusion-reports-layouts');
    setLayouts(defaultLayouts);
    toast.success('Layout reset to default');
  }, [defaultLayouts]);



  return (
    <div className="container mx-auto py-6 relative">
            {/* Time Filter */}
      <div className="flex justify-end items-center gap-2 mb-4 px-4">
        <TimeFilterDropdown
          value={timeFilter.filter}
          timeStart={timeFilter.start}
          timeEnd={timeFilter.end}
          onChange={timeFilter.setFilter}
          onTimeStartChange={timeFilter.setTimeStart}
          onTimeEndChange={timeFilter.setTimeEnd}
          className="no-drag w-full sm:w-[180px] h-9 justify-between"
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={resetLayout}
                className="no-drag h-9 w-9 p-0"
              >
                <CircleX className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reset Layout</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {!layoutsLoaded ? (
        <div className="flex items-center justify-center h-[50vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      ) : (
        <ResponsiveGridLayout
          className="layout"
          layouts={layouts}
          onLayoutChange={onLayoutChange}
          cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
          rowHeight={60}
          useCSSTransforms={true}
          isDraggable={true}
          isResizable={true}
          preventCollision={false}
          compactType="vertical"
          margin={[16, 16]}
          draggableCancel=".no-drag"
        >
        {/* Devices Card */}
        <div key={DASHBOARD_CARD_IDS.DEVICES}>
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium truncate">Devices</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Link href="/devices" target="_blank" rel="noopener noreferrer" className="no-drag">
                <div className="text-2xl font-bold hover:bg-accent/50 transition-colors cursor-pointer rounded p-1 -m-1">
                  {isLoading ? <Skeleton className="h-8 w-16" /> : (allDevices?.length || 0).toLocaleString()}
                </div>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Connectors Card */}
        <div key={DASHBOARD_CARD_IDS.CONNECTORS}>
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium truncate">Connectors</CardTitle>
              <Plug className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Link href="/connectors" target="_blank" rel="noopener noreferrer" className="no-drag">
                <div className="text-2xl font-bold hover:bg-accent/50 transition-colors cursor-pointer rounded p-1 -m-1">
                  {isLoading ? <Skeleton className="h-8 w-16" /> : (connectors?.length || 0).toLocaleString()}
                </div>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Active Alarms Card */}
        <div key={DASHBOARD_CARD_IDS.ACTIVE_ALARMS}>
          <Card className={`h-full ${
            alarmData.data.activeAlarmCount && alarmData.data.activeAlarmCount > 0 ? 'border-destructive bg-destructive/5' : ''
          }`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={`text-sm font-medium truncate ${
                alarmData.data.activeAlarmCount && alarmData.data.activeAlarmCount > 0 ? 'text-destructive' : ''
              }`}>
                Active Alarms
              </CardTitle>
              <ShieldAlert className={`h-4 w-4 ${
                alarmData.data.activeAlarmCount && alarmData.data.activeAlarmCount > 0 ? 'text-destructive' : 'text-muted-foreground'
              }`} />
            </CardHeader>
            <CardContent>
              <Link href="/alarm/alarms" target="_blank" rel="noopener noreferrer" className="no-drag">
                <div className={`text-2xl font-bold hover:bg-accent/50 transition-colors cursor-pointer rounded p-1 -m-1 ${
                  alarmData.data.activeAlarmCount && alarmData.data.activeAlarmCount > 0 ? 'text-destructive hover:bg-destructive/10' : ''
                }`}>
                  {isLoading ? <Skeleton className="h-8 w-16" /> : (alarmData.data.activeAlarmCount || 0).toLocaleString()}
                </div>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Automation Success Rate Chart */}
        <div key={DASHBOARD_CARD_IDS.AUTOMATION_SUCCESS}>
          <AutomationSuccessRateChart
            automationStats={automationData.data.automationStats}
            isLoading={isLoading}
            timeFilterDisplay={getTimeFilterDisplayText(timeFilter.filter, timeFilter.start, timeFilter.end)}
          />
        </div>

        {/* Automation Executions Bar Chart */}
        <div key={DASHBOARD_CARD_IDS.AUTOMATION_EXECUTIONS}>
          <AutomationExecutionsChart
            chartData={automationData.data.automationChartData}
            chartConfig={automationData.data.automationChartConfig}
            isLoading={isLoading}
            timeFilterDisplay={getTimeFilterDisplayText(timeFilter.filter, timeFilter.start, timeFilter.end)}
          />
        </div>

        {/* Events by Connector Chart */}
        <div key={DASHBOARD_CARD_IDS.EVENTS_CHART}>
          <EventsByConnectorChart
            chartData={eventData.data.chartData}
            chartConfig={eventData.data.chartConfig}
            groupedEventData={eventData.data.groupedEventData}
            eventCount={eventData.data.eventCount || 0}
            isLoading={isLoading}
            timeFilterDisplay={getTimeFilterDisplayText(timeFilter.filter, timeFilter.start, timeFilter.end)}
          />
        </div>
             </ResponsiveGridLayout>
       )}
     </div>
   );
 }