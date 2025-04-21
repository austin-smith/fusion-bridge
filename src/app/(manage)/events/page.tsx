'use client';

import React, { useEffect, useState, useMemo } from 'react';
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
import { ArrowUpDown, ArrowUp, ArrowDown, X, Activity, Layers, List, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
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
} from '@tanstack/react-table';
import { getReadableYoLinkDeviceName } from '@/services/drivers/yolink';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Add Tabs imports
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

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
  const [serviceInitialized, setServiceInitialized] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'time', desc: true }
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [isGrouped, setIsGrouped] = useState(false);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  // Function to initialize the MQTT service
  const initializeService = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/events', {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize event service');
      }
      
      setServiceInitialized(true);
      toast.success('Event service initialized successfully');
      
      // Fetch initial events
      await fetchEvents();
    } catch (error) {
      console.error('Error initializing event service:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to initialize event service');
    } finally {
      setLoading(false);
    }
  };

  // Function to fetch events
  const fetchEvents = async () => {
    try {
      setRefreshing(true);
      const response = await fetch('/api/events');
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch events');
      }
      
      const data = await response.json();
      setEvents(data.data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch events');
    } finally {
      setRefreshing(false);
    }
  };

  // Initialize the service on first load
  useEffect(() => {
    initializeService();
    
    // Set up a refresh interval
    const interval = setInterval(fetchEvents, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  // Define columns for TanStack Table
  const columns = useMemo<ColumnDef<YolinkEvent>[]>(() => [
    {
      accessorKey: 'connectorName',
      header: "Connector",
      enableSorting: true,
      enableColumnFilter: true,
      cell: (info) => info.getValue() || 'Unknown',
    },
    {
      accessorKey: 'deviceName',
      header: "Device Name",
      enableSorting: true,
      enableColumnFilter: true,
      cell: ({ row }) => (
        <div className="font-medium">
          {row.getValue('deviceName') || 'Unknown Device'}
        </div>
      ),
    },
    {
      accessorKey: 'deviceType',
      header: "Device Type",
      enableSorting: true,
      enableColumnFilter: true,
      cell: (info) => {
        const type = info.getValue<string>() || 'Unknown';
        return getReadableYoLinkDeviceName(type);
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
        return state ? (
          <Badge variant="outline">{state}</Badge>
        ) : '';
      },
    },
    {
      accessorKey: 'time',
      header: "Time",
      enableSorting: true,
      enableColumnFilter: true,
      cell: ({ row }: { row: Row<YolinkEvent> }) => {
        const eventTime = new Date(row.getValue<number>('time'));
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
      id: 'data',
      header: "Data",
      enableSorting: false,
      enableColumnFilter: false,
      cell: ({ row }) => {
        const [isCopied, setIsCopied] = useState(false);

        const handleCopy = async (text: string) => {
          try {
            await navigator.clipboard.writeText(text);
            setIsCopied(true);
            toast.success("Copied JSON to clipboard!");
            setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
          } catch (err) {
            console.error('Failed to copy text: ', err);
            toast.error("Failed to copy JSON.");
          }
        };

        const jsonString = JSON.stringify(row.original.payload || row.original.data, null, 2);

        return (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2">
                View
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
                        // Prepare device info first
                        const deviceInfoEntries = [
                          { key: 'Device Name', value: row.original.deviceName },
                          { key: 'Device Type', value: row.original.deviceType ? getReadableYoLinkDeviceName(row.original.deviceType) : undefined },
                          { key: 'Connector', value: row.original.connectorName },
                        ].filter(entry => entry.value !== undefined && entry.value !== null);

                        // Extract payload/data details
                        const eventData = row.original.payload || row.original.data;
                        let payloadEntries: { key: string, value: unknown }[] = [];

                        if (eventData && typeof eventData === 'object') {
                          payloadEntries = Object.entries(eventData)
                            .filter(([, value]) => typeof value !== 'object' && value !== null && value !== undefined)
                            .map(([key, value]) => ({ key, value }));
                        }

                        // Combine and render
                        const allEntries = [...deviceInfoEntries, ...payloadEntries];

                        if (allEntries.length === 0) {
                          return <p className="text-muted-foreground">No details available.</p>;
                        }

                        // Use flex column for overall structure
                        return (
                          <div className="flex flex-col gap-4">
                            {/* Device Information Section */} 
                            {deviceInfoEntries.length > 0 && (
                              <div>
                                <h4 className="mb-2 text-sm font-semibold text-foreground">
                                  Device Information
                                </h4>
                                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                                  {deviceInfoEntries.map(({ key, value }) => (
                                    <React.Fragment key={key}>
                                      <dt className="font-medium text-muted-foreground">{key}</dt>
                                      <dd className="text-foreground">{String(value)}</dd>
                                    </React.Fragment>
                                  ))}
                                </dl>
                              </div>
                            )}

                            {/* Separator (only if both sections exist) */} 
                            {deviceInfoEntries.length > 0 && payloadEntries.length > 0 && (
                              <div className="border-b border-border"></div>
                            )}

                            {/* Event Data Section */} 
                            {payloadEntries.length > 0 && (
                              <div>
                                <h4 className="mb-2 text-sm font-semibold text-foreground">
                                  Event Data
                                </h4>
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

                            {/* Fallback if only device info exists but no payload data */} 
                            {deviceInfoEntries.length > 0 && payloadEntries.length === 0 && (
                              <p className="text-sm text-muted-foreground mt-2">No additional event data found.</p>
                            )}
                          </div>
                        );
                      })()
                    }
                  </div>
                </TabsContent>

                <TabsContent value="raw" className="mt-4">
                  <div className="relative">
                    {/* Position copy button top-right */} 
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
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    enableMultiSort: true, // Enable multi-column sorting
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
              View incoming events from your connected devices.
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
                >
                  {isGrouped ? <List className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                  <span className="sr-only">{isGrouped ? 'View Details' : 'Group by Device'}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isGrouped ? 'View Details' : 'Group by Device'}</p>
              </TooltipContent>
            </Tooltip>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchEvents} 
              disabled={refreshing || loading}
            >
              {refreshing ? 'Refreshing...' : 'Refresh Events'}
            </Button>
            {!serviceInitialized && (
              <Button
                onClick={initializeService}
                disabled={loading}
              >
                {loading ? 'Initializing...' : 'Initialize Event Service'}
              </Button>
            )}
          </div>
        </TooltipProvider>
      </div>

      {loading && events.length === 0 ? (
        <p className="text-muted-foreground">Loading events...</p>
      ) : !loading && events.length === 0 ? (
        <p className="text-muted-foreground">
          No events have been received yet. Events will appear here as devices report status or trigger alerts.
        </p>
      ) : (
        <div className="border rounded-md">
          <div className="max-h-[calc(100vh-220px)] overflow-auto">
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
                    // Render group header or data row
                    row.getIsGrouped() ? (
                      <TableRow key={row.id + '-group'} className="bg-muted/50 hover:bg-muted/60">
                        {/* Make cell clickable to toggle expansion */} 
                        <TableCell 
                          colSpan={columns.length} 
                          className="p-2 font-medium text-sm capitalize cursor-pointer"
                          onClick={row.getToggleExpandedHandler()}
                        >
                          <div className="flex items-center gap-2">
                            {/* Add Chevron icon */} 
                            {row.getIsExpanded() ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            {/* Display grouping column ID and value */} 
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
                      // Render the regular data row
                      <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="px-2 py-2">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    )
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      No results match your filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </>
  );
} 