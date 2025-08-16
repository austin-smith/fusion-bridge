"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  RefreshCwIcon,
  Cpu,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  Network,
  ChevronDown,
  Plug,
  Building,
  Box,
} from "lucide-react";
import type {
  DeviceWithConnector,
  ConnectorWithConfig,
  PikoServer,
} from "@/types";
import {
  getDeviceTypeIcon,
  getDisplayStateIcon,
  getBatteryIcon,
  getBatteryColorClass,
} from "@/lib/mappings/presentation";
import {
  type DisplayState,
  type TypedDeviceInfo,
} from "@/lib/mappings/definitions";
import { useFusionStore } from "@/stores/store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
//
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
} from "@tanstack/react-table";
import { DeviceDetailDialogContent } from "@/components/features/devices/device-detail-dialog-content";
import { DeviceMappingDialogContent } from "@/components/features/devices/device-mapping-dialog-content";
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatConnectorCategory } from "@/lib/utils";
import { usePersistedTableState } from "@/hooks/use-persisted-table-state";
import { ColumnSettingsMenu } from "@/components/common/table/ColumnSettingsMenu";
import { HeaderCell } from "@/components/common/table/HeaderCell";
import type { DeviceDetailProps } from "@/components/features/devices/device-detail-dialog-content";
import { getDeviceTypeInfo } from "@/lib/mappings/identification";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { LocationSpaceSelector } from "@/components/common/LocationSpaceSelector";
import { ExportButton } from "@/components/common/ExportButton";
import { QuickDeviceActions } from "@/components/features/devices/QuickDeviceActions";

// Define the shape of data expected by the table, combining store data
interface DisplayedDevice
  extends Omit<
    DeviceWithConnector,
    "status" | "type" | "pikoServerDetails" | "id"
  > {
  internalId: string; 
  displayState?: DisplayState;
  lastSeen?: Date;
  deviceTypeInfo: TypedDeviceInfo;
  type: string;
  pikoServerDetails?: PikoServer;
  batteryPercentage?: number | null;
  createdAt: Date;
  updatedAt: Date;
  spaceId?: string | null;
  spaceName?: string | null;
}

// Helper component for skeleton table
const DevicesTableSkeleton = ({
  rowCount = 10,
  columnCount = 6,
}: {
  rowCount?: number;
  columnCount?: number;
}) => {
  return (
    <div className="border rounded-md">
      <Table className="min-w-max">
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
  const deviceStates = useFusionStore((state) => state.deviceStates);
  // Use connectors state variable
  const connectors = useFusionStore(
    (state) => state.connectors as ConnectorWithConfig<any>[]
  );
  // Fetch allDevices from the store
  const allDevices = useFusionStore((state) => state.allDevices);
  // Use store loading state
  const isLoadingAllDevices = useFusionStore(
    (state) => state.isLoadingAllDevices
  );
  const allDevicesHasInitiallyLoaded = useFusionStore(
    (state) => state.allDevicesHasInitiallyLoaded
  );

  // Fetch locations and spaces from store
  const locations = useFusionStore((state) => state.locations);
  const spaces = useFusionStore((state) => state.spaces);

  // const [devices, setDevices] = useState<DeviceWithConnector[]>([]); // Remove local state
  const [error, setError] = useState<string | null>(null); // Keep local error for sync/fetch errors
  const [sorting, setSorting] = useState<SortingState>([
    /* Default sort */
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [spaceFilter, setSpaceFilter] = useState<string>("all");
  const [locationSpaceSearchTerm, setLocationSpaceSearchTerm] = useState("");

  const [isSyncing, setIsSyncing] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });

  const [selectedDevice, setSelectedDevice] =
    useState<DeviceDetailProps | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  // Set page title
  useEffect(() => {
    document.title = "Devices // Fusion";
  }, []);

  // Initial data fetch if needed (for first-time page loads)
  useEffect(() => {
    // Only fetch if we haven't initially loaded yet and we're not currently loading
    if (!allDevicesHasInitiallyLoaded && !isLoadingAllDevices) {
      // Let the store handle fetching through organization context
      useFusionStore.getState().fetchAllDevices();
    }
  }, [allDevicesHasInitiallyLoaded, isLoadingAllDevices]);

  // The store handles initial data fetching via organization switching
  // No need for manual API calls here

  // Combine store data into the format the table expects
  const tableData = useMemo((): DisplayedDevice[] => {
    const connectorsMap = new Map(connectors.map((c) => [c.id, c]));
    const allDevicesMap = new Map(allDevices.map((d) => [d.deviceId, d]));

    // Use deviceStates as the primary source (for real-time updates)
    // but supplement with allDevices for full device information
    const mappedData = Array.from(deviceStates.values()).reduce(
      (acc: DisplayedDevice[], state) => {
        const connector = connectorsMap.get(state.connectorId);
        const fullDevice = allDevicesMap.get(state.deviceId);

        if (!fullDevice) {
          console.warn(
            `[DevicesPage] tableData: Full device not found in allDevicesMap for deviceId: ${state.deviceId}`
          );
        }

        if (fullDevice && fullDevice.createdAt && fullDevice.updatedAt) {
          const serverName = state.serverName;
          const serverId = state.serverId;
          const pikoServerDetails = state.pikoServerDetails;
          const deviceName = state.name ?? "Unknown Device";
          const model = state.model ?? "N/A";
          const vendor = state.vendor ?? "N/A";
          const url = state.url ?? "N/A";
          const rawDeviceType =
            state.rawType ?? state.deviceInfo?.type ?? "Unknown";

          const displayDevice: DisplayedDevice = {
            internalId: fullDevice.id,
            deviceId: state.deviceId,
            connectorId: state.connectorId,
            name: deviceName,
            connectorName: connector?.name ?? "Unknown",
            connectorCategory: connector?.category ?? "unknown",
            deviceTypeInfo: state.deviceInfo,
            displayState: state.displayState, // Use from deviceStates for real-time updates
            lastSeen: state.lastSeen, // Use from deviceStates
            type: rawDeviceType,
            url: url,
            model: model,
            vendor: vendor,
            serverName: serverName,
            serverId: serverId,
            pikoServerDetails: pikoServerDetails,
            batteryPercentage: fullDevice.batteryPercentage ?? undefined, // Get from fullDevice instead of state
            createdAt: new Date(fullDevice.createdAt),
            updatedAt: new Date(fullDevice.updatedAt),
            spaceId: fullDevice.spaceId ?? undefined, // Get from fullDevice
            spaceName: fullDevice.spaceName ?? undefined, // Get from fullDevice
            locationId: fullDevice.locationId ?? undefined,
            locationName: fullDevice.locationName ?? undefined,
            rawDeviceData: fullDevice.rawDeviceData ?? undefined, // Get from fullDevice
          };
          acc.push(displayDevice);
        } else {
          if (fullDevice) {
            console.warn(
              `[DevicesPage] Skipping device state due to missing dates: ${state.connectorId}:${state.deviceId}`
            );
          }
        }
        return acc;
      },
      []
    );

    return mappedData;
  }, [deviceStates, connectors, allDevices]); // Restore deviceStates dependency

  // Filter devices based on the category, location, and space filters
  const filteredTableData = useMemo<DisplayedDevice[]>(() => {
    let filtered = tableData;

    if (categoryFilter !== "all") {
      filtered = filtered.filter(
        (device) => device.connectorCategory?.toLowerCase() === categoryFilter
      );
    }

    if (spaceFilter !== "all") {
      filtered = filtered.filter((device) => device.spaceId === spaceFilter);
    } else if (locationFilter !== "all") {
      // If no specific space is selected but location is, filter by location
      const locationSpaces = spaces.filter(
        (space) => space.locationId === locationFilter
      );
      const locationSpaceIds = locationSpaces.map((space) => space.id);
      filtered = filtered.filter(
        (device) => device.spaceId && locationSpaceIds.includes(device.spaceId)
      );
    }

    return filtered;
  }, [tableData, categoryFilter, locationFilter, spaceFilter, spaces]);

  // --- Keep syncDevices but update messaging ---
  const syncDevices = useCallback(async () => {
    setIsSyncing(true);
    setError(null);
    const loadingToastId = toast.loading("Triggering device sync...");
    try {
      const response = await fetch("/api/devices", { method: "POST" });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to trigger sync");
      }

      // --- BEGIN Store Update ---
      if (data.data && Array.isArray(data.data)) {
        useFusionStore
          .getState()
          .setDeviceStatesFromSync(data.data as DeviceWithConnector[]);
        toast.success(
          `Sync complete. Updated view with ${data.data.length} devices.`
        );
      } else {
        console.warn(
          "[DevicesPage] Sync API succeeded but returned no device data."
        );
        toast.success(`Sync complete. No devices found or returned.`);
      }
      // --- END Store Update ---

      toast.dismiss(loadingToastId);
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

  // Define columns for TanStack Table
  const columns = useMemo<ColumnDef<DisplayedDevice>[]>(
    () => [
      {
        id: "connectorName",
        accessorKey: "connectorName",
        header: "Connector",
        minSize: 120,
        size: 180,
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
                  <Badge
                    variant="secondary"
                    className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal"
                  >
                    <ConnectorIcon
                      connectorCategory={connectorCategory}
                      size={12}
                    />
                    <span className="text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                      {connectorName}
                    </span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{connectorName}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        id: "name",
        accessorKey: "name",
        header: "Device Name",
        minSize: 180,
        size: 260,
        enableSorting: true,
        enableColumnFilter: true,
        cell: ({ row }) => {
          const device = row.original;
          const dialogProps: DeviceDetailProps = {
            ...device,
            internalId: device.internalId,
            url: device.url ?? undefined,
            model: device.model ?? undefined,
            vendor: device.vendor ?? undefined,
            serverName: device.serverName ?? undefined,
            serverId: device.serverId ?? undefined,
            connectorName: device.connectorName ?? "Unknown",
            deviceTypeInfo:
              device.deviceTypeInfo ?? getDeviceTypeInfo("unknown", "unknown"),
            createdAt: device.createdAt,
            updatedAt: device.updatedAt,
            spaceId: device.spaceId ?? undefined,
            spaceName: device.spaceName ?? undefined,
            rawDeviceData: device.rawDeviceData ?? undefined,
          };

          return (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="underline underline-offset-2 overflow-hidden text-ellipsis whitespace-nowrap text-left"
                    onClick={() => {
                      setSelectedDevice(dialogProps);
                      setIsDetailDialogOpen(true);
                    }}
                  >
                    {row.getValue("name")}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {row.getValue("name")} (click to view details)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      // --- Device Type Column (Moved to third) --- //
      {
        id: "deviceTypeInfo",
        accessorKey: "deviceTypeInfo",
        header: "Device Type",
        minSize: 160,
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
                  <Badge
                    variant="secondary"
                    className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal"
                  >
                    <IconComponent className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                      {typeInfo.type}
                      {typeInfo.subtype && (
                        <span className="text-muted-foreground ml-1">
                          / {typeInfo.subtype}
                        </span>
                      )}
                    </span>
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
        id: "locationName",
        accessorKey: "locationName",
        header: "Location",
        minSize: 140,
        enableSorting: true,
        enableColumnFilter: true,
        filterFn: (row, columnId, value) => {
          const name = String(row.getValue(columnId) || "");
          return name.toLowerCase().includes(String(value).toLowerCase());
        },
        cell: ({ row }) => {
          const name = row.getValue<string>("locationName");
          return name ? (
            <Badge
              variant="outline"
              className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal"
            >
              <Building className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                {name}
              </span>
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        id: "spaceName",
        accessorKey: "spaceName",
        header: "Space",
        minSize: 140,
        enableSorting: true,
        enableColumnFilter: true,
        filterFn: (row, columnId, value) => {
          const name = String(row.getValue(columnId) || "");
          return name.toLowerCase().includes(String(value).toLowerCase());
        },
        cell: ({ row }) => {
          const name = row.getValue<string>("spaceName");
          return name ? (
            <Badge
              variant="outline"
              className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal"
            >
              <Box className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                {name}
              </span>
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        id: "state",
        accessorKey: "displayState",
        header: "State",
        minSize: 140,
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
                      <Badge
                        variant="outline"
                        className="inline-flex items-center gap-1 px-2 py-0.5 font-normal"
                      >
                        {React.createElement(StateIcon, {
                          className: "h-3 w-3 shrink-0",
                        })}
                        <span className="text-xs">{state}</span>
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Unknown
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>State: {state || "Unknown"}</p>
                  <p>
                    Last seen:{" "}
                    {lastSeen ? new Date(lastSeen).toLocaleString() : "Never"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        id: "batteryPercentage",
        accessorKey: "batteryPercentage",
        header: "Battery",
        minSize: 100,
        enableSorting: true,
        enableColumnFilter: false,
        cell: ({ row }) => {
          const battery = row.getValue<number | null>("batteryPercentage");
          if (battery === null || battery === undefined) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }

          const BatteryIcon = getBatteryIcon(battery);
          const colorClass = getBatteryColorClass(battery);

          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center cursor-default leading-none">
                  <BatteryIcon className={`h-4 w-4 ${colorClass}`} />
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="center"
                sideOffset={5}
                alignOffset={0}
                avoidCollisions={false}
              >
                <p>{battery}%</p>
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "model",
        accessorKey: "model",
        header: "Model",
        minSize: 140,
        enableSorting: true,
        enableColumnFilter: true,
        filterFn: (row, columnId, value) => {
          const model = String(row.getValue(columnId) || "");
          return model.toLowerCase().includes(String(value).toLowerCase());
        },
        cell: ({ row }) => {
          const model = row.getValue<string>("model");
          return model && model !== "N/A" ? (
            <span className="text-xs font-mono">{model}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        enableResizing: false,
        enableHiding: false,
        size: 140,
        cell: ({ row }) => {
          const device = row.original;
          return (
            <QuickDeviceActions
              internalDeviceId={device.internalId}
              connectorCategory={device.connectorCategory}
              deviceType={device.deviceTypeInfo.type}
              displayState={device.displayState}
              showSecondary
              secondaryVariant="menu"
              useSplitButton
            />
          );
        },
      },
    ],
    []
  );

  // Derive default order from columns to avoid brittle string arrays
  const defaultColumnOrder = useMemo<string[]>(() => {
    const ids = columns
      .map((c) =>
        "id" in c && typeof (c as any).id === "string"
          ? (c as any).id
          : String((c as any).accessorKey)
      )
      .filter(Boolean) as string[];
    return Array.from(new Set(ids));
  }, [columns]);

  // Persisted table state: order, visibility, sizing
  const {
    columnOrder,
    setColumnOrder,
    columnVisibility,
    columnSizing,
    columnSizingInfo,
    onColumnOrderChange,
    onColumnVisibilityChange,
    onColumnSizingChange,
    onColumnSizingInfoChange,
  } = usePersistedTableState({
    storageKey: "devicesTable",
    initialColumnOrder: defaultColumnOrder,
    defaultVisibility: {
      batteryPercentage: false,
      model: false,
    },
    lockedColumnIds: ["actions"],
    versionSuffix: "v1",
  });

  // Initialize the table with TanStack
  const table = useReactTable({
    data: filteredTableData, // Use derived data from store
    columns,
    defaultColumn: { size: 200, minSize: 100, maxSize: 600 },
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: {
      sorting,
      columnFilters, // Only text filters managed here
      pagination,
      columnSizing,
      columnSizingInfo,
      columnOrder,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters, // Manages text filters
    onPaginationChange: setPagination as OnChangeFn<PaginationState>,
    onColumnSizingChange: onColumnSizingChange,
    onColumnSizingInfoChange: onColumnSizingInfoChange,
    onColumnOrderChange: onColumnOrderChange,
    onColumnVisibilityChange: onColumnVisibilityChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableMultiSort: true,
  });

  // removed local DnD and menu item; using ColumnSettingsMenu component

  // Simple header cell component
  // removed local HeaderCell; using shared HeaderCell component

  // Extract unique connector categories from connectors state
  const connectorCategories = useMemo(() => {
    const categorySet = new Set<string>();
    connectors.forEach((connector) => {
      if (connector.category) {
        categorySet.add(connector.category);
      }
    });
    return Array.from(categorySet).sort();
  }, [connectors]);

  // Create filter parameters for export (include column text filters to match table)
  const exportFilterParams = useMemo(() => {
    const params = new URLSearchParams();

    // Map dropdown filters
    if (categoryFilter && categoryFilter !== "all") {
      params.set("connectorCategory", categoryFilter);
    }
    if (locationFilter && locationFilter !== "all") {
      params.set("locationId", locationFilter);
    }
    if (spaceFilter && spaceFilter !== "all") {
      params.set("spaceId", spaceFilter);
    }

    // Map column text filters to API-compatible params
    const getFilterValue = (id: string): string => {
      const col = columnFilters.find((f) => f.id === id);
      return typeof col?.value === "string" ? col.value.trim() : "";
    };

    const deviceName = getFilterValue("name");
    if (deviceName) params.set("deviceName", deviceName);

    // Device Type column uses id 'deviceTypeInfo' (we send as 'deviceType')
    const deviceType = getFilterValue("deviceTypeInfo");
    if (deviceType) params.set("deviceType", deviceType);

    const connectorName = getFilterValue("connectorName");
    if (connectorName) params.set("connectorName", connectorName);

    return params;
  }, [categoryFilter, locationFilter, spaceFilter, columnFilters]);

  // Define the actions separately for clarity
  const pageActions = (
    <>
      <ExportButton
        currentData={filteredTableData as any}
        filterParams={exportFilterParams}
        dataTypeName="devices"
        disabled={filteredTableData.length === 0}
      />

      <LocationSpaceSelector
        locationFilter={locationFilter}
        spaceFilter={spaceFilter}
        searchTerm={locationSpaceSearchTerm}
        locations={locations}
        spaces={spaces}
        onLocationChange={setLocationFilter}
        onSpaceChange={setSpaceFilter}
        onSearchChange={setLocationSpaceSearchTerm}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full sm:w-[120px] h-9 justify-between"
          >
            <div className="flex items-center gap-2 flex-1">
              {categoryFilter === "all" ? (
                <Plug className="h-4 w-4" />
              ) : (
                <ConnectorIcon connectorCategory={categoryFilter} size={16} />
              )}
              <span>
                {categoryFilter === "all"
                  ? "All"
                  : formatConnectorCategory(categoryFilter)}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuItem onClick={() => setCategoryFilter("all")}>
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4" />
              All
            </div>
          </DropdownMenuItem>
          {connectorCategories.map((category) => (
            <DropdownMenuItem
              key={category}
              onClick={() => setCategoryFilter(category)}
            >
              <div className="flex items-center gap-2">
                <ConnectorIcon connectorCategory={category} size={16} />
                <span>{formatConnectorCategory(category)}</span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ColumnSettingsMenu table={table} />

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
              <RefreshCwIcon
                className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
              />
              <span>{isSyncing ? "Syncing..." : "Sync"}</span>{" "}
              {/* Added margin */}
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
      <TooltipProvider>
        {" "}
        {/* Keep TooltipProvider wrapping potentially the whole page if needed */}
        {/* Use the new PageHeader component */}
        <PageHeader
          title="Devices"
          description="Manage and view connected devices."
          icon={<Cpu className="h-6 w-6" />}
          actions={pageActions}
        />
        <div className="shrink-0">
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-md">
              <p>Error: {error}</p>
            </div>
          )}
        </div>
        {/* Show Skeleton Loader OR Content */}
        {isLoadingAllDevices || !allDevicesHasInitiallyLoaded ? (
          <DevicesTableSkeleton rowCount={15} columnCount={columns.length} />
        ) : (
          <>
            {/* Show "No devices found" only AFTER initial load and if conditions met */}
            {tableData.length === 0 &&
              !isSyncing &&
              !error &&
              categoryFilter === "all" &&
              allDevicesHasInitiallyLoaded && (
                <p className="text-muted-foreground text-center py-10">
                  No devices found in store. Try syncing connectors.
                </p>
              )}

            {/* Show table only AFTER load and if there is data */}
            {tableData.length > 0 && (
              <div className="border rounded-md grow overflow-hidden flex flex-col">
                <div className="grow overflow-auto">
                  <Table className="min-w-max">
                    <TableHeader className="sticky top-0 bg-background z-10">
                      {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <HeaderCell key={header.id} header={header} />
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody>
                      {table.getRowModel().rows?.length ? (
                        table.getRowModel().rows.map((row) => (
                          <TableRow
                            key={row.id}
                            data-state={
                              row.getIsSelected() ? "selected" : undefined
                            }
                          >
                            {row.getVisibleCells().map((cell) => (
                              <TableCell
                                key={cell.id}
                                className="px-2 py-1"
                                style={{ width: cell.column.getSize() }}
                              >
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext()
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={columns.length}
                            className="h-24 text-center"
                          >
                            No results.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between p-2 border-t shrink-0">
                  <div className="flex-1 text-sm text-muted-foreground">
                    Total Rows: {table.getFilteredRowModel().rows.length}
                  </div>
                  <div className="flex items-center space-x-6 lg:space-x-8">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium">Rows per page</p>
                      <Select
                        value={`${table.getState().pagination.pageSize}`}
                        onValueChange={(value) => {
                          table.setPageSize(Number(value));
                        }}
                      >
                        <SelectTrigger className="h-8 w-[70px]">
                          <SelectValue
                            placeholder={table.getState().pagination.pageSize}
                          />
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
                        onClick={() =>
                          table.setPageIndex(table.getPageCount() - 1)
                        }
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
      </TooltipProvider>{" "}
      {/* Closing TooltipProvider */}
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
