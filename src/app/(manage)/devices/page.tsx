'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';
import { RefreshCwIcon, ArrowUpDown, ArrowUp, ArrowDown, Cpu, X, EyeIcon, Loader2, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, Network, PowerIcon, PowerOffIcon, HelpCircle, MoreHorizontal, InfoIcon } from 'lucide-react';
import { DeviceWithConnector, ConnectorWithConfig, PikoServer } from '@/types';
import { getDeviceTypeIcon, getDisplayStateIcon } from "@/lib/mappings/presentation";
import { 
  type DisplayState,
  type TypedDeviceInfo,
  ActionableState,
  DeviceType,
  ON,
  OFF
} from '@/lib/mappings/definitions';
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
import type { DeviceDetailProps } from "@/components/features/devices/device-detail-dialog-content";
import { getDeviceTypeInfo } from "@/lib/mappings/identification";
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

// Define the shape of data expected by the table, combining store data
interface DisplayedDevice extends Omit<DeviceWithConnector, 'status' | 'type' | 'pikoServerDetails' | 'id'> { // Also omit original id
  internalId: string; // Internal database ID (devices.id)
  displayState?: DisplayState; // Keep for potential future use
  lastSeen?: Date; 
  deviceTypeInfo: TypedDeviceInfo; // Ensure this is included and required
  // Explicitly add back required fields omitted by Omit or needed for compatibility
  type: string; // Add back raw device type string
  // Add server details explicitly
  pikoServerDetails?: PikoServer; // <-- Add the field here
  // status: string | null; // Keep status omitted as it's replaced by displayState
  createdAt: Date;
  updatedAt: Date;
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

// Helper component for skeleton table
const DevicesTableSkeleton = ({ rowCount = 10, columnCount = 6 }: { rowCount?: number, columnCount?: number }) => {
  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            {[...Array(columnCount)].map((_, i) => (
              <TableHead key={i} className="px-2 py-1">
                <Skeleton className="h-5 w-20 mb-2" />
                <Skeleton className="h-8 w-full" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...Array(rowCount)].map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {[...Array(columnCount)].map((_, colIndex) => (
                <TableCell key={colIndex} className="px-2 py-2">
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between p-2 border-t">
        <Skeleton className="h-5 w-24" />
        <div className="flex items-center space-x-6 lg:space-x-8">
          <div className="flex items-center space-x-2">
             <Skeleton className="h-5 w-20" />
             <Skeleton className="h-8 w-[70px]" />
          </div>
           <Skeleton className="h-5 w-24" />
           <div className="flex items-center space-x-2">
             <Skeleton className="h-8 w-8" />
             <Skeleton className="h-8 w-8" />
             <Skeleton className="h-8 w-8" />
             <Skeleton className="h-8 w-8" />
           </div>
        </div>
      </div>
    </div>
  );
};

export default function DevicesPage() {
  // Fetch data from Zustand store - use connectors
  const deviceStates = useFusionStore(state => state.deviceStates);
  const { setDeviceStatesFromSync, executeDeviceAction, deviceActionLoading } = useFusionStore(state => ({
    setDeviceStatesFromSync: state.setDeviceStatesFromSync,
    executeDeviceAction: state.executeDeviceAction,
    deviceActionLoading: state.deviceActionLoading,
  }));
  // Use connectors state variable
  const connectors = useFusionStore(state => state.connectors as ConnectorWithConfig<any>[]); 
  // Fetch allDevices from the store
  const allDevices = useFusionStore(state => state.allDevices);
  
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
  
  // --- BEGIN Dialog State ---
  const [selectedDevice, setSelectedDevice] = useState<DeviceDetailProps | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  // --- END Dialog State ---

  // Set page title
  useEffect(() => { document.title = 'Devices // Fusion'; }, []);

  // --- Initial Data Fetch --- 
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoadingInitial(true);
      setError(null);
      try {
        console.log('[DevicesPage] Fetching initial data (Connectors & Devices)...');
        const [connectorsResponse, devicesResponse] = await Promise.all([
          fetch('/api/connectors'), 
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
        console.log('[DevicesPage] Initial GET /api/devices RAW response data:', devicesData);
        if (!devicesResponse.ok || !devicesData.success) {
          throw new Error(devicesData.error || 'Failed to fetch initial devices');
        }

        if (devicesData.data && Array.isArray(devicesData.data)) {
          console.log(`[DevicesPage] Calling setDeviceStatesFromSync with ${devicesData.data.length} devices.`);
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

  // Combine store data into the format the table expects
  const tableData = useMemo((): DisplayedDevice[] => {
    console.log(`[DevicesPage] Recalculating tableData. deviceStates size: ${deviceStates.size}, allDevices length: ${allDevices.length}`);
    const connectorsMap = new Map(connectors.map(c => [c.id, c])); 
    const allDevicesMap = new Map(allDevices.map(d => [d.deviceId, d])); 

    const mappedData = Array.from(deviceStates.values()).reduce((acc: DisplayedDevice[], state) => {
        const connector = connectorsMap.get(state.connectorId);
        const fullDevice = allDevicesMap.get(state.deviceId); 
        
        if (!fullDevice) {
            console.warn(`[DevicesPage] tableData: Full device not found in allDevicesMap for deviceId: ${state.deviceId}`);
        }

        if (fullDevice && fullDevice.createdAt && fullDevice.updatedAt) {
            const serverName = state.serverName; 
            const serverId = state.serverId;     
            const pikoServerDetails = state.pikoServerDetails; 
            const deviceName = state.name ?? 'Unknown Device'; 
            const model = state.model ?? 'N/A';       
            const vendor = state.vendor ?? 'N/A';      
            const url = state.url ?? 'N/A';          
            const rawDeviceType = state.rawType ?? state.deviceInfo?.type ?? 'Unknown'; 

            const displayDevice: DisplayedDevice = {
                internalId: fullDevice.id, // Use the internal ID from the full device record
                deviceId: state.deviceId,
                connectorId: state.connectorId,
                name: deviceName, 
                connectorName: connector?.name ?? 'Unknown', // Ensure string
                connectorCategory: connector?.category ?? 'unknown',
                deviceTypeInfo: state.deviceInfo, 
                displayState: state.displayState, 
                lastSeen: state.lastSeen,
                associationCount: fullDevice.associationCount ?? 0, // Use device association count
                type: rawDeviceType, 
                url: url,
                model: model,
                vendor: vendor,
                serverName: serverName,
                serverId: serverId,
                pikoServerDetails: pikoServerDetails,
                createdAt: new Date(fullDevice.createdAt),
                updatedAt: new Date(fullDevice.updatedAt), 
            };
            acc.push(displayDevice);
        } else {
            if (fullDevice) {
                 console.warn(`[DevicesPage] Skipping device state due to missing dates: ${state.connectorId}:${state.deviceId}`);
            }
        }
        return acc;
    }, []); 

    console.log('[DevicesPage] Finished calculating tableData. Result length:', mappedData.length);
    return mappedData;
  }, [deviceStates, connectors, allDevices]);

  // Filter devices based on the category toggle
  const filteredTableData = useMemo<DisplayedDevice[]>(() => {
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
        accessorKey: 'connectorName', // Keep Connector column first
        header: "Connector",
        enableSorting: true,
        enableColumnFilter: true,
        filterFn: (row, columnId, value) => {
          const name = row.getValue(columnId) as string;
          return name.toLowerCase().includes(String(value).toLowerCase());
        },
        cell: ({ row }) => {
          const connectorName = row.original.connectorName;
          const connectorCategory = row.original.connectorCategory;
          return (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                    <ConnectorIcon connectorCategory={connectorCategory} size={12} /> 
                    <span className="text-xs max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">{connectorName}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {connectorName}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        accessorKey: 'name', // Device Name column second
        header: "Device Name",
        enableSorting: true,
        enableColumnFilter: true,
        cell: ({ row }) => (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="font-medium max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
                  {row.getValue('name')}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {row.getValue('name')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ),
      },
      // --- Device Type Column (Moved to third) --- //
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
          const typeInfo = row.original.deviceTypeInfo; 
          const IconComponent = getDeviceTypeIcon(typeInfo.type);
          
          return (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                    <IconComponent className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">{typeInfo.type}</span>
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
      // --- State Column (Now fourth) --- //
      {
        id: 'state',
        accessorKey: 'displayState', 
        header: "State",
        enableSorting: true,
        cell: ({ row }) => {
          const state = row.original.displayState;
          const lastSeen = row.original.lastSeen;
          const StateIcon = getDisplayStateIcon(state); 

          return (
             <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                      <div className="max-w-32 whitespace-nowrap overflow-hidden text-ellipsis cursor-default">
                          {state ? (
                            <Badge variant="outline" className="inline-flex items-center gap-1 px-2 py-0.5 font-normal">
                              {React.createElement(StateIcon, { className: "h-3 w-3 flex-shrink-0" })}
                              <span className="text-xs">{state}</span>
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Unknown</span>
                          )}
                      </div>
                  </TooltipTrigger>
                  <TooltipContent>
                      <p>State: {state || 'Unknown'}</p>
                      <p>Last seen: {lastSeen ? new Date(lastSeen).toLocaleString() : 'Never'}</p>
                  </TooltipContent>
                </Tooltip>
            </TooltipProvider>
          );
        }
      },
      // --- Associated Column (remains after Device Type) --- //
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
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <Button variant={count > 0 ? "secondary" : "outline"} size="sm" className="h-5 min-w-[1.5rem] px-1.5 text-xs font-medium">{count}</Button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{device.connectorCategory === 'yolink' ? `${count} associated Piko cameras` : `${count} associated YoLink devices`}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
      // --- Actions Column (remains last) --- //
      {
        id: 'actions',
        header: "Actions",
        cell: ({ row }) => {
          const device = row.original; 
          // --- BEGIN Action Button Logic ---
          const isActionable = 
            device.connectorCategory === 'yolink' && 
            (device.deviceTypeInfo.type === DeviceType.Switch || device.deviceTypeInfo.type === DeviceType.Outlet);
          
          // Read loading state from the store
          const isLoading = deviceActionLoading.get(device.internalId) ?? false;
          // --- BEGIN Revert State Check ---
          // Revert to checking displayState, acknowledging it's not yet populated correctly
          const isOn = device.displayState === ON; 
          const isOff = device.displayState === OFF;
          // --- END Revert State Check ---

          const dialogProps: DeviceDetailProps = {
            ...device,
            internalId: device.internalId, // Explicitly ensure internalId is correct
            url: device.url ?? undefined, 
            model: device.model ?? undefined, 
            vendor: device.vendor ?? undefined, 
            serverName: device.serverName ?? undefined,
            serverId: device.serverId ?? undefined,
            connectorName: device.connectorName ?? 'Unknown', 
            deviceTypeInfo: device.deviceTypeInfo ?? getDeviceTypeInfo('unknown', 'unknown'),
            createdAt: device.createdAt, // Assuming these exist on DisplayedDevice
            updatedAt: device.updatedAt, // Assuming these exist on DisplayedDevice
          };
          
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0" disabled={isLoading}>
                  <span className="sr-only">Open menu</span>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />} 
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedDevice(dialogProps);
                    setIsDetailDialogOpen(true);
                  }}
                >
                  <InfoIcon className="h-4 w-4" />
                  View Details
                </DropdownMenuItem>
                
                {isActionable && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        executeDeviceAction(
                          device.internalId, 
                          isOn ? ActionableState.SET_OFF : ActionableState.SET_ON
                        );
                      }}
                      disabled={isLoading} // Disable while action is processing
                    >
                      {/* Conditionally show icon based on state */}
                      {isOn ? (
                        <PowerOffIcon className="h-4 w-4 text-red-600" /> 
                      ) : (
                        <PowerIcon className="h-4 w-4 text-green-600" />
                      )}
                      {isOn ? 'Turn Off' : 'Turn On'}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // Update dependencies for columns useMemo
    [fetchAssociatedDevices, loadingAssociatedDevices, associatedDevices, activeDeviceId, deviceActionLoading, executeDeviceAction]
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

  // Define the actions separately for clarity
  const pageActions = (
    <>
      <Select
        defaultValue="all"
        value={categoryFilter}
        onValueChange={(value) => setCategoryFilter(value)}
      >
        <SelectTrigger className="sm:w-[180px] h-9"> 
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
              <span>{isSyncing ? 'Syncing...' : 'Sync'}</span> {/* Added margin */} 
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Sync devices</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );

  return (
    <div className="flex flex-col h-full p-4 md:p-6"> 
      <TooltipProvider> {/* Keep TooltipProvider wrapping potentially the whole page if needed */}
        {/* Use the new PageHeader component */}
        <PageHeader 
          title="Devices" 
          description="Manage and view connected devices."
          icon={<Cpu className="h-6 w-6" />}
          actions={pageActions}
        />

        <div className="flex-shrink-0">
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-md">
              <p>Error: {error}</p>
            </div>
          )}
        </div>

        {/* Show Skeleton Loader OR Content */}
        {isLoadingInitial && !error ? ( // Only show skeleton if loading AND no error
          <DevicesTableSkeleton rowCount={15} columnCount={columns.length} />
        ) : (
          <> 
            {/* Show "No devices found" only AFTER load and if conditions met */} 
            {tableData.length === 0 && !isSyncing && !error && categoryFilter === 'all' && (
              <p className="text-muted-foreground text-center py-10">
                No devices found in store. Try syncing connectors.
              </p>
            )}

            {/* Show table only AFTER load and if there is data */} 
            {tableData.length > 0 && (
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
                                  <TooltipProvider delayDuration={100}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="block max-w-[100px] overflow-hidden text-ellipsis whitespace-nowrap">
                                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {typeof header.column.columnDef.header === 'string' 
                                          ? header.column.columnDef.header 
                                          : header.column.id}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
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
          </>
        )}
      </TooltipProvider> {/* Closing TooltipProvider */}

      {/* --- BEGIN Single Dialog Instance --- */} 
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent 
          className="sm:max-w-[600px]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Render content only when a device is selected */}
          {selectedDevice && (
            <DeviceDetailDialogContent device={selectedDevice} />
          )}
        </DialogContent>
      </Dialog>
      {/* --- END Single Dialog Instance --- */} 
    </div>
  );
} 