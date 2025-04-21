'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ArrowUpDown, ArrowUp, ArrowDown, X, Activity, Layers, List, ChevronDown, ChevronRight, Copy, Check, RefreshCw, EyeIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react';
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
import { getReadableYoLinkDeviceName } from '@/services/drivers/yolink';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useMqttSse } from '@/hooks/use-mqtt-sse';

// Define the event interface
interface YolinkEvent {
  event: string;
  time: number;
  msgid: string;
  data: Record<string, unknown>;
  payload?: Record<string, unknown>;
  deviceId: string;
  deviceName?: string;
  deviceType?: string;
  connectorName?: string;
}

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
  const [events, setEvents] = useState<YolinkEvent[]>([]);
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

  // Function to fetch initial/manual refresh events
  const fetchEvents = useCallback(async () => {
    try {
      setRefreshing(true);
      const response = await fetch('/api/events'); 
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch events');
      }
      
      const data = await response.json();
      
      // Use functional update to get latest events state for duplicate check
      setEvents(prevEvents => {
        const existingMsgIds = new Set(prevEvents.map(e => e.msgid));
        const newEvents = (data.data || []).filter((e: YolinkEvent) => !existingMsgIds.has(e.msgid));
        return [...newEvents, ...prevEvents]; // Prepend new historical if any
      });
      
      toast.success('Fetched recent events.');
    } catch (error) {
      console.error('Error fetching events:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch events');
    } finally {
      setRefreshing(false);
      setLoading(false); // Ensure loading is false after initial fetch
    }
  }, []); 

  // Stable callbacks for the SSE hook
  const handleSseMessage = useCallback((newEvent: YolinkEvent) => {
    // console.log('[EventsPage] Received new event via SSE:', newEvent);
    // Prepend the new event to the list for real-time feel
    setEvents(prevEvents => {
      // Optional: Prevent duplicate msgid if somehow received again
      if (prevEvents.some(e => e.msgid === newEvent.msgid)) {
        return prevEvents;
      }
      return [newEvent, ...prevEvents];
    });
  }, []); // Empty dependency array - this function doesn't depend on component state

  const handleSseError = useCallback((error: Event) => {
    console.error('[EventsPage] SSE connection error:', error);
    toast.error('Real-time update connection lost. Attempting to reconnect...');
    // The hook handles reconnection logic
  }, []); // Empty dependency array

  // Use the SSE hook for real-time updates
  useMqttSse({
    onMessage: handleSseMessage,
    onError: handleSseError
  });

  // Fetch initial events on first load
  useEffect(() => {
    setLoading(true);
    fetchEvents();
    // No interval needed anymore
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchEvents]); // fetchEvents is memoized with useCallback

  // Define columns for TanStack Table
  const columns = useMemo<ColumnDef<YolinkEvent>[]>(() => [
    {
      accessorKey: 'connectorName',
      header: "Connector",
      enableSorting: true,
      enableColumnFilter: true,
      cell: (info) => info.getValue() || 'System',
    },
    {
      accessorKey: 'deviceName',
      header: "Device Name",
      enableSorting: true,
      enableColumnFilter: true,
      cell: ({ row }) => (
        <div className="font-medium">
          {row.original.deviceName || row.original.deviceId || 'Unknown Device'}
        </div>
      ),
    },
    {
      accessorKey: 'deviceType',
      header: "Device Type",
      enableSorting: true,
      enableColumnFilter: true,
      cell: (info) => {
        const type = info.getValue<string>();
        return type ? getReadableYoLinkDeviceName(type) : 'Unknown';
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
      accessorFn: (row) => {
        const stateValue = (row.data as Record<string, unknown>).state;
        return stateValue !== undefined ? String(stateValue) : '';
      },
      id: 'state',
      header: "State",
      enableSorting: true,
      enableColumnFilter: true,
      cell: ({ row }) => {
        const state = row.getValue<string>('state');
        if (!state) return null;

        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="max-w-32 whitespace-nowrap overflow-hidden text-ellipsis">
                  <Badge variant="outline">{state}</Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{state}</p>
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
      cell: ({ row }: { row: Row<YolinkEvent> }) => {
        const timeValue = row.getValue<number>('time');
        if (isNaN(timeValue) || timeValue <= 0) {
          return <span className="text-muted-foreground">Invalid time</span>;
        }
        const eventTime = new Date(timeValue);
        const absoluteTime = format(eventTime, 'PPpp');
        const relativeTime = formatDistanceToNow(eventTime, { addSuffix: true });

        return (
          <div className="flex flex-col">
            <span className="whitespace-nowrap text-sm text-foreground">
              {absoluteTime}
            </span>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {relativeTime}
            </span>
          </div>
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
        const [isCopied, setIsCopied] = useState(false);

        const handleCopy = async (text: string) => {
          try {
            await navigator.clipboard.writeText(text);
            setIsCopied(true);
            toast.success("Copied JSON to clipboard!");
            setTimeout(() => setIsCopied(false), 2000);
          } catch (err) {
            console.error('Failed to copy text: ', err);
            toast.error("Failed to copy JSON.");
          }
        };
        
        const eventData = row.original.payload || row.original.data || {};
        const jsonString = JSON.stringify(eventData, null, 2);
        
        const deviceName = row.original.deviceName || row.original.deviceId || 'Unknown Device';
        const deviceType = row.original.deviceType ? getReadableYoLinkDeviceName(row.original.deviceType) : 'Unknown Type';
        const connectorName = row.original.connectorName || 'System';

        return (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <EyeIcon className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Event Data</DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="details" className="mt-2">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="details">Key Details</TabsTrigger>
                  <TabsTrigger value="raw">Raw JSON</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-4">
                  <div className="max-h-96 overflow-y-auto rounded-md border p-4 text-sm">
                    {
                      (() => {                    
                        const deviceInfoEntries = [
                          { key: 'Device Name', value: deviceName },
                          { key: 'Device Type', value: deviceType },
                          { key: 'Connector', value: connectorName },
                        ];
                        
                        let payloadEntries: { key: string, value: unknown }[] = [];
                        if (eventData && typeof eventData === 'object') {
                          payloadEntries = Object.entries(eventData)
                            .filter(([, value]) => typeof value !== 'object' && value !== null && value !== undefined)
                            .map(([key, value]) => ({ key, value }));
                        }

                        const allEntries = [...deviceInfoEntries, ...payloadEntries];
                        if (allEntries.length === 0) {
                          return <p className="text-muted-foreground">No details available.</p>;
                        }

                        return (
                          <div className="flex flex-col gap-4">
                            {/* Device Info */}
                            <div>
                              <h4 className="mb-2 text-sm font-semibold text-foreground">Device Information</h4>
                              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                                {deviceInfoEntries.map(({ key, value }) => (
                                  <React.Fragment key={key}>
                                    <dt className="font-medium text-muted-foreground">{key}</dt>
                                    <dd className="text-foreground">{String(value)}</dd>
                                  </React.Fragment>
                                ))}
                              </dl>
                            </div>

                            {payloadEntries.length > 0 && <div className="border-b border-border"></div>}

                            {/* Event Data */}
                            {payloadEntries.length > 0 && (
                              <div>
                                <h4 className="mb-2 text-sm font-semibold text-foreground">Event Data</h4>
                                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                                  {payloadEntries.map(({ key, value }) => (
                                    <React.Fragment key={key}>
                                      <dt className="font-medium text-muted-foreground capitalize truncate">{key}</dt>
                                      <dd className="text-foreground">{String(value)}</dd>
                                    </React.Fragment>
                                  ))}
                                </dl>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    }
                  </div>
                </TabsContent>
                
                <TabsContent value="raw" className="mt-4">
                  <div className="relative">
                    <Button 
                      size="icon"
                      variant="ghost"
                      className="absolute top-2 right-2 h-7 w-7 z-50"
                      onClick={() => handleCopy(jsonString)}
                      disabled={isCopied}
                    >
                      {isCopied ? 
                        <Check className="h-4 w-4 text-green-500" /> : 
                        <Copy className="h-4 w-4 text-neutral-400" />
                      }
                      <span className="sr-only">{isCopied ? 'Copied' : 'Copy JSON'}</span>
                    </Button>
                    <SyntaxHighlighter 
                      language="json" 
                      style={atomDark}
                      customStyle={{
                        maxHeight: '24rem',
                        overflowY: 'auto',
                        borderRadius: '6px',
                        fontSize: '13px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                      }}
                    >
                      {jsonString}
                    </SyntaxHighlighter>
                  </div>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
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

  return (
    <>
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
        <TooltipProvider delayDuration={100}>
          <div className="flex gap-2">
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
          </div>
        </TooltipProvider>
      </div>

      {loading && events.length === 0 ? (
        <p className="text-muted-foreground">Loading initial events...</p>
      ) : !loading && events.length === 0 ? (
        <p className="text-muted-foreground">
          No events have been received yet. Live events will appear here automatically.
        </p>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
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
          </div>
          {/* Pagination Controls */} 
          <div className="flex items-center justify-between p-2 border-t">
            <div className="flex-1 text-sm text-muted-foreground">
              {/* Display total rows or other relevant info if needed */}
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
    </>
  );
} 