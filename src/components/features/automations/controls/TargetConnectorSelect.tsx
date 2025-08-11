'use client';

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormControl } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import type { connectors } from '@/data/db/schema';
import { ConnectorIcon } from '@/components/features/connectors/connector-icon';

type ConnectorSelect = typeof connectors.$inferSelect;

interface TargetConnectorSelectProps {
  value?: string;
  onChange: (value: string) => void;
  connectors: Pick<ConnectorSelect, 'id' | 'name' | 'category'>[];
  isLoading?: boolean;
  error?: boolean;
}

export function TargetConnectorSelect({ value, onChange, connectors, isLoading, error }: TargetConnectorSelectProps) {
  const selected = connectors.find(c => c.id === value);

  return (
    <Select onValueChange={onChange} value={value ?? ''} disabled={isLoading}>
      <FormControl>
        <SelectTrigger className={cn('flex items-center w-[220px]', error && 'border-destructive')}>
          <SelectValue placeholder="Select Target Connector">
            {selected && (
              <div className="flex items-center gap-2">
                <ConnectorIcon connectorCategory={selected.category} size={18} className="mr-1 shrink-0" />
                <span className="truncate">{selected.name}</span>
              </div>
            )}
            {!selected && 'Select Target Connector'}
          </SelectValue>
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {connectors.map(connector => (
          <SelectItem key={connector.id} value={connector.id} className="flex items-center py-1.5">
            <div className="flex items-center gap-2">
              <ConnectorIcon connectorCategory={connector.category} size={16} className="shrink-0" />
              <span className="font-medium">{connector.name}</span>
            </div>
          </SelectItem>
        ))}
        {connectors.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">No Piko connectors found</div>
        )}
      </SelectContent>
    </Select>
  );
}


