'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';
import { RefreshCwIcon, ArrowUpDown, ArrowUp, ArrowDown, ComputerIcon, X, EyeIcon, Loader2, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react';
import { DeviceWithConnector } from '@/types'; // Import from shared types
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatConnectorCategory } from "@/lib/utils"; // Re-add formatConnectorCategory import
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
import { getReadableYoLinkDeviceName } from '@/services/drivers/yolink'; // Import the function

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
    { id: 'connectorCategory', desc: false },
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

  // Update columnFilters when categoryFilter changes
  useEffect(() => {
    const currentCategoryFilter = columnFilters.find(f => f.id === 'connectorCategory');
    const newCategoryFilterValue = categoryFilter === 'all' ? undefined : categoryFilter;

    // Avoid setting state if the value hasn't actually changed
    if (currentCategoryFilter?.value === newCategoryFilterValue) {
      return;
    }

    setColumnFilters(prev => {
      // Remove existing category filter
      const otherFilters = prev.filter(f => f.id !== 'connectorCategory');
      // Add new filter only if a category is selected
      if (newCategoryFilterValue) {
        return [...otherFilters, { id: 'connectorCategory', value: newCategoryFilterValue }];
      } else {
        return otherFilters;
      }
    });
  }, [categoryFilter, columnFilters]); // Depend on columnFilters to prevent potential loops

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
  const columns = useMemo<ColumnDef<DeviceWithConnector>[]>(
    () => [
      {
        accessorKey: 'connectorCategory',
        header: "Connector Type",
        enableSorting: true,
        enableColumnFilter: true,
        filterFn: (row, columnId, value) => {
          return row.getValue(columnId) === value;
        },
        cell: ({ row }) => (
          <div className="capitalize">
            {formatConnectorCategory(row.getValue('connectorCategory'))}
          </div>
        ),
      },
      {
        accessorKey: 'connectorName',
        header: "Connector",
        enableSorting: true,
        enableColumnFilter: true,
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
          const type = row.getValue<string>('type');
          const category = row.original.connectorCategory;
          // Translate only if it's a YoLink device
          return category === 'yolink' ? getReadableYoLinkDeviceName(type) : type;
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
    []
  );

  // Initialize the table with TanStack
  const table = useReactTable({
    data: devices,
    columns,
    state: {
      sorting,
      columnFilters,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableMultiSort: true, // Enable multi-column sorting
  });

  // Effect to control Server column visibility based on category filter
  useEffect(() => {
    const serverColumn = table.getColumn('serverName');
    if (serverColumn) {
      // Hide if YoLink is selected, show otherwise
      serverColumn.toggleVisibility(categoryFilter !== 'yolink');
    }
    // Re-run when filter changes or table instance updates column info
  }, [categoryFilter, table]); 

  return (
    <>
      <div className="flex justify-between items-center mb-6 gap-4">
        <div className="flex items-center gap-4">
          <ComputerIcon className="h-6 w-6 text-muted-foreground" />
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
        <ToggleGroup
          type="single"
          defaultValue="all"
          variant="outline"
          onValueChange={(value) => {
            if (value) {
              setCategoryFilter(value);
            }
          }}
          aria-label="Filter by connector type"
        >
          <ToggleGroupItem value="all" aria-label="All types">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="yolink" aria-label="YoLink type">
            YoLink
          </ToggleGroupItem>
          <ToggleGroupItem value="piko" aria-label="Piko type">
            Piko
          </ToggleGroupItem>
        </ToggleGroup>
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

      {error && (
        <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-md">
          <p>Error: {error}</p>
        </div>
      )}

      {isLoading && devices.length === 0 && (
        <p className="text-muted-foreground">Loading devices...</p>
      )}
      {!isLoading && devices.length === 0 && !error && (
        <p className="text-muted-foreground">
          No devices found. Try syncing or check your connector configurations.
        </p>
      )}

      {devices.length > 0 && (
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
                          {header.column.getCanFilter() ? (
                            header.column.id === 'connectorCategory' ? (
                              null
                            ) : (
                              <DebouncedInput
                                value={(header.column.getFilterValue() ?? '') as string}
                                onChange={value => header.column.setFilterValue(value)}
                                placeholder=""
                              />
                            )
                          ) : null}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="px-2 py-1">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
        </div>
      )}
    </>
  );
} 