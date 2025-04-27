'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';
import { RefreshCwIcon, ArrowUpDown, ArrowUp, ArrowDown, Cpu, X, EyeIcon, Loader2, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, Network } from 'lucide-react';
import { DeviceWithConnector, ConnectorWithConfig, PikoServer } from '@/types';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { getDeviceTypeIcon, getDisplayStateIcon } from "@/lib/mappings/presentation";
import type { DisplayState, TypedDeviceInfo } from '@/lib/mappings/definitions';
import { useFusionStore } from '@/stores/store';
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
  OnChangeFn,
} from '@tanstack/react-table';
import { DeviceDetailDialogContent } from "@/components/features/devices/device-detail-dialog-content"; 
import { DeviceMappingDialogContent } from "@/components/features/devices/device-mapping-dialog-content"; 
import { ConnectorIcon } from "@/components/features/connectors/connector-icon"; 
import { Badge } from "@/components/ui/badge";
import { formatConnectorCategory } from '@/lib/utils';

// Define the shape of data expected by the table, combining store data
interface DisplayedDevice extends Omit<DeviceWithConnector, 'status' | 'type' | 'pikoServerDetails'> { 
  displayState?: DisplayState; // Use imported DisplayState type
  lastSeen?: Date; 
  deviceTypeInfo: TypedDeviceInfo; // Ensure this is included and required
  // Explicitly add back required fields omitted by Omit or needed for compatibility
  id: string; // Unique internal ID (can be deviceId or derived)
  type: string; // Add back raw device type string
  // Add server details explicitly
  pikoServerDetails?: PikoServer; // <-- Add the field here
  // status: string | null; // Keep status omitted as it's replaced by displayState
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

export default function DevicesPage() {
  // Fetch data from Zustand store - use connectors
  const deviceStates = useFusionStore(state => state.deviceStates);
  const setDeviceStatesFromSync = useFusionStore(state => state.setDeviceStatesFromSync); 
  // const fetchConnectors = useFusionStore(state => state.fetchConnectors); 
  // Use connectors state variable
  const connectors = useFusionStore(state => state.connectors as ConnectorWithConfig<any>[]); 
  
  // const [devices, setDevices] = useState<DeviceWithConnector[]>([]); // Remove local state
  const [isLoadingInitial, setIsLoadingInitial] = useState(true); // <-- Add loading state for initial fetch
  const [error, setError] = useState<string | null>(null); // Keep local error for sync/fetch errors
  const [sorting, setSorting] = useState<SortingState>([ /* Default sort */ ]);
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
  
  // Set page title
  useEffect(() => { document.title = 'Devices // Fusion Bridge'; }, []);

  // --- Initial Data Fetch --- 
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoadingInitial(true);
      setError(null);
      try {
        console.log('[DevicesPage] Fetching initial data (Connectors & Devices)...');
        // Fetch connectors and devices in parallel
        const [connectorsResponse, devicesResponse] = await Promise.all([
          fetch('/api/connectors'), // Fetch connectors endpoint
          fetch('/api/devices')
        ]);

        // Process Connectors Response
        const connectorsData = await connectorsResponse.json();
        if (!connectorsResponse.ok || !connectorsData.success) {
          console.error('[DevicesPage] Failed to fetch initial connectors:', connectorsData.error || 'Unknown error');
          useFusionStore.getState().setConnectors([]); // Use setConnectors
        } else if (connectorsData.data && Array.isArray(connectorsData.data)) {
          useFusionStore.getState().setConnectors(connectorsData.data as ConnectorWithConfig[]); // Use setConnectors
          console.log('[DevicesPage] Initial connectors loaded into store.');
        } else {
          useFusionStore.getState().setConnectors([]); // Use setConnectors
        }
        
        // Process Devices Response
        const devicesData = await devicesResponse.json();
        console.log('[DevicesPage] GET /api/devices response received:', devicesData);
        if (!devicesResponse.ok || !devicesData.success) {
          throw new Error(devicesData.error || 'Failed to fetch initial devices');
        }

        if (devicesData.data && Array.isArray(devicesData.data)) {
          setDeviceStatesFromSync(devicesData.data as DeviceWithConnector[]); 
          console.log('[DevicesPage] Initial devices loaded into store.');
        } else {
          console.warn('[DevicesPage] Initial fetch returned no device data.');
          setDeviceStatesFromSync([]); 
        }
      } catch (err) {
        console.error('[DevicesPage] Error fetching initial data:', err);
        setError(err instanceof Error ? err.message : 'Unknown error fetching data');
        useFusionStore.getState().setConnectors([]); // Use setConnectors
        setDeviceStatesFromSync([]); 
      } finally {
        setIsLoadingInitial(false);
      }
    };
    fetchInitialData();
  }, [setDeviceStatesFromSync]);

  // Combine store data into the format the table expects - use connectors
  const tableData = useMemo((): DisplayedDevice[] => {
    console.log('[DevicesPage] tableData useMemo received deviceStates:', deviceStates);
    
    const connectorsMap = new Map(connectors.map(c => [c.id, c])); 

    // Change iteration method: Use Array.from(deviceStates.values()) instead of Object.values()
    const mappedData = Array.from(deviceStates.values()).map(state => {
        const connector = connectorsMap.get(state.connectorId);
        const serverName = state.serverName; 
        const serverId = state.serverId;     
        const pikoServerDetails = state.pikoServerDetails; 
        const deviceName = state.name ?? 'Unknown Device'; 
        const model = state.model ?? 'N/A';       
        const vendor = state.vendor ?? 'N/A';      
        const url = state.url ?? 'N/A';          
        const rawDeviceType = state.rawType ?? state.deviceInfo?.type ?? 'Unknown'; 

        return {
            id: `${state.connectorId}:${state.deviceId}`, 
            deviceId: state.deviceId,
            connectorId: state.connectorId,
            name: deviceName, 
            connectorName: connector?.name ?? 'Unknown Connector',
            connectorCategory: connector?.category ?? 'unknown',
            deviceTypeInfo: state.deviceInfo, 
            displayState: state.displayState, 
            lastSeen: state.lastSeen,
            associationCount: 0, // Placeholder 
            type: rawDeviceType, 
            url: url,
            model: model,
            vendor: vendor,
            serverName: serverName,
            serverId: serverId,
            pikoServerDetails: pikoServerDetails,
        };
    });

    console.log('[DevicesPage] Mapped tableData:', mappedData);
    return mappedData;
  }, [deviceStates, connectors]);

  // Filter devices based on the category toggle
  const filteredTableData = useMemo(() => {
    if (categoryFilter === 'all') {
      console.log('[DevicesPage] Filtered Data (all):', tableData);
      return tableData;
    }
    const filtered = tableData.filter(device => 
      device.connectorCategory?.toLowerCase() === categoryFilter
    );
    console.log(`[DevicesPage] Filtered Data (${categoryFilter}):`, filtered);
    return filtered;
  }, [tableData, categoryFilter]);

  // --- Keep syncDevices but update messaging --- 
  const syncDevices = useCallback(async () => {
    setIsSyncing(true);
    setError(null);
    const loadingToastId = toast.loading('Triggering device sync...');
    try {
      console.log('Syncing devices via POST to /api/devices');
      const response = await fetch('/api/devices', { method: 'POST' });
      const data = await response.json();
      console.log('Sync POST /api/devices response received:', data);

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to trigger sync');
      }
      
      // --- BEGIN Store Update --- 
      if (data.data && Array.isArray(data.data)) {
        // Use the data returned from the API to update the client-side store
        useFusionStore.getState().setDeviceStatesFromSync(data.data as DeviceWithConnector[]);
        console.log('[DevicesPage] Updated store from sync API response.');
        toast.success(`Sync complete. Updated view with ${data.data.length} devices.`); // Updated toast
      } else {
        // Handle case where sync succeeded but no device data returned (unlikely but possible)
        console.warn('[DevicesPage] Sync API succeeded but returned no device data.');
        toast.success(`Sync complete. No devices found or returned.`);
        // Optionally clear the store if sync implies empty list?
        // useFusionStore.getState().setDeviceStatesFromSync([]); 
      }
      // --- END Store Update ---
      
      toast.dismiss(loadingToastId);
      // Note: UI updates based on store changes triggered by events, not directly from this response. // <-- Keep note, but behavior changed
      // toast.success(`Sync triggered. Found ${data.syncedCount || 0} devices. UI will update as events arrive.`); // <-- REMOVED OLD TOAST
      if (data.errors && data.errors.length > 0) {
          data.errors.forEach((err: { connectorName: string; error: string }) => {
              toast.warning(`Connector ${err.connectorName}: ${err.error}`);
          });
      }
    } catch (err) {
      // ... error handling ...
    } finally {
      setIsSyncing(false);
    }
  }, []); 

  // Re-add fetchAssociatedDevices definition
  const fetchAssociatedDevices = useCallback(async (deviceId: string, category: string) => {
    setLoadingAssociatedDevices(true);
    setActiveDeviceId(deviceId);
    try {
      const response = await fetch(`/api/device-associations?deviceId=${deviceId}&category=${category}`);
      const data = await response.json();
      if (data.success) {
        setAssociatedDevices(data.data);
      } else {
        console.error("Failed to fetch associated devices:", data.error);
        setAssociatedDevices([]);
      }
    } catch (error) {
      console.error("Error fetching associated devices:", error);
      setAssociatedDevices([]);
    } finally {
      setLoadingAssociatedDevices(false);
    }
  }, []); // Keep empty dependency array for fetchAssociatedDevices itself

  // Define columns for TanStack Table
  const columns = useMemo<ColumnDef<DisplayedDevice>[]>(() => [
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
        id: 'state',
        accessorKey: 'displayState', 
        header: "State",
        enableSorting: true,
        cell: ({ row }) => {
          // No need to cast here if tableData uses DisplayState correctly
          const state = row.original.displayState;
          const lastSeen = row.original.lastSeen;
          const StateIcon = getDisplayStateIcon(state);
          return (
             <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5">
                          {state ? (
                            <>
                              <StateIcon className="h-4 w-4 text-muted-foreground shrink-0" /> 
                              <span className="text-xs">{state}</span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Unknown</span>
                          )}
                      </div>
                  </TooltipTrigger>
                  <TooltipContent>
                      <p>Last seen: {lastSeen ? new Date(lastSeen).toLocaleString() : 'Never'}</p>
                  </TooltipContent>
                </Tooltip>
            </TooltipProvider>
          );
        }
      },
      {
        accessorKey: 'deviceTypeInfo', 
        header: "Device Type",
        enableSorting: true,
        sortingFn: (rowA, rowB, columnId) => {
            const typeA = rowA.getValue<TypedDeviceInfo>(columnId).type;
            const typeB = rowB.getValue<TypedDeviceInfo>(columnId).type;
            return typeA.localeCompare(typeB);
        },
        filterFn: (row, columnId, value) => {
            const type = row.getValue<TypedDeviceInfo>(columnId).type;
            return type.toLowerCase().includes(String(value).toLowerCase());
        },
        cell: ({ row }) => {
          const typeInfo = row.original.deviceTypeInfo; // Use the object from combined data
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
        accessorKey: 'serverName',
        header: "Server",
        enableSorting: true,
        enableColumnFilter: true,
        cell: ({ row }) => (
          <div className="text-muted-foreground">
            {row.original.serverName || ''}
          </div>
        ),
      },
      {
        accessorKey: 'associationCount',
        header: "Associated",
        enableSorting: true,
        cell: ({ row }) => {
          const device = row.original;
          const showCount = device.connectorCategory === 'yolink' || device.connectorCategory === 'piko';
          const count = device.associationCount;
          if (!showCount || count === null || count === undefined || count === 0) return null;
          return (
            <div>
              <Popover onOpenChange={(open) => { if (open) { fetchAssociatedDevices(device.deviceId, device.connectorCategory); } }}>
                <PopoverTrigger asChild>
                  <Button variant={count > 0 ? "secondary" : "outline"} size="sm" className="h-5 min-w-[1.5rem] px-1.5 text-xs font-medium">{count}</Button>
                </PopoverTrigger>
                <PopoverContent className="text-sm p-3 max-w-[250px] w-full" align="center">
                  {count > 0 ? (
                    <div className="space-y-2">
                      <p className="font-medium border-b pb-1">{device.connectorCategory === 'yolink' ? `Piko Cameras (${count})` : `YoLink Devices (${count})`}</p>
                      <div>
                        {loadingAssociatedDevices ? (
                          <div className="flex justify-center items-center py-4"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs text-muted-foreground">Loading...</span></div>
                        ) : associatedDevices.length > 0 && activeDeviceId === device.deviceId ? (
                          <ul className="space-y-1 max-h-[150px] overflow-y-auto">
                            {associatedDevices.map(assocDevice => (
                              <li key={assocDevice.id} className="text-xs py-1 px-1.5 border-b border-border/50 last:border-0">{assocDevice.name}</li>
                            ))}
                          </ul>
                        ) : activeDeviceId === device.deviceId ? (
                          <p className="text-xs text-muted-foreground py-1">No associated devices found.</p>
                        ) : (
                          <div className="flex justify-center items-center py-4"><Loader2 className="h-4 w-4 mr-2 animate-spin" /><span className="text-xs text-muted-foreground">Loading...</span></div>
                        )}
                      </div>
                    </div>
                  ) : (<div className="space-y-2"><p>No associated devices</p></div>)}
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
              <DialogTrigger asChild><Button variant="ghost" size="icon"><EyeIcon className="h-4 w-4" /></Button></DialogTrigger>
              <DialogContent className="sm:max-w-[600px]"><DeviceDetailDialogContent device={device} /></DialogContent>
            </Dialog>
          );
        },
      },
    ],
    // Add dependencies back to the columns useMemo hook
    [fetchAssociatedDevices, loadingAssociatedDevices, associatedDevices, activeDeviceId]
  );

  // Initialize the table with TanStack
  const table = useReactTable({
    data: filteredTableData, // Use derived data from store
    columns,
    state: {
      sorting,
      columnFilters, // Only text filters managed here
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters, // Manages text filters
    onPaginationChange: setPagination as OnChangeFn<PaginationState>,
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
      // Show server column for Piko and NetBox, hide for YoLink
      // For 'all' category, show the column
      const shouldShowServerColumn = 
        categoryFilter === 'all' || 
        ['piko', 'netbox'].includes(categoryFilter);
      
      serverColumn.toggleVisibility(shouldShowServerColumn);
    }
  }, [categoryFilter, table]);

  // Extract unique connector categories from connectors state
  const connectorCategories = useMemo(() => {
    const categorySet = new Set<string>();
    connectors.forEach(connector => {
      if (connector.category) {
        categorySet.add(connector.category);
      }
    });
    return Array.from(categorySet).sort();
  }, [connectors]);

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
            <Select
              defaultValue="all"
              value={categoryFilter}
              onValueChange={(value) => setCategoryFilter(value)}
            >
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Filter by connector" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <span>All Connectors</span>
                  </div>
                </SelectItem>
                
                {connectorCategories.map(category => (
                  <SelectItem key={category} value={category}>
                    <div className="flex items-center gap-2">
                      <ConnectorIcon connectorCategory={category} size={16} />
                      <span>{formatConnectorCategory(category)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

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
                  <Button onClick={syncDevices} disabled={isSyncing} size="sm">
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

        {/* Show loading indicator during initial fetch */} 
        {isLoadingInitial && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <span>Loading devices...</span>
          </div>
        )}

        {/* Show "No devices found" only AFTER initial load and if conditions met */} 
        {!isLoadingInitial && tableData.length === 0 && !isSyncing && !error && categoryFilter === 'all' && (
          <p className="text-muted-foreground">
            No devices found in store. Try syncing connectors.
          </p>
        )}

        {/* Show table only AFTER initial load and if there is data */} 
        {!isLoadingInitial && tableData.length > 0 && (
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
                          style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
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