/**
 * Custom chart legend component with connector icons
 * Reusable legend for reports charts
 */

import React from 'react';
import type { ChartConfig } from '@/components/ui/chart';
import { ConnectorIcon } from '@/components/features/connectors/connector-icon';

export interface CustomLegendContentProps {
  payload?: Array<{
    dataKey: string;
    color: string;
    [key: string]: any;
  }>;
  chartConfig: ChartConfig;
}

export function CustomLegendContent({ 
  payload, 
  chartConfig 
}: CustomLegendContentProps) {
  if (!payload || !payload.length) return null;

  return (
    <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
      {payload.map((entry, index) => (
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
            {chartConfig[entry.dataKey]?.label || entry.dataKey}
          </span>
        </div>
      ))}
    </div>
  );
}