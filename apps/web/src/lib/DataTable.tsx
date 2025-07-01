'use client';

import * as React from 'react';
import { type ColumnDef, type Row } from '@tanstack/react-table';
import { DataTable as BaseDataTable } from '@/components/ui/data-table';
import { cn } from '@/lib/utils';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onRowClick?: (row: Row<TData>) => void;
  className?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  className,
}: DataTableProps<TData, TValue>) {
  return (
    <div className={cn('w-full max-w-full overflow-hidden rounded-md border', className)}>
      <div className="w-full overflow-auto">
        <div className="min-w-full">
          <BaseDataTable
            columns={columns}
            data={data}
            onRowClick={onRowClick}
          />
        </div>
      </div>
    </div>
  );
} 