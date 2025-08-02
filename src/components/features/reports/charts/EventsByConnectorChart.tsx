/**
 * Events by Connector Chart Component
 * Displays events as a line chart with interactive connector type tabs
 */

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartLegend,
} from "@/components/ui/chart";
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import { CustomTooltip, CustomLegendContent } from '@/components/features/reports/charts';
import { calculateCategoryTotals } from '@/lib/reports';
import type { EventChartData, GroupedEventData } from '@/types/reports';

export interface EventsByConnectorChartProps {
  chartData: EventChartData[];
  chartConfig: ChartConfig;
  groupedEventData: GroupedEventData[];
  eventCount: number;
  isLoading: boolean;
  timeFilterDisplay: string;
  className?: string;
}

export function EventsByConnectorChart({
  chartData,
  chartConfig,
  groupedEventData,
  eventCount,
  isLoading,
  timeFilterDisplay,
  className = ""
}: EventsByConnectorChartProps) {
  const [activeChart, setActiveChart] = useState<string>('all');

  // Calculate totals for each connector type using utility function
  const totals = useMemo(() => {
    return calculateCategoryTotals(groupedEventData);
  }, [groupedEventData]);

  return (
    <Card className={`flex flex-col h-full ${className}`}>
      <CardHeader className="flex flex-col items-stretch border-b flex-shrink-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pb-3 sm:pb-0">
          <CardTitle>Events by Connector Type</CardTitle>
          <CardDescription>{timeFilterDisplay}</CardDescription>
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
              <ChartTooltip cursor={false} content={<CustomTooltip chartConfig={chartConfig} />} />
              {activeChart === 'all' && (
                <ChartLegend content={<CustomLegendContent chartConfig={chartConfig} />} />
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
                : Object.keys(chartConfig).includes(activeChart) && (
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
  );
}