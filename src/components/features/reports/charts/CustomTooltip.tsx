/**
 * Custom chart tooltip component with connector icons
 * Reusable tooltip for reports charts
 */

import React from 'react';
import type { ChartConfig } from '@/components/ui/chart';
import { ConnectorIcon } from '@/components/features/connectors/connector-icon';

export interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey: string;
    value: number | string;
    color: string;
    [key: string]: any;
  }>;
  label?: string;
  chartConfig: ChartConfig;
}

export function CustomTooltip({ 
  active, 
  payload, 
  label, 
  chartConfig 
}: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="rounded-lg border bg-background p-2 shadow-sm">
      <div className="grid gap-2">
        <div className="flex flex-col">
          <span className="text-[0.70rem] uppercase text-muted-foreground">
            {label}
          </span>
        </div>
        {payload.map((entry, index) => (
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
              {chartConfig[entry.dataKey]?.label || entry.dataKey}
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