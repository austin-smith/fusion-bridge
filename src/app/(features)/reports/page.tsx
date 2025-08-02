'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useFusionStore } from '@/stores/store';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Cpu, Plug, TrendingUp, ShieldAlert, CircleX } from 'lucide-react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis, Bar, BarChart, Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart, LabelList } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import { TimeFilterDropdown, getTimeFilterDisplayText, calculateDateRangeForFilter } from "@/components/features/events/TimeFilterDropdown";
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import { differenceInDays } from 'date-fns';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);


export default function ReportsPage() {
  const { allDevices, connectors } = useFusionStore();
  
  // Reports time filter state
  const reportsTimeFilter = useFusionStore(state => state.reportsTimeFilter);
  const reportsTimeStart = useFusionStore(state => state.reportsTimeStart);
  const reportsTimeEnd = useFusionStore(state => state.reportsTimeEnd);
  const setReportsTimeFilter = useFusionStore(state => state.setReportsTimeFilter);
  const setReportsTimeStart = useFusionStore(state => state.setReportsTimeStart);
  const setReportsTimeEnd = useFusionStore(state => state.setReportsTimeEnd);
  const initializeReportsPreferences = useFusionStore(state => state.initializeReportsPreferences);
  const [eventCount, setEventCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartConfig, setChartConfig] = useState<ChartConfig>({});
  const [groupedEventData, setGroupedEventData] = useState<any[]>([]);
  const [activeChart, setActiveChart] = useState<string>('all');
  const [automationStats, setAutomationStats] = useState<{total: number, successful: number, failed: number, successRate: number} | null>(null);
  const [automationChartData, setAutomationChartData] = useState<any[]>([]);
  const [automationChartConfig, setAutomationChartConfig] = useState<ChartConfig>({});
  const [groupedAutomationData, setGroupedAutomationData] = useState<any[]>([]);
  const [activeAlarmCount, setActiveAlarmCount] = useState<number | null>(null);

  // Grid layout configuration
  const defaultLayouts = {
    lg: [
      { i: 'devices-card', x: 0, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: 'connectors-card', x: 4, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: 'active-alarms-card', x: 8, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: 'automation-success', x: 0, y: 2, w: 5, h: 5, minW: 4, minH: 3 },
      { i: 'automation-executions', x: 5, y: 2, w: 7, h: 5, minW: 4, minH: 3 },
      { i: 'events-chart', x: 0, y: 7, w: 12, h: 5, minW: 8, minH: 4 },
    ],
    md: [
      { i: 'devices-card', x: 0, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: 'connectors-card', x: 4, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: 'active-alarms-card', x: 8, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: 'automation-success', x: 0, y: 2, w: 5, h: 5, minW: 4, minH: 3 },
      { i: 'automation-executions', x: 5, y: 2, w: 7, h: 5, minW: 4, minH: 3 },
      { i: 'events-chart', x: 0, y: 7, w: 12, h: 5, minW: 8, minH: 4 },
    ],
    sm: [
      { i: 'devices-card', x: 0, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: 'connectors-card', x: 4, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: 'active-alarms-card', x: 8, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: 'automation-success', x: 0, y: 4, w: 12, h: 5, minW: 6, minH: 3 },
      { i: 'automation-executions', x: 0, y: 9, w: 12, h: 5, minW: 6, minH: 3 },
      { i: 'events-chart', x: 0, y: 14, w: 12, h: 5, minW: 6, minH: 4 },
    ],
    xs: [
      { i: 'devices-card', x: 0, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: 'connectors-card', x: 4, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: 'active-alarms-card', x: 8, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
      { i: 'automation-success', x: 0, y: 4, w: 12, h: 5, minW: 6, minH: 3 },
      { i: 'automation-executions', x: 0, y: 9, w: 12, h: 5, minW: 6, minH: 3 },
      { i: 'events-chart', x: 0, y: 14, w: 12, h: 5, minW: 6, minH: 4 },
    ],
    xxs: [
      { i: 'devices-card', x: 0, y: 0, w: 12, h: 2, minW: 6, minH: 2 },
      { i: 'connectors-card', x: 0, y: 2, w: 12, h: 2, minW: 6, minH: 2 },
      { i: 'active-alarms-card', x: 0, y: 4, w: 12, h: 2, minW: 6, minH: 2 },
      { i: 'automation-success', x: 0, y: 6, w: 12, h: 5, minW: 6, minH: 3 },
      { i: 'automation-executions', x: 0, y: 11, w: 12, h: 5, minW: 6, minH: 3 },
      { i: 'events-chart', x: 0, y: 16, w: 12, h: 5, minW: 6, minH: 4 },
    ]
  };

  const [layouts, setLayouts] = useState(defaultLayouts);
  const [layoutsLoaded, setLayoutsLoaded] = useState(false);

  // Initialize reports preferences from localStorage
  useEffect(() => {
    initializeReportsPreferences();
  }, [initializeReportsPreferences]);

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
  const onLayoutChange = useCallback((layout: Layout[], layouts: any) => {
    setLayouts(layouts);
    localStorage.setItem('fusion-reports-layouts', JSON.stringify(layouts));
    
    // Force chart re-render after layout change
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
  }, []);

  // Function to reset layout to defaults
  const resetLayout = useCallback(() => {
    localStorage.removeItem('fusion-reports-layouts');
    setLayouts(defaultLayouts);
    toast.success('Layout reset to default');
  }, []);

  // Helper function to get date range based on filter
  const getDateRange = useCallback(() => {
    if (reportsTimeStart && reportsTimeEnd) {
      return {
        start: reportsTimeStart,
        end: reportsTimeEnd
      };
    }
    
    return calculateDateRangeForFilter(reportsTimeFilter);
  }, [reportsTimeFilter, reportsTimeStart, reportsTimeEnd]);



  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const { start, end } = getDateRange();
      
      // Build query parameters
      const params = new URLSearchParams();
      params.set('count', 'true');
      if (start) params.set('timeStart', start);
      if (end) params.set('timeEnd', end);
      
      // Fetch event count
      const eventResponse = await fetch(`/api/events?${params.toString()}`);
      
      if (eventResponse.ok) {
        const eventData = await eventResponse.json();
        if (eventData.success) {
          setEventCount(eventData.count || 0);
        }
      }

      // Fetch grouped event counts for chart
      const chartParams = new URLSearchParams(params);
      chartParams.set('groupBy', 'day,connector');
      const chartResponse = await fetch(`/api/events?${chartParams.toString()}`);
      
      if (chartResponse.ok) {
        const chartEventData = await chartResponse.json();
        if (chartEventData.success && chartEventData.data) {
          setGroupedEventData(chartEventData.data);
        }
      }

      // Fetch automation execution stats
      const automationParams = new URLSearchParams();
      automationParams.set('count', 'true');
      if (start) automationParams.set('timeStart', start);
      if (end) automationParams.set('timeEnd', end);
      
      const automationResponse = await fetch(`/api/automations/executions?${automationParams.toString()}`);
      
      if (automationResponse.ok) {
        const automationData = await automationResponse.json();
        if (automationData.success && automationData.data) {
          setAutomationStats(automationData.data);
        }
      }

      // Fetch grouped automation execution counts for chart
      const automationChartParams = new URLSearchParams(automationParams);
      automationChartParams.set('groupBy', 'automation');
      const automationChartResponse = await fetch(`/api/automations/executions?${automationChartParams.toString()}`);
      
      if (automationChartResponse.ok) {
        const automationChartData = await automationChartResponse.json();
        if (automationChartData.success && automationChartData.data) {
          setGroupedAutomationData(automationChartData.data);
        }
      }

      // Fetch alarm zones to count active alarms (not time-dependent)
      const alarmZonesResponse = await fetch('/api/alarm-zones');
      
      if (alarmZonesResponse.ok) {
        const alarmZonesData = await alarmZonesResponse.json();
        if (alarmZonesData.success && alarmZonesData.data) {
          const triggeredCount = alarmZonesData.data.filter((zone: any) => zone.armedState === 'triggered').length;
          setActiveAlarmCount(triggeredCount);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [getDateRange]);

  // Initial data fetch on component mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch data when time filter changes
  useEffect(() => {
    fetchData();
  }, [reportsTimeFilter, reportsTimeStart, reportsTimeEnd, fetchData]); // Only run once to fetch data

  const buildChartData = React.useCallback((groupedData: any[]) => {
    if (!connectors.length) {
      setChartData([]);
      setChartConfig({});
      return;
    }

    // Create date range based on current filter
    const { start, end } = getDateRange();
    const dates: string[] = [];
    
    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      const daysDiff = Math.min(differenceInDays(endDate, startDate), 30); // Limit to 30 days for chart readability
      
      for (let i = 0; i <= daysDiff; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        dates.push(date.toISOString().split('T')[0]);
      }
    } else {
      // Fallback to last 7 days if no specific range
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dates.push(date.toISOString().split('T')[0]);
      }
    }

    // Get unique connector categories
    const categories = [...new Set(connectors.map(c => c.category))];
    
    // Build chart data structure
    const dataByDate = dates.map(date => ({
      date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      ...categories.reduce((acc, category) => {
        acc[category] = 0;
        return acc;
      }, {} as any)
    }));

    // Populate with grouped count data
    if (groupedData.length > 0) {
      groupedData.forEach((item: any) => {
        const dateStr = item.date; // Already in YYYY-MM-DD format from SQL
        const category = item.connectorCategory;
        const count = item.count || 0;
        
        const dateIndex = dates.indexOf(dateStr);
        if (dateIndex >= 0 && dataByDate[dateIndex] && category) {
          dataByDate[dateIndex][category] = count;
        }
      });
    }

    // Build chart config
    const config: ChartConfig = {};
    const colors = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'];
    
    categories.forEach((category, index) => {
      config[category] = {
        label: category.charAt(0).toUpperCase() + category.slice(1), // Capitalize first letter
        color: `var(${colors[index % colors.length]})`
      };
    });

    setChartData(dataByDate);
    setChartConfig(config);
  }, [connectors]);

  const buildAutomationChartData = React.useCallback((groupedData: any[]) => {
    if (groupedData.length === 0) {
      setAutomationChartData([]);
      setAutomationChartConfig({});
      return;
    }

    // Build stacked bar chart data - automation name with success/failure breakdown
    const chartData = groupedData.map((item) => ({
      automationName: item.automationName,
      successful: Number(item.successfulCount) || 0,
      failed: Number(item.failedCount) || 0,
      total: item.count || 0
    }));

    // Build chart config
    const config: ChartConfig = {
      successful: {
        label: "Successful",
        color: "var(--chart-2)",
      },
      failed: {
        label: "Failed",
        color: "var(--chart-5)",
      },
    };

    setAutomationChartData(chartData);
    setAutomationChartConfig(config);
  }, []);

  // Build chart when both connectors and grouped data are available
  useEffect(() => {
    if (connectors.length > 0 && groupedEventData.length >= 0) {
      buildChartData(groupedEventData);
    }
  }, [connectors, groupedEventData, buildChartData]);

  // Build automation chart when grouped automation data is available
  useEffect(() => {
    if (groupedAutomationData.length >= 0) {
      buildAutomationChartData(groupedAutomationData);
    }
  }, [groupedAutomationData, buildAutomationChartData]);

  // Calculate totals for each connector type
  const totals = React.useMemo(() => {
    if (!groupedEventData.length) return {};
    
    const categoryTotals: { [key: string]: number } = {};
    groupedEventData.forEach((item: any) => {
      const category = item.connectorCategory;
      const count = item.count || 0;
      categoryTotals[category] = (categoryTotals[category] || 0) + count;
    });
    
    return categoryTotals;
  }, [groupedEventData]);

  // Custom tooltip component with connector icons
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border bg-background p-2 shadow-sm">
          <div className="grid gap-2">
            <div className="flex flex-col">
              <span className="text-[0.70rem] uppercase text-muted-foreground">
                {label}
              </span>
            </div>
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <div 
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]" 
                  style={{ backgroundColor: entry.color }}
                />
                <ConnectorIcon 
                  connectorCategory={entry.dataKey} 
                  size={16} 
                  className="shrink-0"
                />
                <span className="text-sm font-medium">
                  {chartConfig[entry.dataKey]?.label}
                </span>
                <span className="text-sm text-muted-foreground">
                  {entry.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom legend content component with connector icons
  const CustomLegendContent = ({ payload }: any) => {
    if (!payload || !payload.length) return null;

    return (
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2">
            <div 
              className="h-2.5 w-2.5 shrink-0 rounded-[2px]" 
              style={{ backgroundColor: entry.color }}
            />
            <ConnectorIcon 
              connectorCategory={entry.dataKey} 
              size={14} 
              className="shrink-0"
            />
            <span className="text-sm text-muted-foreground">
              {chartConfig[entry.dataKey]?.label}
            </span>
          </div>
        )        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto py-6 relative">
            {/* Time Filter */}
      <div className="flex justify-end items-center gap-2 mb-4 px-4">
        <TimeFilterDropdown
          value={reportsTimeFilter}
          timeStart={reportsTimeStart}
          timeEnd={reportsTimeEnd}
          onChange={setReportsTimeFilter}
          onTimeStartChange={setReportsTimeStart}
          onTimeEndChange={setReportsTimeEnd}
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
        <div key="devices-card">
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
        <div key="connectors-card">
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
        <div key="active-alarms-card">
          <Card className={`h-full ${
            activeAlarmCount && activeAlarmCount > 0 ? 'border-destructive bg-destructive/5' : ''
          }`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={`text-sm font-medium truncate ${
                activeAlarmCount && activeAlarmCount > 0 ? 'text-destructive' : ''
              }`}>
                Active Alarms
              </CardTitle>
              <ShieldAlert className={`h-4 w-4 ${
                activeAlarmCount && activeAlarmCount > 0 ? 'text-destructive' : 'text-muted-foreground'
              }`} />
            </CardHeader>
            <CardContent>
              <Link href="/alarm/alarms" target="_blank" rel="noopener noreferrer" className="no-drag">
                <div className={`text-2xl font-bold hover:bg-accent/50 transition-colors cursor-pointer rounded p-1 -m-1 ${
                  activeAlarmCount && activeAlarmCount > 0 ? 'text-destructive hover:bg-destructive/10' : ''
                }`}>
                  {isLoading ? <Skeleton className="h-8 w-16" /> : (activeAlarmCount || 0).toLocaleString()}
                </div>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Automation Success Rate Chart */}
        <div key="automation-success">
          <Card className="flex flex-col h-full">
            <CardHeader className="pb-0 flex-shrink-0">
              <CardTitle>Automation Success Rate</CardTitle>
              <CardDescription>{getTimeFilterDisplayText(reportsTimeFilter, reportsTimeStart, reportsTimeEnd)}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-0 min-h-0">
              <div className="h-full w-full flex items-center justify-center">
                {isLoading ? (
                  <Skeleton className="h-[140px] w-[140px] rounded-full" />
                ) : automationStats && automationStats.total > 0 ? (
                  <ChartContainer
                    config={{
                      executions: {
                        label: "Executions",
                      },
                      successful: {
                        label: "Successful",
                        color: "var(--chart-2)",
                      },
                    }}
                    className="w-full h-full min-h-[200px]"
                  >
                  <RadialBarChart
                    data={[
                      { success: automationStats.successRate, remaining: 100 - automationStats.successRate }
                    ]}
                    startAngle={0}
                    endAngle={360}
                    innerRadius={80}
                    outerRadius={110}
                  >
                    <PolarGrid
                      gridType="circle"
                      radialLines={false}
                      stroke="none"
                      className="first:fill-muted last:fill-background"
                      polarRadius={[86, 74]}
                    />
                    <RadialBar dataKey="success" stackId="a" fill="var(--color-successful)" cornerRadius={10} />
                    <RadialBar dataKey="remaining" stackId="a" fill="transparent" />
                    <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                      <Label
                        content={({ viewBox }) => {
                          if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                            return (
                              <text
                                x={viewBox.cx}
                                y={viewBox.cy}
                                textAnchor="middle"
                                dominantBaseline="middle"
                              >
                                <tspan
                                  x={viewBox.cx}
                                  y={viewBox.cy}
                                  className="fill-foreground text-2xl sm:text-3xl lg:text-4xl font-bold"
                                >
                                  {automationStats.successRate.toLocaleString()}%
                                </tspan>
                                <tspan
                                  x={viewBox.cx}
                                  y={(viewBox.cy || 0) + 20}
                                  className="fill-muted-foreground text-xs sm:text-sm mt-2"
                                >
                                  Success Rate
                                </tspan>
                              </text>
                            )
                          }
                        }}
                      />
                    </PolarRadiusAxis>
                  </RadialBarChart>
                  </ChartContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center text-sm text-muted-foreground">
                    <span>No automation data</span>
                    <span className="text-xs mt-1">{getTimeFilterDisplayText(reportsTimeFilter, reportsTimeStart, reportsTimeEnd)}</span>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex-col gap-2 text-sm flex-shrink-0">
              {automationStats && automationStats.total > 0 && (
                <>
                  <div className="flex items-center gap-2 leading-none font-medium">
                    {automationStats.total.toLocaleString()} total executions
                  </div>
                  <div className="text-muted-foreground leading-none">
                    {automationStats.successful.toLocaleString()} successful, {automationStats.failed.toLocaleString()} failed
                  </div>
                </>
              )}
            </CardFooter>
          </Card>
        </div>

        {/* Automation Executions Bar Chart */}
        <div key="automation-executions">
          <Card className="flex flex-col h-full">
            <CardHeader className="flex-shrink-0">
              <CardTitle>Automation Executions</CardTitle>
              <CardDescription>{getTimeFilterDisplayText(reportsTimeFilter, reportsTimeStart, reportsTimeEnd)}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              <div className="h-full w-full">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Skeleton className="h-full w-full rounded-lg" />
                  </div>
                ) : automationChartData.length > 0 ? (
                  <ChartContainer config={automationChartConfig} className="h-full w-full min-h-[200px]">
                  <BarChart
                    accessibilityLayer
                    data={automationChartData}
                    layout="vertical"
                    margin={{
                      right: 16,
                    }}
                  >
                    <CartesianGrid horizontal={false} />
                    <YAxis
                      dataKey="automationName"
                      type="category"
                      tickLine={false}
                      tickMargin={10}
                      axisLine={false}
                      tickFormatter={(value) => value.length > 20 ? value.slice(0, 20) + '...' : value}
                      width={120}
                    />
                    <XAxis type="number" hide />
                    <ChartTooltip
                      cursor={false}
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        
                        const data = payload[0].payload;
                        const successRate = data.total > 0 ? Math.round((data.successful / data.total) * 100) : 0;
                        
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-sm">
                            <div className="grid gap-2">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">
                                  {label}
                                </span>
                              </div>
                              <div className="grid gap-1">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                                    style={{ backgroundColor: "var(--color-successful)" }}
                                  />
                                  <span className="text-[0.70rem] text-muted-foreground">
                                    Successful
                                  </span>
                                  <span className="font-mono text-foreground">
                                    {data.successful.toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div
                                    className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                                    style={{ backgroundColor: "var(--color-failed)" }}
                                  />
                                  <span className="text-[0.70rem] text-muted-foreground">
                                    Failed
                                  </span>
                                  <span className="font-mono text-foreground">
                                    {data.failed.toLocaleString()}
                                  </span>
                                </div>
                                <div className="border-t pt-1 mt-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[0.70rem] text-muted-foreground">
                                      Success Rate
                                    </span>
                                    <span className="font-mono font-medium text-foreground">
                                      {successRate}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar
                      dataKey="successful"
                      stackId="a"
                      fill="var(--color-successful)"
                      radius={[0, 0, 4, 4]}
                    />
                    <Bar
                      dataKey="failed"
                      stackId="a"
                      fill="var(--color-failed)"
                      radius={[4, 4, 0, 0]}
                    >
                      <LabelList
                        dataKey="total"
                        position="right"
                        offset={8}
                        className="fill-foreground"
                        fontSize={12}
                      />
                    </Bar>
                  </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground">
                    <span>No automation executions</span>
                    <span className="text-xs mt-1">{getTimeFilterDisplayText(reportsTimeFilter, reportsTimeStart, reportsTimeEnd)}</span>
                  </div>
                )}
              </div>
            </CardContent>

          </Card>
        </div>

        {/* Events by Connector Chart */}
        <div key="events-chart">
          <Card className="flex flex-col h-full">
            <CardHeader className="flex flex-col items-stretch border-b flex-shrink-0 sm:flex-row">
              <div className="flex flex-1 flex-col justify-center gap-1 px-6 pb-3 sm:pb-0">
                <CardTitle>Events by Connector Type</CardTitle>
                <CardDescription>{getTimeFilterDisplayText(reportsTimeFilter, reportsTimeStart, reportsTimeEnd)}</CardDescription>
              </div>
              <div className="flex flex-wrap">
                <button
                  key="all"
                  data-active={activeChart === 'all'}
                  className="no-drag data-[active=true]:bg-muted/50 flex min-w-0 flex-col justify-center gap-1 border-t px-3 py-2 text-left sm:border-t-0 sm:border-l sm:px-4 sm:py-3"
                  onClick={() => setActiveChart('all')}
                >
                  <span className="text-muted-foreground text-xs">Total Events</span>
                  <span className="text-sm leading-none font-bold sm:text-lg lg:text-xl truncate">
                    {isLoading ? '...' : (eventCount || 0).toLocaleString()}
                  </span>
                </button>
                {Object.keys(chartConfig).map((category) => (
                  <button
                    key={category}
                    data-active={activeChart === category}
                    className="no-drag data-[active=true]:bg-muted/50 flex min-w-0 flex-col justify-center gap-1 border-t px-3 py-2 text-left even:border-l sm:border-t-0 sm:border-l sm:px-4 sm:py-3"
                    onClick={() => setActiveChart(category)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ConnectorIcon connectorCategory={category} size={12} className="flex-shrink-0" />
                      <span className="text-muted-foreground text-xs truncate">
                        {chartConfig[category]?.label}
                      </span>
                    </div>
                    <span className="text-sm leading-none font-bold sm:text-lg lg:text-xl truncate">
                      {isLoading ? '...' : (totals[category] || 0).toLocaleString()}
                    </span>
                  </button>
                ))}
                </div>
            </CardHeader>
            <CardContent className="flex-1 px-2 sm:p-6 min-h-0">
              <div className="h-full w-full">
                {isLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : chartData.length > 0 ? (
                  <ChartContainer config={chartConfig} className="h-full w-full min-h-[200px]">
                  <LineChart
                    accessibilityLayer
                    data={chartData}
                    margin={{
                      left: 12,
                      right: 12,
                    }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <ChartTooltip cursor={false} content={<CustomTooltip />} />
                    {activeChart === 'all' && (
                      <ChartLegend content={<CustomLegendContent />} />
                    )}
                    {activeChart === 'all' 
                      ? Object.keys(chartConfig).map((category) => (
                          <Line
                            key={category}
                            dataKey={category}
                            type="monotone"
                            stroke={`var(--color-${category})`}
                            strokeWidth={2}
                            dot={false}
                          />
                        ))
                      : (
                          <Line
                            key={activeChart}
                            dataKey={activeChart}
                            type="monotone"
                            stroke={`var(--color-${activeChart})`}
                      strokeWidth={2}
                            dot={false}
                          />
                        )
                    }
                  </LineChart>
                  </ChartContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    No event data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
             </ResponsiveGridLayout>
       )}
       

     </div>
   );
 }