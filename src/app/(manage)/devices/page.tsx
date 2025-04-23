'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';
import { RefreshCwIcon, ArrowUpDown, ArrowUp, ArrowDown, Cpu, X, EyeIcon, Loader2, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, Network } from 'lucide-react';
import { DeviceWithConnector } from '@/types'; // Import from shared types
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { getDeviceTypeIcon } from "@/lib/device-mapping"; // Import icon getter
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  useReactTable,
  PaginationState,
  getPaginationRowModel,
} from '@tanstack/react-table';
import { DeviceDetailDialogContent } from "@/components/features/devices/device-detail-dialog-content"; // Import new component
import { DeviceMappingDialogContent } from "@/components/features/devices/device-mapping-dialog-content"; // Import new component
import { ConnectorIcon } from "@/components/features/connectors/connector-icon"; // Import ConnectorIcon
import { Badge } from "@/components/ui/badge";

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

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceWithConnector[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'connectorName', desc: false },
    { id: 'name', desc: false }
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [associatedDevices, setAssociatedDevices] = useState<{id: string, name: string}[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [loadingAssociatedDevices, setLoadingAssociatedDevices] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });
  
  // Set page title on client side
  useEffect(() => {
    document.title = 'Devices // Fusion Bridge';
  }, []);

  // Function to fetch devices *from the database* using GET
  const loadDevicesFromDb = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    // Don't clear devices immediately, maybe show stale data while loading?
    // setDevices([]); 
    console.log('Loading existing devices from DB via GET /api/devices');
    try {
      const response = await fetch('/api/devices'); // Default GET request
      const data = await response.json();
      console.log('GET /api/devices response received:', data);

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load devices from database');
      }
      setDevices(data.data || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error loading devices from DB:', errorMessage);
      setError(errorMessage);
      setDevices([]); // Clear devices on error
      toast.error(`Failed to load devices: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, []); // No dependencies needed for this version

  // Function to SYNC devices (POST request)
  const syncDevices = useCallback(async () => {
    setIsSyncing(true);
    setError(null);
    // Maybe don't clear devices here either, update in place?
    // setDevices([]); 
    const loadingToastId = toast.loading('Syncing devices...');

    try {
      console.log('Syncing devices via POST to /api/devices');
      const response = await fetch('/api/devices', {
        method: 'POST', // Use POST to trigger sync
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      console.log('Sync POST /api/devices response received:', data);

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to sync devices');
      }

      // Update state with the newly synced data
      setDevices(data.data || []);
      toast.dismiss(loadingToastId);
      toast.success(`Synced ${data.syncedCount || 0} devices.`);
      
      // Display any errors from specific connectors
      if (data.errors && data.errors.length > 0) {
          data.errors.forEach((err: { connectorName: string; error: string }) => {
              toast.warning(`Connector ${err.connectorName}: ${err.error}`);
          });
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error syncing devices:', errorMessage);
      setError(errorMessage);
      // Don't clear devices on sync error, keep potentially stale data
      toast.dismiss(loadingToastId);
      toast.error(`Failed to sync devices: ${errorMessage}`);
    } finally {
      setIsSyncing(false);
    }
  }, []); // Dependencies? Maybe not if it always refetches all state? 

  // Load initial devices from DB on mount
  useEffect(() => {
    loadDevicesFromDb();
  }, [loadDevicesFromDb]);

  // Filter devices based on the category toggle *before* passing to the table
  const filteredDevices = useMemo(() => {
    if (categoryFilter === 'all') {
      return devices;
    }
    return devices.filter(device => 
      device.connectorCategory?.toLowerCase() === categoryFilter
    );
  }, [devices, categoryFilter]);

  // Function to fetch associated devices when popover opens
  const fetchAssociatedDevices = useCallback(async (deviceId: string, category: string) => {
    setLoadingAssociatedDevices(true);
    setAssociatedDevices([]);
    setActiveDeviceId(deviceId);
    
    try {
      let endpoint;
      if (category === 'yolink') {
        endpoint = `/api/device-associations?yolinkDeviceId=${deviceId}`;
      } else if (category === 'piko') {
        endpoint = `/api/device-associations?pikoCameraId=${deviceId}`;
      } else {
        setLoadingAssociatedDevices(false);
        return;
      }
      
      const response = await fetch(endpoint);
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        console.error('Failed to fetch associated devices:', data.error);
        setLoadingAssociatedDevices(false);
        return;
      }
      
      // data.data contains the IDs of associated devices
      const associatedIds = data.data || [];
      
      if (associatedIds.length === 0) {
        setLoadingAssociatedDevices(false);
        return;
      }
      
      // Find the device names from our existing devices list
      // Note: associatedIds are external deviceIds, so we match against deviceId
      const devicesWithNames = associatedIds
        .map((id: string) => {
          const matchedDevice = devices.find(d => d.deviceId === id);
          return matchedDevice ? {
            id: matchedDevice.deviceId,
            name: matchedDevice.name
          } : null;
        })
        .filter((device: { id: string; name: string } | null): device is { id: string; name: string } => device !== null);
      
      setAssociatedDevices(devicesWithNames);
    } catch (err) {
      console.error('Error fetching associated devices:', err);
    } finally {
      setLoadingAssociatedDevices(false);
    }
  }, [devices]);

  // Define columns for TanStack Table
  const columns = useMemo<ColumnDef<DeviceWithConnector>[]>(() => [
      {
        accessorKey: 'connectorName',
        header: "Connector",
        enableSorting: true,
        enableColumnFilter: true,
        // Filter function now only handles text input
        filterFn: (row, columnId, value) => {
          const name = row.getValue(columnId) as string;
          return name.toLowerCase().includes(String(value).toLowerCase());
        },
        cell: ({ row }) => {
          const connectorName = row.original.connectorName;
          const connectorCategory = row.original.connectorCategory;
          return (
            <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                <ConnectorIcon connectorCategory={connectorCategory} size={12} /> 
                <span className="text-xs">{connectorName}</span>
            </Badge>
          );
        },
      },
      {
        accessorKey: 'name',
        header: "Device Name",
        enableSorting: true,
        enableColumnFilter: true,
        cell: ({ row }) => <div className="font-medium">{row.getValue('name')}</div>,
      },
      {
        accessorKey: 'serverName',
        header: "Server",
        enableSorting: true,
        enableColumnFilter: true,
        cell: ({ row }) => (
          <div className="text-muted-foreground">
            {row.getValue('serverName') || ''}
          </div>
        ),
      },
      {
        accessorKey: 'type',
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
      },
      {
        accessorKey: 'associationCount',
        header: "Associated",
        enableSorting: true,
        cell: ({ row }) => {
          const device = row.original;
          const showCount = device.connectorCategory === 'yolink' || 
                           device.connectorCategory === 'piko'; // Show for all Piko devices
          const count = device.associationCount;
          
          if (!showCount || count === null || count === undefined || count === 0) {
            return null;
          }
          
          return (
            <div>
              <Popover onOpenChange={(open) => {
                if (open) {
                  // Always fetch when opening, regardless of count
                  fetchAssociatedDevices(device.deviceId, device.connectorCategory);
                }
              }}>
                <PopoverTrigger asChild>
                  <Button 
                    variant={count > 0 ? "secondary" : "outline"} 
                    size="sm"
                    className="h-5 min-w-[1.5rem] px-1.5 text-xs font-medium"
                  >
                    {count}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="text-sm p-3 max-w-[250px] w-full" align="center">
                  {count > 0 ? (
                    <div className="space-y-2">
                      <p className="font-medium border-b pb-1">
                        {device.connectorCategory === 'yolink' 
                          ? `Piko Cameras (${count})`
                          : `YoLink Devices (${count})`
                        }
                      </p>
                      <div>
                        {loadingAssociatedDevices ? (
                          <div className="flex justify-center items-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-xs text-muted-foreground">Loading...</span>
                          </div>
                        ) : associatedDevices.length > 0 && activeDeviceId === device.deviceId ? (
                          <ul className="space-y-1 max-h-[150px] overflow-y-auto">
                            {associatedDevices.map(device => (
                              <li key={device.id} className="text-xs py-1 px-1.5 border-b border-border/50 last:border-0">
                                {device.name}
                              </li>
                            ))}
                          </ul>
                        ) : activeDeviceId === device.deviceId ? (
                          <p className="text-xs text-muted-foreground py-1">
                            No associated devices found.
                          </p>
                        ) : (
                          <div className="flex justify-center items-center py-4">
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            <span className="text-xs text-muted-foreground">Loading...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p>No associated devices</p>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: "Actions",
        cell: ({ row }) => {
          const device = row.original;
          return (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <EyeIcon className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DeviceDetailDialogContent device={device} />
              </DialogContent>
            </Dialog>
          );
        },
      },
    ],
    [fetchAssociatedDevices, loadingAssociatedDevices, associatedDevices, activeDeviceId]
  );

  // Initialize the table with TanStack - pass filteredDevices
  const table = useReactTable({
    data: filteredDevices, // Use pre-filtered data
    columns,
    state: {
      sorting,
      columnFilters, // Only text filters managed here
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters, // Manages text filters
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableMultiSort: true, 
  });

  // Effect to control Server column visibility based on category filter
  useEffect(() => {
    const serverColumn = table.getColumn('serverName');
    if (serverColumn) {
      serverColumn.toggleVisibility(categoryFilter !== 'yolink');
    }
  }, [categoryFilter, table]);

  return (
    <div className="flex flex-col h-full p-4 md:p-6"> 
      <TooltipProvider>
        <div className="flex justify-between items-center mb-6 gap-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Cpu className="h-6 w-6 text-muted-foreground" />
            <div>
              <h1 className="text-2xl font-semibold text-foreground">
                Devices
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage and view connected devices.
              </p>
            </div>
          </div>
          <div className="flex-grow"></div>
          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              defaultValue="all"
              variant="outline"
              size="sm"
              onValueChange={(value) => {
                if (value) {
                  setCategoryFilter(value);
                }
              }}
              aria-label="Filter by connector type"
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem value="all" aria-label="All types">
                      All
                    </ToggleGroupItem>
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

            <Dialog>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Network className="h-4 w-4" />
                        <span className="sr-only">View Mappings</span>
                      </Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View Device Mappings</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DialogContent className="sm:max-w-[700px]">
                <DeviceMappingDialogContent />
              </DialogContent>
            </Dialog>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={syncDevices} disabled={isLoading || isSyncing} size="sm">
                    <RefreshCwIcon className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Syncing...' : 'Sync'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Sync devices</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div className="flex-shrink-0">
          {error && (
            <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-md">
              <p>Error: {error}</p>
            </div>
          )}
        </div>

        {isLoading && filteredDevices.length === 0 && (
          <p className="text-muted-foreground">Loading devices...</p>
        )}
        {filteredDevices.length === 0 && !isLoading && !error && categoryFilter === 'all' && (
          <p className="text-muted-foreground">
            No devices found. Try syncing or check your connector configurations.
          </p>
        )}
        {filteredDevices.length === 0 && (isLoading || error || categoryFilter !== 'all' || columnFilters.length > 0) && !isLoading && (
          <p className="text-muted-foreground">
            No devices match the current filters.
          </p>
        )}

        {filteredDevices.length > 0 && (
          <div className="border rounded-md flex-grow overflow-hidden flex flex-col"> 
            <div className="flex-grow overflow-auto"> 
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
                              {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                              {header.column.getCanSort() ? <SortIcon isSorted={header.column.getIsSorted()} /> : null}
                            </div>
                          </div>
                          <div className="mt-1 h-8">
                            {header.column.getCanFilter() ? (
                              <DebouncedInput
                                value={(header.column.getFilterValue() ?? '') as string}
                                onChange={value => header.column.setFilterValue(value)}
                                placeholder=""
                              />
                            ) : null}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows?.length ? table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="px-2 py-1">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-24 text-center">
                        No results.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
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
          </div>
        )}
      </TooltipProvider>
    </div>
  );
} 