'use client';

import React from 'react';
import { TableHead } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { flexRender } from '@tanstack/react-table';
import { DebouncedInput } from '@/components/common/DebouncedInput';

function SortIcon({ isSorted }: { isSorted: false | 'asc' | 'desc' }) {
  if (!isSorted) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-30" />;
  return isSorted === 'asc' ? (
    <ArrowUp className="ml-2 h-4 w-4" />
  ) : (
    <ArrowDown className="ml-2 h-4 w-4" />
  );
}

export function HeaderCell({ header }: { header: any }) {
  return (
    <TableHead key={header.id} className="relative px-2 py-1" style={{ width: header.getSize() }}>
      <div className={header.column.getCanSort() ? 'cursor-pointer select-none' : undefined} onClick={header.column.getToggleSortingHandler()}>
        <div className="flex items-center">
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : header.column.id}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {header.column.getCanSort() ? <SortIcon isSorted={header.column.getIsSorted()} /> : null}
        </div>
      </div>
      <div className="mt-1 h-8">
        {header.column.getCanFilter() ? (
          <DebouncedInput value={(header.column.getFilterValue() ?? '') as string} onChange={(value) => header.column.setFilterValue(value)} placeholder="" />
        ) : null}
      </div>

      {/* Resize handle */}
      {header.column.getCanResize() ? (
        <div
          onMouseDown={header.getResizeHandler()}
          onTouchStart={header.getResizeHandler()}
          onClick={(e) => e.stopPropagation()}
          className="absolute -right-1.5 top-0 h-full w-3 cursor-col-resize select-none touch-none z-10 group"
          data-resizing={header.column.getIsResizing() || undefined}
        >
          {/* Standard gray resize divider - visible on hover */}
          <div className="absolute right-1 top-0 h-full w-1 bg-transparent transition-colors group-hover:bg-gray-300 group-active:bg-gray-500" />
          {/* Wider invisible hit area for easier interaction */}
          <div className="absolute inset-0 bg-transparent" />
        </div>
      ) : null}
    </TableHead>
  );
}

export default HeaderCell;


