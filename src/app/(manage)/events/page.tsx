'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from "@/components/ui/input";
import { format, formatDistanceToNow } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUpDown, ArrowUp, ArrowDown, X, Activity, Layers, List, ChevronDown, ChevronRight, RefreshCw, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, Play } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  ExpandedState,
  getExpandedRowModel,
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  GroupingState,
  useReactTable,
  Row,
  PaginationState,
  getPaginationRowModel,
} from '@tanstack/react-table';
import { getDeviceTypeIcon, DeviceType, getDisplayStateIcon } from '@/lib/device-mapping';
import { TypedDeviceInfo, DisplayState } from '@/types/device-mapping';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EventDetailDialogContent } from '@/components/features/events/event-detail-dialog-content';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { cn, formatConnectorCategory } from "@/lib/utils";
import { toast } from 'sonner';

// Update the event interface - back to simple placeholders
interface EnrichedEvent {
  event: string;
  time: number;
  msgid: string;
  data: Record<string, unknown>;
  payload?: Record<string, unknown>;
  deviceId: string;
  deviceName?: string;
  connectorName?: string;
  deviceTypeInfo: TypedDeviceInfo;
  connectorCategory: string;
  displayState?: DisplayState | undefined;
  thumbnailUrl?: string; // For single video placeholder
  videoUrl?: string; // For single video placeholder
  // associatedPikoCameras?: PikoCameraInfo[]; // Removed array
}

// Define a cleaner tag component for the dialog
const EventTag = ({ 
  icon, 
  label,
  variant = "outline" 
}: { 
  icon: React.ReactNode, 
  label: React.ReactNode,
  variant?: "outline" | "secondary" | "default" 
}) => (
  <Badge variant={variant} className="inline-flex items-center gap-1.5 px-2 py-1 font-normal text-xs">
    {icon}
    <span>{label}</span>
  </Badge>
);

// A simple component for sort indicators
function SortIcon({ isSorted }: { isSorted: false | 'asc' | 'desc' }) {
  if (!isSorted) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-30" />;
  return isSorted === 'asc' ? 
    <ArrowUp className="ml-2 h-4 w-4" /> : 
    <ArrowDown className="ml-2 h-4 w-4" />;
}

// A debounced input component for filtering
function DebouncedInput({
  value: initialValue,
  onChange,
  debounce = 300,
  ...props
}: {
  value: string
  onChange: (value: string) => void
  debounce?: number
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'>) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (value !== initialValue) {
        onChange(value);
      }
    }, debounce);

    return () => clearTimeout(timeout);
  }, [value, initialValue, debounce, onChange]);

  return (
    <div className="relative">
      <Input
        {...props}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="text-xs px-2 py-1 h-8"
      />
      {value && (
        <button
          onClick={() => setValue('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState<EnrichedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'time', desc: true }
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [isGrouped, setIsGrouped] = useState(false);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Function to fetch events
  const fetchEvents = useCallback(async (isInitialLoad = false) => {
    if (!isInitialLoad) {
      // setRefreshing(true);
    }
    try {
      const response = await fetch('/api/events');

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch events');
      }

      const data = await response.json();

      setEvents(data.data || []);

    } catch (error) {
      console.error('Error fetching events:', error);
      // toast.error(error instanceof Error ? error.message : 'Failed to fetch events');
    } finally {
      // setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchEvents(true);

    const intervalId = setInterval(() => {
      fetchEvents();
    }, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, [fetchEvents]);

  // Define columns for TanStack Table
  const columns = useMemo<ColumnDef<EnrichedEvent>[]>(() => [
    {
      accessorKey: 'connectorCategory',
      header: "Connector",
      enableSorting: true,
      enableColumnFilter: true,
      filterFn: (row, columnId, value) => {
        if (value === 'all') return true;
        return row.original.connectorCategory?.toLowerCase() === value;
      },
      cell: ({ row }) => {
        const connectorName = row.original.connectorName;
        const connectorCategory = row.original.connectorCategory;
        return (
          <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
            <ConnectorIcon connectorCategory={connectorCategory} size={12} />
            <span className="text-xs">{connectorName || 'System'}</span>
          </Badge>
        );
      },
    },
    {
      accessorKey: 'deviceName',
      header: "Device Name",
      enableSorting: true,
      enableColumnFilter: true,
      cell: ({ row }) => row.original.deviceName || row.original.deviceId || 'Unknown Device',
    },
    {
      accessorKey: 'deviceTypeInfo.type',
      header: "Device Type",
      enableSorting: true,
      enableColumnFilter: true,
      cell: ({ row }) => {
        const typeInfo = row.original.deviceTypeInfo;
        const IconComponent = getDeviceTypeIcon(typeInfo.type);
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                  <IconComponent className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs">{typeInfo.type}</span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Type: {typeInfo.type}</p>
                {typeInfo.subtype && <p>Subtype: {typeInfo.subtype}</p>}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
      filterFn: (row, id, value) => {
        return String(row.original.deviceTypeInfo.type).toLowerCase().includes(String(value).toLowerCase());
      },
    },
    {
      accessorKey: 'event',
      header: "Event Type",
      enableSorting: true,
      enableColumnFilter: true,
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.getValue<string>('event')}
        </Badge>
      ),
    },
    {
      id: 'state',
      header: "State",
      enableSorting: true,
      enableColumnFilter: true,
      cell: ({ row }) => {
        const displayState = row.original.displayState;

        if (displayState === undefined || displayState === null) {
          return null;
        }

        const StateIcon = getDisplayStateIcon(displayState); // Get the dynamic icon

        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Using div for tooltip trigger still, but badge inside has icon */}
                <div className="max-w-32 whitespace-nowrap overflow-hidden text-ellipsis cursor-default">
                  <Badge variant="outline" className="inline-flex items-center gap-1 px-2 py-0.5">
                     {/* Render the dynamic icon */}
                    {React.createElement(StateIcon, { className: "h-3 w-3 flex-shrink-0" })}
                    <span>{displayState}</span>
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{displayState}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      accessorKey: 'time',
      header: "Time",
      enableSorting: true,
      enableColumnFilter: true,
      cell: ({ row }: { row: Row<EnrichedEvent> }) => {
        const timeValue = row.getValue<number>('time');
        if (isNaN(timeValue) || timeValue <= 0) {
          return <span className="text-muted-foreground">Invalid time</span>;
        }
        const eventTime = new Date(timeValue);
        const now = new Date();
        const isToday = eventTime.getDate() === now.getDate() && 
                        eventTime.getMonth() === now.getMonth() && 
                        eventTime.getFullYear() === now.getFullYear();
        
        const isThisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) < eventTime;
        
        let displayTime;
        let tooltipTime = format(eventTime, 'PPpp'); // Full date and time for tooltip
        
        if (isToday) {
          displayTime = format(eventTime, 'h:mm a'); // Just time for today
        } else if (isThisWeek) {
          displayTime = format(eventTime, 'EEE h:mm a'); // Day and time for this week
        } else {
          displayTime = format(eventTime, 'MMM d, yyyy'); // Date for older events
        }
        
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger className="flex w-full">
                <div className="flex flex-col items-start text-left">
                  <span className="whitespace-nowrap text-sm">
                    {displayTime}
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDistanceToNow(eventTime, { addSuffix: true })}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{tooltipTime}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
      sortingFn: 'datetime',
    },
    {
      id: 'actions',
      header: "Actions",
      enableSorting: false,
      enableColumnFilter: false,
      cell: ({ row }) => {
        // Simple setup: Prepare event data and add placeholders
        const eventData = {
          ...row.original,
          connectorCategory: row.original.connectorCategory || 'system',
        } as EnrichedEvent; 

        // Always add placeholder URLs for testing
        eventData.thumbnailUrl = '/placeholder-thumbnail.jpg';
        eventData.videoUrl = '/placeholder-video.mp4';

        return (
          <div className="flex items-center gap-1">
            {/* --- Single Unconditional Video Dialog --- */}
            <Dialog>
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="icon" className="h-6 w-6 flex-shrink-0">
                        {/* Using Play icon */}
                        <Play className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                     <p>Play Video</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DialogContent className="max-w-[700px]">
                <DialogHeader className="pb-0">
                  <DialogTitle className="flex items-center gap-2 text-lg">
                    <Play className="h-4 w-4" />
                    Video Playback
                  </DialogTitle>
                </DialogHeader>
                
                {/* Video Player - Now First for Visual Priority */}
                <div className="aspect-video bg-muted rounded-md flex items-center justify-center mb-2 mt-4">
                  <p className="text-muted-foreground">Video Player for {eventData.videoUrl} goes here</p>
                </div>
                
                {/* Camera Selector */}
                <div className="mb-2">
                  <Select disabled>
                    <SelectTrigger className="w-full bg-muted/40">
                      <SelectValue placeholder="Select Camera..." />
                    </SelectTrigger>
                  </Select>
                </div>
                
                {/* Context Area: Device/Tags on Left, Time on Right */}
                <div className="grid grid-cols-[1fr_auto] gap-x-4 items-start mb-4"> {/* Parent grid */}
                  {/* Left Column: Device Name + Tags */}
                   {/* Event Context: Tags + Device Name Row */}
                  <div className="flex flex-wrap gap-1.5"> {/* Removed mb-2 */}
                    {/* Device Name - Most prominent */}
                    <div className="w-full px-0.5 mb-0.5">
                      <span className="text-md font-medium">{eventData.deviceName || eventData.deviceId}</span>
                    </div>
                    
                    {/* Tags Row */}
                    <EventTag 
                      icon={<ConnectorIcon connectorCategory={eventData.connectorCategory} size={12} />}
                      label={eventData.connectorName || formatConnectorCategory(eventData.connectorCategory)}
                    />
                    
                    <EventTag 
                      icon={React.createElement(getDeviceTypeIcon(eventData.deviceTypeInfo.type), { className: "h-3 w-3" })}
                      label={
                        <>
                          {eventData.deviceTypeInfo.type}
                          {eventData.deviceTypeInfo.subtype && (
                            <span className="opacity-70 ml-1">/ {eventData.deviceTypeInfo.subtype}</span>
                          )}
                        </>
                      }
                      variant="secondary"
                    />
                    
                    {eventData.displayState && (
                      <EventTag 
                        icon={React.createElement(getDisplayStateIcon(eventData.displayState), { className: "h-3 w-3" })}
                        label={eventData.displayState}
                      />
                    )}
                  </div>
                  {/* End Left Column */}

                  {/* Right Column: Event Time */}
                   {/* Event Time - Moved here */}
                  <div className="text-xs text-muted-foreground text-right"> {/* Removed mb, added text-right */}
                    Event occurred {formatDistanceToNow(new Date(eventData.time), { addSuffix: true })}
                    <span className="block mt-0.5 opacity-80">
                      {format(new Date(eventData.time), 'PPpp')}
                    </span>
                  </div>
                  {/* End Right Column */}
                </div> {/* End Parent grid */}

                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">Close</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {/* --- End Single Unconditional Video Dialog --- */}

            {/* Existing Details Button */}
            <EventDetailDialogContent event={eventData} />
          </div>
        );
      },
    },
  ], []);

  // Initialize the table with TanStack
  const table = useReactTable({
    data: events,
    columns,
    state: {
      sorting,
      columnFilters,
      grouping,
      expanded,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableMultiSort: true,
    getRowId: (originalRow) => originalRow.msgid, 
  });

  // Effect to update column filters based on category filter
  useEffect(() => {
    const currentCategoryFilter = columnFilters.find(f => f.id === 'connectorCategory');
    const newCategoryFilterValue = categoryFilter === 'all' ? undefined : categoryFilter;

    if (currentCategoryFilter?.value === newCategoryFilterValue) {
      return;
    }

    setColumnFilters(prev => {
      const otherFilters = prev.filter(f => f.id !== 'connectorCategory');
      if (newCategoryFilterValue) {
        return [...otherFilters, { id: 'connectorCategory', value: newCategoryFilterValue }];
      } else {
        return otherFilters;
      }
    });
  }, [categoryFilter, columnFilters]);

  // Restore the main return structure
  return (
    <TooltipProvider>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <Activity className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Events
            </h1>
            <p className="text-sm text-muted-foreground">
              View incoming events from connected devices.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            defaultValue="all"
            variant="outline"
            size="sm"
            onValueChange={(value) => { if (value) setCategoryFilter(value); }}
            aria-label="Filter by connector type"
          >
            <TooltipProvider> 
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value="all" aria-label="All types">All</ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>All Connectors</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value="yolink" aria-label="YoLink type" className="p-1.5 data-[state=on]:bg-accent">
                    <ConnectorIcon connectorCategory="yolink" size={16} />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>YoLink</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value="piko" aria-label="Piko type" className="p-1.5 data-[state=on]:bg-accent">
                    <ConnectorIcon connectorCategory="piko" size={16} />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>Piko</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </ToggleGroup>
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const nextIsGrouped = !isGrouped;
                    setIsGrouped(nextIsGrouped);
                    setGrouping(nextIsGrouped ? ['deviceName'] : []);
                  }}
                  className="h-8 w-8"
                >
                  {isGrouped ? <List className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                  <span className="sr-only">{isGrouped ? 'View Details' : 'Group by Device'}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isGrouped ? 'View Details' : 'Group by Device'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {loading && events.length === 0 ? (
        <p className="text-muted-foreground">Loading initial events...</p>
      ) : !loading && events.length === 0 ? (
        <p className="text-muted-foreground">
          No events have been received yet. This page will update periodically.
        </p>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead 
                      key={header.id}
                      className="px-2 py-1"
                    >
                      <div 
                        className={header.column.getCanSort() ? "cursor-pointer select-none" : undefined}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <div className="flex items-center">
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                          {header.column.getCanSort() && (
                            <SortIcon isSorted={header.column.getIsSorted()} />
                          )}
                        </div>
                      </div>
                      <div className="mt-1 h-8">
                        {header.column.getCanFilter() && (
                          <DebouncedInput
                            value={(header.column.getFilterValue() ?? '') as string}
                            onChange={value => header.column.setFilterValue(value)}
                            placeholder=""
                          />
                        )}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
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
          {/* Pagination Controls */}
          <div className="flex items-center justify-between p-2 border-t">
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
        </div>
      )}
    </TooltipProvider>
  );
}