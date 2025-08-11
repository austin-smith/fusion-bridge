/**
 * Automation Success Rate Chart Component
 * Displays automation success rate as a radial bar chart with stats footer
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart, Label } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { AutomationStats } from '@/types/reports';

export interface AutomationSuccessRateChartProps {
  automationStats: AutomationStats | null;
  isLoading: boolean;
  timeFilterDisplay: string;
  className?: string;
}

export function AutomationSuccessRateChart({
  automationStats,
  isLoading,
  timeFilterDisplay,
  className = ""
}: AutomationSuccessRateChartProps) {
  return (
    <Card className={`flex flex-col h-full ${className}`}>
      <CardHeader className="pb-0 shrink-0">
        <CardTitle>Automation Success Rate</CardTitle>
        <CardDescription>{timeFilterDisplay}</CardDescription>
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
                            {automationStats?.successRate.toLocaleString()}%
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
              <span className="text-xs mt-1">{timeFilterDisplay}</span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm shrink-0">
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
  );
}