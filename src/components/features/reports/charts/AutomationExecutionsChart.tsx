/**
 * Automation Executions Chart Component
 * Displays automation executions as a horizontal stacked bar chart with success/failure breakdown
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CartesianGrid, XAxis, YAxis, Bar, BarChart, LabelList } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import type { AutomationChartData } from '@/types/reports';

export interface AutomationExecutionsChartProps {
  chartData: AutomationChartData[];
  chartConfig: ChartConfig;
  isLoading: boolean;
  timeFilterDisplay: string;
  className?: string;
}

export function AutomationExecutionsChart({
  chartData,
  chartConfig,
  isLoading,
  timeFilterDisplay,
  className = ""
}: AutomationExecutionsChartProps) {
  return (
    <Card className={`flex flex-col h-full ${className}`}>
      <CardHeader className="shrink-0">
        <CardTitle>Automation Executions</CardTitle>
        <CardDescription>{timeFilterDisplay}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        <div className="h-full w-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Skeleton className="h-full w-full rounded-lg" />
            </div>
          ) : chartData.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-full w-full min-h-[200px]">
            <BarChart
              accessibilityLayer
              data={chartData}
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
                  const successRate = (data.total > 0 ? (data.successful / data.total) * 100 : 0).toFixed(1);
                  
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
              <span className="text-xs mt-1">{timeFilterDisplay}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}