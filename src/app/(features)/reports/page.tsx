'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useFusionStore } from '@/stores/store';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Cpu, Plug, TrendingUp } from 'lucide-react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis, Bar, BarChart, Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart, LabelList } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";


export default function ReportsPage() {
  const { allDevices, connectors } = useFusionStore();
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        // Fetch event count
        const eventResponse = await fetch(
          `/api/events?timeStart=${sevenDaysAgo.toISOString()}&timeEnd=${new Date().toISOString()}&count=true`
        );
        
        if (eventResponse.ok) {
          const eventData = await eventResponse.json();
          if (eventData.success) {
            setEventCount(eventData.count || 0);
          }
        }

        // Fetch grouped event counts for chart
        const chartResponse = await fetch(
          `/api/events?timeStart=${sevenDaysAgo.toISOString()}&timeEnd=${new Date().toISOString()}&count=true&groupBy=day,connector`
        );
        
        if (chartResponse.ok) {
          const chartEventData = await chartResponse.json();
          if (chartEventData.success && chartEventData.data) {
            setGroupedEventData(chartEventData.data);
          }
        }

        // Fetch automation execution stats
        const automationResponse = await fetch(
          `/api/automations/executions?count=true&timeStart=${sevenDaysAgo.toISOString()}&timeEnd=${new Date().toISOString()}`
        );
        
        if (automationResponse.ok) {
          const automationData = await automationResponse.json();
          if (automationData.success && automationData.data) {
            setAutomationStats(automationData.data);
          }
        }

        // Fetch grouped automation execution counts for chart
        const automationChartResponse = await fetch(
          `/api/automations/executions?count=true&groupBy=automation&timeStart=${sevenDaysAgo.toISOString()}&timeEnd=${new Date().toISOString()}`
        );
        
        if (automationChartResponse.ok) {
          const automationChartData = await automationChartResponse.json();
          if (automationChartData.success && automationChartData.data) {
            setGroupedAutomationData(automationChartData.data);
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []); // Only run once to fetch data

  const buildChartData = React.useCallback((groupedData: any[]) => {
    if (!connectors.length) {
      setChartData([]);
      setChartConfig({});
      return;
    }

    // Create date range for last 7 days
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
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

    // Build simple bar chart data - automation name and total executions
    const chartData = groupedData.map((item) => ({
      automationName: item.automationName,
      executions: item.count || 0
    }));

    // Build chart config
    const config: ChartConfig = {
      executions: {
        label: "Executions",
        color: "var(--chart-1)",
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

  return (
    <div className="container mx-auto py-6">
      {/* Top Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/devices" target="_blank" rel="noopener noreferrer">
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium truncate">Devices</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? <Skeleton className="h-8 w-16" /> : (allDevices?.length || 0).toLocaleString()}
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
                {isLoading ? <Skeleton className="h-8 w-16" /> : (connectors?.length || 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Automation Charts Row */}
      <div className="grid gap-4 md:grid-cols-2 mt-6">
        {/* Automation Success Rate Chart */}
        <Card className="flex flex-col h-[400px]">
          <CardHeader className="pb-0">
            <CardTitle>Automation Success Rate</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-0">
            <div className="h-[220px] w-full flex items-center justify-center">
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
                  className="w-[220px] h-[220px]"
                >
                <RadialBarChart
                  data={[{ 
                    executions: automationStats.successRate,
                    fill: "var(--color-successful)" 
                  }]}
                  startAngle={0}
                  endAngle={250}
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
                  <RadialBar dataKey="executions" background cornerRadius={10} />
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
                                className="fill-foreground text-4xl font-bold"
                              >
                                {automationStats.successRate.toLocaleString()}%
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy || 0) + 24}
                                className="fill-muted-foreground"
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
                  <span className="text-xs mt-1">Last 7 days</span>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-2 text-sm">
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

        {/* Automation Executions Bar Chart */}
        <Card className="flex flex-col h-[400px]">
          <CardHeader>
            <CardTitle>Automation Executions</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="h-[220px] w-full">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Skeleton className="h-full w-full rounded-lg" />
                </div>
              ) : automationChartData.length > 0 ? (
                <ChartContainer config={automationChartConfig} className="h-full w-full">
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
                    tickFormatter={(value) => value.slice(0, 15)}
                    hide
                  />
                  <XAxis dataKey="executions" type="number" hide />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent indicator="line" />}
                  />
                  <Bar
                    dataKey="executions"
                    layout="vertical"
                    fill="var(--color-executions)"
                    radius={4}
                  >
                    <LabelList
                      dataKey="automationName"
                      position="insideLeft"
                      offset={8}
                      className="fill-background"
                      fontSize={12}
                    />
                    <LabelList
                      dataKey="executions"
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
                  <span className="text-xs mt-1">Last 7 days</span>
                </div>
              )}
            </div>
          </CardContent>
          <CardContent className="flex-col items-start gap-2 text-sm">
            {automationChartData.length > 0 && (
              <>
                <div className="flex gap-2 leading-none font-medium">
                  {automationStats && automationStats.total > 0 && (
                    <>
                      <span>Total: {automationStats.total.toLocaleString()}</span>
                      <TrendingUp className="h-4 w-4" />
                    </>
                  )}
                </div>
                <div className="text-muted-foreground leading-none">
                  {automationChartData.length} automation{automationChartData.length !== 1 ? 's' : ''} with executions
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Events by Connector Chart */}
      <div className="mt-6">
        <Card className="py-4 sm:py-0 h-[420px] sm:h-[380px]">
          <CardHeader className="flex flex-col items-stretch border-b !p-0 sm:flex-row h-[120px] sm:h-[80px]">
            <div className="flex flex-1 flex-col justify-center gap-1 px-6 pb-3 sm:pb-0">
              <CardTitle>Events by Connector Type</CardTitle>
              <CardDescription>Last 7 days</CardDescription>
            </div>
            <div className="flex">
              <button
                key="all"
                data-active={activeChart === 'all'}
                className="data-[active=true]:bg-muted/50 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left sm:border-t-0 sm:border-l sm:px-8 sm:py-6"
                onClick={() => setActiveChart('all')}
              >
                <span className="text-muted-foreground text-xs">Total Events</span>
                <span className="text-lg leading-none font-bold sm:text-3xl">
                  {isLoading ? '...' : (eventCount || 0).toLocaleString()}
                </span>
              </button>
              {Object.keys(chartConfig).map((category) => (
                <button
                  key={category}
                  data-active={activeChart === category}
                  className="data-[active=true]:bg-muted/50 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l sm:border-t-0 sm:border-l sm:px-8 sm:py-6"
                  onClick={() => setActiveChart(category)}
                >
                  <div className="flex items-center gap-2">
                    <ConnectorIcon connectorCategory={category} size={12} />
                    <span className="text-muted-foreground text-xs">
                      {chartConfig[category]?.label}
                    </span>
                  </div>
                  <span className="text-lg leading-none font-bold sm:text-3xl">
                    {isLoading ? '...' : (totals[category] || 0).toLocaleString()}
                  </span>
                </button>
              ))}
              </div>
          </CardHeader>
          <CardContent className="px-2 sm:p-6">
            <div className="h-[250px] w-full">
              {isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : chartData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-full w-full">
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
    </div>
  );
}