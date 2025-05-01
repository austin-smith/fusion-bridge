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
import { ArrowUpDown, ArrowUp, ArrowDown, X, Activity, Layers, List, ChevronDown, ChevronRight, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, Play, Loader2, ListTree } from 'lucide-react';
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
import { getDeviceTypeIcon, getDisplayStateIcon } from '@/lib/mappings/presentation';
import { 
  TypedDeviceInfo, 
  DisplayState, 
  EventType, 
  EventCategory, 
  EventSubtype,
  EVENT_TYPE_DISPLAY_MAP, 
  EVENT_CATEGORY_DISPLAY_MAP, 
  EVENT_SUBTYPE_DISPLAY_MAP
} from '@/lib/mappings/definitions';
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
import { formatConnectorCategory } from "@/lib/utils";
import { toast } from 'sonner';
import { DeviceDetailDialogContent } from '@/components/features/devices/device-detail-dialog-content';
import { type DeviceDetailProps } from '@/components/features/devices/device-detail-dialog-content';
import { DeviceWithConnector, ConnectorWithConfig } from '@/types';
import { useFusionStore } from '@/stores/store';
import { EventHierarchyViewer } from '@/components/features/events/EventHierarchyViewer';
import { getDeviceTypeInfo } from "@/lib/mappings/identification";

// Update the event interface
interface EnrichedEvent {
  id: number; // Added ID from API response
  eventUuid: string; // Added from API response
  timestamp: number; // ADD this (epoch ms)
  payload?: Record<string, unknown> | null; // Use the payload from API
  rawPayload?: Record<string, any> | null; // Add rawPayload from API
  deviceId: string;
  deviceName?: string;
  connectorName?: string;
  deviceTypeInfo: TypedDeviceInfo;
  connectorCategory: string;
  connectorId: string; // Added from API response
  eventCategory: string; // Added from API response
  eventType: string; // Added from API response
  eventSubtype?: EventSubtype; // <-- Add optional subtype field
  rawEventType?: string; // Add optional rawEventType from API
  displayState?: DisplayState | undefined;
  thumbnailUrl?: string; // KEEP For single video placeholder FOR NOW
  videoUrl?: string; // KEEP For single video placeholder FOR NOW
  bestShotUrlComponents?: {
    pikoSystemId: string;
    connectorId: string;
    objectTrackId: string;
    cameraId: string;
  };
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
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'timestamp', desc: true }
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
  const connectors = useFusionStore(state => state.connectors); // Get connectors from store
  const setConnectors = useFusionStore(state => state.setConnectors); // Get setter from store
  
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

  // State for device detail dialog
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedDeviceForDialog, setSelectedDeviceForDialog] = useState<DeviceDetailProps | null>(null);
  const [isLoadingDeviceDetail, setIsLoadingDeviceDetail] = useState(false);

  // State for hierarchy dialog
  const [isHierarchyDialogOpen, setIsHierarchyDialogOpen] = useState(false);

  // Add useEffect to fetch connectors if not present
  useEffect(() => {
    const fetchConnectorsIfNeeded = async () => {
      if (connectors.length === 0) {
        console.log('[EventsPage] Connectors store is empty, fetching...');
        try {
          const response = await fetch('/api/connectors');
          const data = await response.json();
          if (!response.ok || !data.success) {
            console.error('[EventsPage] Failed to fetch initial connectors:', data.error || 'Unknown error');
            setConnectors([]); // Ensure store is set to empty array on failure
          } else if (data.data && Array.isArray(data.data)) {
            setConnectors(data.data as ConnectorWithConfig<any>[]); // Use setConnectors from store
            console.log('[EventsPage] Initial connectors loaded into store.');
          } else {
            setConnectors([]); // Set empty if data is missing or not an array
          }
        } catch (err) {
          console.error('[EventsPage] Error fetching initial connectors:', err);
          setConnectors([]); // Ensure store is reset on fetch error
        }
      }
    };

    fetchConnectorsIfNeeded();
  }, [connectors.length, setConnectors]); // Rerun if connectors array length changes or setConnectors changes

  // Set page title
  useEffect(() => {
    document.title = 'Events // Fusion';
  }, []);

  // Function to fetch events
  const fetchEvents = useCallback(async (isInitialLoad = false) => {
    try {
      const response = await fetch('/api/events');

      if (!response.ok) {
        let errorMessage = `HTTP error! Status: ${response.status}`;
        try {
          // Try to get a more specific error message from the API response body
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (jsonError) {
          // Ignore JSON parsing error if the body isn't valid JSON
          console.warn('Failed to parse error response body as JSON:', jsonError);
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (!data.success) {
        // Handle cases where the API returns success: false even with a 200 status
        throw new Error(data.error || 'API returned success: false');
      }

      setEvents(data.data || []);

    } catch (error) {
      console.error('Error fetching events:', error);
      // Display a user-friendly message based on the error type
      const displayMessage = error instanceof Error ? error.message : 'An unknown error occurred while fetching events';
      // Only toast on initial load failure or if specifically needed, avoid spamming toasts on interval failures
      if (isInitialLoad) {
         toast.error(displayMessage);
      } else {
         console.warn(`Background fetch failed: ${displayMessage}`); // Log subsequent errors quietly
      }
    } finally {
      // Only set loading to false on the initial load attempt
      // Subsequent background fetches shouldn't affect the loading state
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, []);

  // Function to fetch specific device details
  const fetchDeviceDetails = useCallback(async (deviceId: string) => {
    if (!deviceId) return;
    setIsLoadingDeviceDetail(true);
    setSelectedDeviceForDialog(null); // Clear previous device
    setIsDetailDialogOpen(true); // Open dialog immediately
    try {
      const response = await fetch(`/api/devices?deviceId=${deviceId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch device details');
      }
      const result = await response.json();
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to parse device details');
      }

      // API should now return the single device object directly when queried by ID
      const deviceData = result.data as DeviceWithConnector; // Cast for type safety
      if (deviceData) {
        // Construct the object expected by the dialog, including the composite 'id'
        const deviceForDialog: DeviceDetailProps = {
          ...deviceData,
          // Ensure required string props have fallbacks/correct types
          connectorName: deviceData.connectorName ?? 'Unknown',
          // Ensure potentially nullable string props are string | undefined
          url: deviceData.url ?? undefined,
          model: deviceData.model ?? undefined,
          vendor: deviceData.vendor ?? undefined,
          serverName: deviceData.serverName ?? undefined,
          serverId: deviceData.serverId ?? undefined,
          // Ensure required object props have fallbacks
          deviceTypeInfo: deviceData.deviceTypeInfo ?? getDeviceTypeInfo('unknown', 'unknown'),
          id: `${deviceData.connectorId}:${deviceData.deviceId}` // Construct the required ID
        };
        setSelectedDeviceForDialog(deviceForDialog);
      } else {
        // Handle case where data might be unexpectedly null/undefined even with success: true
        console.error('API returned success but no device data for ID:', deviceId);
        throw new Error(`Device data not found for ID ${deviceId}.`);
      }
      
    } catch (error: unknown) {
      console.error('Error fetching device details:', error);
      // Type check before accessing message property
      const errorMessage = error instanceof Error ? error.message : 'Could not load device details.';
      toast.error(errorMessage);
      setIsDetailDialogOpen(false); // Close dialog on error
    } finally {
      setIsLoadingDeviceDetail(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchEvents(true);

    const intervalId = setInterval(() => {
      fetchEvents(false);
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
        const fullText = connectorName || 'System'; // Text for the tooltip

        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                  <ConnectorIcon connectorCategory={connectorCategory} size={12} />
                  {/* Span handles truncation */}
                  <span className="block max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap text-xs">
                    {fullText}
                  </span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {/* Show full text in tooltip */}
                <p>{fullText}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      accessorKey: 'deviceName',
      header: "Device Name",
      enableSorting: true,
      enableColumnFilter: true,
      cell: ({ row }) => {
        const event = row.original; // Easier reference
        let displayValue = event.deviceName || event.deviceId || 'Unknown Device'; // Default

        // Check if it's a NetBox event and if payload has portal/reader names
        if (event.connectorCategory === 'netbox' && event.payload) {
            const portalName = event.payload.portalName as string | undefined;
            const readerName = event.payload.readerName as string | undefined;
            
            if (portalName && readerName) {
                displayValue = `${portalName} / ${readerName}`;
            } else if (portalName) {
                displayValue = portalName;
            } else if (readerName) {
                displayValue = readerName;
            } 
            // If neither portalName nor readerName exists in payload, 
            // default displayValue (Nodeunique/Nodename) will be used.
        }

        // Render as button only if deviceId exists and it's *not* a NetBox event 
        // (since the name is composite and doesn't map to a single device record for the dialog)
        if (event.deviceId && event.connectorCategory !== 'netbox') {
          return (
            <Button
              variant="link"
              className="p-0 h-auto text-left whitespace-normal text-foreground"
              onClick={() => fetchDeviceDetails(event.deviceId)}
            >
              {displayValue}
            </Button>
          );
        }
        // Otherwise, just render the text (covers NetBox events and events without deviceId)
        return <span>{displayValue}</span>;
      },
    },
    {
      accessorKey: 'deviceTypeInfo.type',
      header: "Device Type",
      enableSorting: true,
      enableColumnFilter: true,
      cell: ({ row }) => {
        const typeInfo = row.original.deviceTypeInfo;
        if (!typeInfo?.type) {
          return <span className="text-muted-foreground">Unknown</span>; 
        }
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
        const typeString = String(row.original.deviceTypeInfo?.type || '').toLowerCase();
        return typeString.includes(String(value).toLowerCase());
      },
    },
    {
      accessorKey: 'eventCategory',
      header: "Event Category",
      enableSorting: true,
      enableColumnFilter: true,
      cell: ({ row }) => (
        <Badge variant="outline">
          {EVENT_CATEGORY_DISPLAY_MAP[row.original.eventCategory as EventCategory] || row.original.eventCategory}
        </Badge>
      ),
    },
    {
      accessorKey: 'eventType',
      header: "Event Type",
      enableSorting: true,
      enableColumnFilter: true,
      cell: ({ row }) => {
        const eventType = row.original.eventType as EventType;
        const eventSubtype = row.original.eventSubtype;
        const typeDisplayName = EVENT_TYPE_DISPLAY_MAP[eventType] || eventType;
        const subtypeDisplayName = eventSubtype ? (EVENT_SUBTYPE_DISPLAY_MAP[eventSubtype] ?? eventSubtype) : null;

        // Combine type and subtype for display
        const fullText = subtypeDisplayName 
          ? `${typeDisplayName} / ${subtypeDisplayName}` 
          : typeDisplayName;

        // Tooltip + Truncation approach
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Badge acts as the trigger, but content inside is truncated */}
                <Badge variant="outline" className="font-normal">
                  {/* Span inside the badge handles truncation */}
                  <span className="block max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
                    {typeDisplayName}
                    {subtypeDisplayName && (
                      <span className="text-muted-foreground ml-1">/ {subtypeDisplayName}</span>
                    )}
                  </span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {/* Show full text in tooltip */}
                <p>{fullText}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
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
      accessorKey: 'timestamp',
      header: "Time",
      enableSorting: true,
      enableColumnFilter: true,
      cell: ({ row }: { row: Row<EnrichedEvent> }) => {
        const timeValue = row.getValue<number>('timestamp');
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
        const tooltipTime = format(eventTime, 'PPpp');
        
        if (isToday) {
          displayTime = format(eventTime, 'h:mm a');
        } else if (isThisWeek) {
          displayTime = format(eventTime, 'EEE h:mm a');
        } else {
          displayTime = format(eventTime, 'MMM d, yyyy');
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
                <div className="grid grid-cols-[1fr_auto] gap-x-4 items-start mb-4">
                  <div className="flex flex-wrap gap-1.5">
                    <div className="w-full px-0.5 mb-0.5">
                      <span className="text-md font-medium">{eventData.deviceName || eventData.deviceId}</span>
                    </div>
                    
                    <EventTag 
                      icon={<ConnectorIcon connectorCategory={eventData.connectorCategory} size={12} />}
                      label={eventData.connectorName || formatConnectorCategory(eventData.connectorCategory)}
                    />
                    
                    {eventData.deviceTypeInfo?.type && (
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
                    )}
                    
                    {eventData.displayState && (
                      <EventTag 
                        icon={React.createElement(getDisplayStateIcon(eventData.displayState), { className: "h-3 w-3" })}
                        label={eventData.displayState}
                      />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    Event occurred {formatDistanceToNow(new Date(eventData.timestamp), { addSuffix: true })}
                    <span className="block mt-0.5 opacity-80">
                      {format(new Date(eventData.timestamp), 'PPpp')}
                    </span>
                  </div>
                </div>

                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">Close</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {/* --- End Single Unconditional Video Dialog --- */}

            {/* Existing Details Button */}
            <EventDetailDialogContent
              event={{
                ...eventData,
                bestShotUrlComponents: eventData.bestShotUrlComponents ? {
                  // Determine 'type' based on pikoSystemId presence
                  type: eventData.bestShotUrlComponents.pikoSystemId ? 'cloud' : 'local',
                  pikoSystemId: eventData.bestShotUrlComponents.pikoSystemId,
                  connectorId: eventData.bestShotUrlComponents.connectorId,
                  objectTrackId: eventData.bestShotUrlComponents.objectTrackId,
                  cameraId: eventData.bestShotUrlComponents.cameraId,
                } : undefined,
              }}
            />
          </div>
        );
      },
    },
  ], [fetchDeviceDetails]);

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
    getRowId: (originalRow) => originalRow.eventUuid,
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
    // Add flex container for overall page layout
    <div className="flex flex-col h-full p-4 md:p-6">
      <TooltipProvider>
        {/* Header Section - Make it non-shrinkable */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-shrink-0">
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
            <Dialog open={isHierarchyDialogOpen} onOpenChange={setIsHierarchyDialogOpen}>
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8">
                        <ListTree className="h-4 w-4" />
                        <span className="sr-only">View Event Hierarchy</span>
                      </Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View Event Hierarchy</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Event Hierarchy</DialogTitle>
                  <DialogDescription>
                    Defined event categories, types, and subtypes.
                  </DialogDescription>
                </DialogHeader>
                <EventHierarchyViewer />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Device Detail Dialog */}
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogTitle className="sr-only">Device Details</DialogTitle>
            <DialogDescription className="sr-only">
              Detailed information about the selected device.
            </DialogDescription>
            {isLoadingDeviceDetail ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading device details...
              </div>
            ) : selectedDeviceForDialog ? (
              <DeviceDetailDialogContent device={selectedDeviceForDialog} />
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                Could not load device details.
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Conditional Messages - Make non-shrinkable */}
        <div className="flex-shrink-0 mb-4">
          {loading && events.length === 0 ? (
            <p className="text-muted-foreground">Loading initial events...</p>
          ) : !loading && events.length === 0 ? (
            <p className="text-muted-foreground">
              No events have been received yet. This page will update periodically.
            </p>
          ) : null}
        </div>

        {/* Table Container - Conditionally render, make it grow and handle overflow */}
        {!loading && events.length > 0 && (
          <div className="border rounded-md flex-grow overflow-hidden flex flex-col">
            {/* Inner container for scrollable table */}
            <div className="flex-grow overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        // Get the full header text (or use accessorKey as fallback)
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
                                      {/* Truncated header text */}
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
                                  {/* Full header text in tooltip */}
                                  <p>{headerText}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            
                            {/* Filter input remains below */}
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
                        );
                      })}
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
            {/* Pagination - Keep at bottom, non-shrinkable */}
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