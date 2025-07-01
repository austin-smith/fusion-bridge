'use client';

import React from 'react';
import {
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow
} from "@/components/ui/table";
import { 
  flexRender, 
  Table as TanstackTable, // Alias to avoid naming conflict
  Row, 
  ColumnDef
} from '@tanstack/react-table'; 
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DebouncedInput } from '@/components/common/DebouncedInput';
import { SortIcon } from '@/components/common/SortIcon';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react';

// Define a minimal interface for the event data shape expected by the table
// Adjust as necessary based on actual columns used
interface TableEventData {
  [key: string]: any; // Allow flexible event data structure for now
}

interface EventsTableViewProps<TData extends TableEventData> {
  table: TanstackTable<TData>;
  columns: ColumnDef<TData, any>[];
  // Add other necessary props like isLoading if needed for skeleton/messages
}

// Note: DebouncedInput and SortIcon components would need to be 
// either imported from their original location (if exported) or 
// moved to a shared location and imported here.
// For now, this assumes they are available via import.

export function EventsTableView<TData extends TableEventData>({ table, columns }: EventsTableViewProps<TData>) {
  return (
    <>
      {/* Inner container for scrollable table */}
      <div className="flex-grow overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const headerText = typeof header.column.columnDef.header === 'string' 
                    ? header.column.columnDef.header 
                    : header.column.id;
                  
                  return (
                    <TableHead 
                      key={header.id}
                      className="px-2 py-1"
                    >
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div 
                              className={header.column.getCanSort() ? "cursor-pointer select-none" : undefined}
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              <div className="flex items-center">
                                <span className="block max-w-[100px] overflow-hidden text-ellipsis whitespace-nowrap">
                                  {header.isPlaceholder
                                    ? null
                                    : flexRender(
                                        header.column.columnDef.header,
                                        header.getContext()
                                      )}
                                </span>
                                {header.column.getCanSort() && (
                                  <SortIcon isSorted={header.column.getIsSorted()} />
                                )}
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{headerText}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      <div className="mt-1 h-8">
                        {header.column.getCanFilter() && (
                          <DebouncedInput
                            value={(header.column.getFilterValue() ?? '') as string}
                            onChange={value => {
                              console.log(`[EventsTableView] DebouncedInput onChange for column '${header.column.id}', value: '${value}'`); 
                              header.column.setFilterValue(value)
                            }}
                            placeholder=""
                          />
                        )}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row: Row<TData>) => (
                 row.getIsGrouped() ? (
                   <TableRow key={row.id + '-group'} className="bg-muted/50 hover:bg-muted/60">
                     <TableCell 
                       colSpan={columns.length} 
                       className="p-2 font-medium text-sm capitalize cursor-pointer"
                       onClick={row.getToggleExpandedHandler()}
                     >
                       <div className="flex items-center gap-2">
                         {row.getIsExpanded() ? (
                           <ChevronDown className="h-4 w-4" />
                         ) : (
                           <ChevronRight className="h-4 w-4" />
                         )}
                         {row.groupingColumnId}: 
                         <span className="font-normal">
                           {row.groupingValue as React.ReactNode}
                         </span>
                         <span className="ml-1 text-xs text-muted-foreground font-normal">
                           ({row.subRows.length} items)
                         </span>
                       </div>
                     </TableCell>
                   </TableRow>
                 ) : (
                   <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                     {row.getVisibleCells().map((cell) => (
                       <TableCell key={cell.id} className="px-2 py-1">
                         {flexRender(cell.column.columnDef.cell, cell.getContext())}
                       </TableCell>
                     ))}
                   </TableRow>
                 )
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results match your filters or no events received yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {/* Pagination */}
      <div className="flex items-center justify-between p-2 border-t flex-shrink-0">
        <div className="flex-1 text-sm text-muted-foreground">
          Total Rows: {table.getFilteredRowModel().rows.length}
        </div>
        <div className="flex items-center space-x-6 lg:space-x-8">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium">Rows per page</p>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => {
                table.setPageSize(Number(value))
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue placeholder={table.getState().pagination.pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 25, 50, 100].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-[100px] items-center justify-center text-sm font-medium">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to first page</span>
              <ChevronsLeftIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to last page</span>
              <ChevronsRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
} 