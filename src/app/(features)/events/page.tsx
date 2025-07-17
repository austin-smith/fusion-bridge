'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Activity, ChevronDown, Play, Loader2, ListTree, Maximize, Minimize, Gamepad, Plug, CircleX, Video, X as XIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
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
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from "@/components/ui/skeleton";
import { EventViewToggle } from '@/components/features/events/EventViewToggle';
import { EventsTableView } from '@/components/features/events/EventsTableView';
import type { EnrichedEvent } from '@/types/events';
import { EventCardView } from '@/components/features/events/EventCardView';
import { EventCardViewSkeleton } from '@/components/features/events/event-card-view-skeleton';
import { LocationSpaceSelector } from '@/components/common/LocationSpaceSelector';
import { VideoPlaybackDialog, type VideoPlaybackDialogProps } from '@/components/features/events/video-playback-dialog';
import { PikoVideoPlayer } from '@/components/features/piko/piko-video-player';


// --- Interface for Pagination Metadata from API ---
interface PaginationMetadata {
  itemsPerPage: number;
  currentPage: number;
  hasNextPage: boolean;
}
// --- End Interface ---

// --- ADDED BACK EventTag --- 
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
// --- END ADDED BACK --- 

// Helper component for skeleton table
const EventsTableSkeleton = ({ rowCount = 10, columnCount = 8 }: { rowCount?: number, columnCount?: number }) => {
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

export default function EventsPage() {
  const [events, setEvents] = useState<EnrichedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'timestamp', desc: true }
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });
  const [tablePageCount, setTablePageCount] = useState<number>(0);
  const [locationSpaceSearchTerm, setLocationSpaceSearchTerm] = useState('');
  
  // Video dialog state - centralized for both normal and full screen modes
  const [isVideoPlayerOpen, setIsVideoPlayerOpen] = useState(false);
  const [videoPlayerProps, setVideoPlayerProps] = useState<Omit<VideoPlaybackDialogProps, 'isOpen' | 'onOpenChange'> | null>(null);

  // Unified video handler for both normal and full screen modes
  const handlePlayVideo = useCallback((
    bestShotEvent: EnrichedEvent | undefined,
    spacePikoCamera: DeviceWithConnector | null,
    allDevices: DeviceWithConnector[]
  ) => {
    let targetConnectorId: string | undefined;
    let targetPikoSystemId: string | undefined;
    let targetCameraId: string | undefined;
    let targetPositionMs: number | undefined;
    let targetDeviceName: string | undefined;

    // Use the bestShotEvent if available
    if (bestShotEvent && bestShotEvent.bestShotUrlComponents) {
      targetConnectorId = bestShotEvent.bestShotUrlComponents.connectorId;
      targetPikoSystemId = bestShotEvent.bestShotUrlComponents.pikoSystemId;
      targetCameraId = bestShotEvent.bestShotUrlComponents.cameraId;
      targetPositionMs = bestShotEvent.timestamp - 5000; // Start 5s before event
      targetDeviceName = bestShotEvent.deviceName;
    } else if (spacePikoCamera) {
      // Fallback to space camera for live view if no specific event context
      targetConnectorId = spacePikoCamera.connectorId;
      // Attempt to get pikoSystemId from the allDevices list using the spacePikoCamera's internal ID
      const fullSpaceCameraDetails = allDevices.find(d => d.id === spacePikoCamera.id);
      targetPikoSystemId = fullSpaceCameraDetails?.pikoServerDetails?.systemId;
      targetCameraId = spacePikoCamera.deviceId;
      targetPositionMs = undefined; // Live view
      targetDeviceName = spacePikoCamera.name;
    }

    if (targetConnectorId && targetCameraId) {
      setVideoPlayerProps({
        connectorId: targetConnectorId,
        pikoSystemId: targetPikoSystemId,
        cameraId: targetCameraId,
        positionMs: targetPositionMs,
        title: targetPositionMs ? `Event Playback - ${targetDeviceName || targetCameraId}` : `Live View - ${targetDeviceName || targetCameraId}`,
        deviceName: targetDeviceName || targetCameraId
      });
      setIsVideoPlayerOpen(true);
    } else {
      toast.error("Video playback parameters not found.");
    }
  }, []);
  
  // Use store for view preferences instead of local state
  const viewMode = useFusionStore(state => state.eventsViewMode);
  const cardSize = useFusionStore(state => state.eventsCardSize);
  const setViewMode = useFusionStore(state => state.setEventsViewMode);
  const setCardSize = useFusionStore(state => state.setEventsCardSize);
  const initializeViewPreferences = useFusionStore(state => state.initializeViewPreferences);
  
  // Use store for filter preferences
  const locationFilter = useFusionStore(state => state.eventsLocationFilter);
  const spaceFilter = useFusionStore(state => state.eventsSpaceFilter);
  const connectorCategoryFilter = useFusionStore(state => state.eventsConnectorCategoryFilter);
  const eventCategoryFilter = useFusionStore(state => state.eventsEventCategoryFilter);
  const alarmEventsOnly = useFusionStore(state => state.eventsAlarmEventsOnly);
  const setLocationFilter = useFusionStore(state => state.setEventsLocationFilter);
  const setSpaceFilter = useFusionStore(state => state.setEventsSpaceFilter);
  const setConnectorCategoryFilter = useFusionStore(state => state.setEventsConnectorCategoryFilter);
  const setEventCategoryFilter = useFusionStore(state => state.setEventsEventCategoryFilter);
  const setAlarmEventsOnly = useFusionStore(state => state.setEventsAlarmEventsOnly);
  const initializeFilterPreferences = useFusionStore(state => state.initializeFilterPreferences);
  const resetFiltersToDefaults = useFusionStore(state => state.resetFiltersToDefaults);

  // --- Refs for managing fetch logic ---
  const isInitialLoadRef = useRef(true);
  const prevPageIndexRef = useRef(pagination.pageIndex);
  const prevPageSizeRef = useRef(pagination.pageSize);
  const prevEventCategoryFilterRef = useRef(eventCategoryFilter);
  const prevConnectorCategoryFilterRef = useRef(connectorCategoryFilter);
  const prevLocationFilterRef = useRef(locationFilter);
  const prevSpaceFilterRef = useRef(spaceFilter);
  const prevAlarmEventsOnlyRef = useRef(alarmEventsOnly);

  // Initialize view and filter preferences from localStorage (following app pattern)
  useEffect(() => {
    initializeViewPreferences();
    initializeFilterPreferences();
  }, [initializeViewPreferences, initializeFilterPreferences]);

  const [isCardViewFullScreen, setIsCardViewFullScreen] = useState(false);
  const cardViewContainerRef = useRef<HTMLDivElement>(null);

  const connectors = useFusionStore(state => state.connectors);
  const spaces = useFusionStore(state => state.spaces);
  const allDevices = useFusionStore(state => state.allDevices);
  const locations = useFusionStore(state => state.locations);
  
  // Use store loading states instead of manual loading
  const isLoadingConnectors = useFusionStore(state => state.isLoading);
  const isLoadingSpaces = useFusionStore(state => state.isLoadingSpaces);
  const isLoadingDevices = useFusionStore(state => state.isLoadingAllDevices);
  const isLoadingLocations = useFusionStore(state => state.isLoadingLocations);

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

  // Set page title
  useEffect(() => {
    document.title = 'Events // Fusion';
  }, []);

  // Initial events fetch if needed (for first-time page loads)
  useEffect(() => {
    // Only trigger if we have organization data but no events yet and we're not loading
    if (connectors.length > 0 && events.length === 0 && !loading && !isLoadingConnectors && !isLoadingSpaces && !isLoadingDevices && !isLoadingLocations) {
      // This will trigger the main useEffect above to fetch events
      setLoading(true);
      setTimeout(() => setLoading(false), 100); // Reset loading state to trigger the main effect
    }
      }, [connectors.length, events.length, loading, isLoadingConnectors, isLoadingSpaces, isLoadingDevices, isLoadingLocations]);

  // MODIFIED: fetchEvents signature and URL construction
  const fetchEvents = useCallback(async (
    page: number, 
    pageSize: number, 
    isInitialLoad = false,
    currentEventCategories: string[],
    currentConnectorCategory: string,
    currentLocationFilter: string,
    currentSpaceFilter: string,
    currentAlarmEventsOnly: boolean
  ): Promise<{ pagination: PaginationMetadata | null; actualDataLength: number } | null> => {
    try {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(pageSize));

      if (currentEventCategories.length > 0) {
        params.append('eventCategories', currentEventCategories.join(','));
      }
      if (currentConnectorCategory && currentConnectorCategory.toLowerCase() !== 'all') {
        params.append('connectorCategory', currentConnectorCategory);
      }
      if (currentLocationFilter && currentLocationFilter.toLowerCase() !== 'all') {
        params.append('locationId', currentLocationFilter);
      }
      if (currentSpaceFilter && currentSpaceFilter.toLowerCase() !== 'all') {
        params.append('spaceId', currentSpaceFilter);
      }
      if (currentAlarmEventsOnly) {
        params.append('alarmEventsOnly', 'true');
      }

      const response = await fetch(`/api/events?${params.toString()}`);

      if (!response.ok) {
        let errorMessage = `HTTP error! Status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (jsonError) {
          console.warn('Failed to parse error response body as JSON:', jsonError);
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'API returned success: false');
      }

      setEvents(data.data || []);
      // MODIFIED: Return pagination data instead of setting state
      return { pagination: data.pagination as PaginationMetadata | null, actualDataLength: data.data.length };

    } catch (error) {
      console.error('Error fetching events:', error);
      const displayMessage = error instanceof Error ? error.message : 'An unknown error occurred while fetching events';
      if (isInitialLoad) {
         toast.error(displayMessage);
      }
      return null; // Return null on error
    } finally {
      // setLoading is now handled by the calling useEffects
    }
  }, []); // Dependencies remain empty for fetchEvents itself

  // Function to fetch specific device details
  const fetchDeviceDetails = useCallback(async (deviceId: string) => {
    if (!deviceId) return;
    setIsLoadingDeviceDetail(true);
    setSelectedDeviceForDialog(null); // Clear previous device
    setIsDetailDialogOpen(true); // Open dialog immediately
    try {
      const response = await fetch(`/api/devices?id=${deviceId}`);
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
          internalId: deviceData.id, // Use the internal DB ID
          rawDeviceData: deviceData.rawDeviceData ?? undefined // Include raw device data
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

  // --- REVISED: Initial Load and Polling useEffect ---
  useEffect(() => {
    // Don't fetch events while store is still loading organization data or if no connectors loaded yet
    if (!tableRef.current || isLoadingConnectors || isLoadingSpaces || isLoadingDevices || isLoadingLocations || connectors.length === 0) return;

    setLoading(true);
            fetchEvents(pagination.pageIndex + 1, pagination.pageSize, true, eventCategoryFilter, connectorCategoryFilter, locationFilter, spaceFilter, alarmEventsOnly)
      .then((fetchResult: { pagination: PaginationMetadata | null; actualDataLength: number } | null) => {
        if (fetchResult && fetchResult.pagination) {
          const pMeta = fetchResult.pagination;
          if (tableRef.current) {
            const newPageCount = pMeta.hasNextPage ? pMeta.currentPage + 1 : pMeta.currentPage;
            setTablePageCount(newPageCount);
          }
        } else if (fetchResult && fetchResult.pagination === null) {
          if (tableRef.current) {
            const pageCountForNoMeta = fetchResult.actualDataLength > 0 ? pagination.pageIndex + 1 : Math.max(1, pagination.pageIndex);
            setTablePageCount(pageCountForNoMeta);
          }
        } else {
          // Handle case where fetchEvents returns null
        }
        isInitialLoadRef.current = false;
        prevPageIndexRef.current = pagination.pageIndex;
        prevPageSizeRef.current = pagination.pageSize;
        prevEventCategoryFilterRef.current = eventCategoryFilter;
        prevConnectorCategoryFilterRef.current = connectorCategoryFilter;
        prevLocationFilterRef.current = locationFilter;
        prevSpaceFilterRef.current = spaceFilter;
        prevAlarmEventsOnlyRef.current = alarmEventsOnly;
      })
      .finally(() => {
        setLoading(false); 
      });

    const intervalId = setInterval(() => {
      if (!tableRef.current || isLoadingConnectors || isLoadingSpaces || isLoadingDevices || isLoadingLocations || connectors.length === 0) return;
      fetchEvents(pagination.pageIndex + 1, pagination.pageSize, false, eventCategoryFilter, connectorCategoryFilter, locationFilter, spaceFilter, alarmEventsOnly)
        .then((fetchResult: { pagination: PaginationMetadata | null; actualDataLength: number } | null) => {
          if (fetchResult && fetchResult.pagination) {
            const pMeta = fetchResult.pagination;
            if (tableRef.current) {
              const newPageCount = pMeta.hasNextPage ? pMeta.currentPage + 1 : pMeta.currentPage;
              setTablePageCount(newPageCount);
            }
          } else if (fetchResult && fetchResult.pagination === null) {
            if (tableRef.current) {
              const pageCountForNoMeta = fetchResult.actualDataLength > 0 ? pagination.pageIndex + 1 : Math.max(1, pagination.pageIndex);
              setTablePageCount(pageCountForNoMeta);
            }
          } 
        });
    }, 5000);

    return () => {
      clearInterval(intervalId);
      isInitialLoadRef.current = true;
    };
  }, [fetchEvents, pagination.pageIndex, pagination.pageSize, eventCategoryFilter, connectorCategoryFilter, locationFilter, spaceFilter, alarmEventsOnly, isLoadingConnectors, isLoadingSpaces, isLoadingDevices, isLoadingLocations, connectors.length]);
  // --- END REVISED ---

  // --- REVISED: useEffect for actual pagination OR filter changes by the user ---
  useEffect(() => {
    // Don't execute while store is loading or if no connectors loaded yet
    if (!tableRef.current || isLoadingConnectors || isLoadingSpaces || isLoadingDevices || isLoadingLocations || connectors.length === 0) return; 
    if (isInitialLoadRef.current) {
      return; 
    }

    const pageIndexChanged = pagination.pageIndex !== prevPageIndexRef.current;
    const pageSizeChanged = pagination.pageSize !== prevPageSizeRef.current;
    const eventCategoriesChanged = JSON.stringify(eventCategoryFilter) !== JSON.stringify(prevEventCategoryFilterRef.current);
    const connectorCategoryChanged = connectorCategoryFilter !== prevConnectorCategoryFilterRef.current;
    const locationFilterChanged = locationFilter !== prevLocationFilterRef.current;
    const spaceFilterChanged = spaceFilter !== prevSpaceFilterRef.current;
    const alarmFilterChanged = alarmEventsOnly !== prevAlarmEventsOnlyRef.current;

    if (eventCategoriesChanged || connectorCategoryChanged || locationFilterChanged || spaceFilterChanged || alarmFilterChanged) {
      prevEventCategoryFilterRef.current = eventCategoryFilter;
      prevConnectorCategoryFilterRef.current = connectorCategoryFilter;
      prevLocationFilterRef.current = locationFilter;
      prevSpaceFilterRef.current = spaceFilter;
      prevAlarmEventsOnlyRef.current = alarmEventsOnly;
      if (pagination.pageIndex !== 0) {
        tableRef.current.setPageIndex(0);
        return;
      }
    }

    if (pageIndexChanged || pageSizeChanged || ((eventCategoriesChanged || connectorCategoryChanged || locationFilterChanged || spaceFilterChanged || alarmFilterChanged) && pagination.pageIndex === 0)) {
      setLoading(true); 
      
      fetchEvents(pagination.pageIndex + 1, pagination.pageSize, false, eventCategoryFilter, connectorCategoryFilter, locationFilter, spaceFilter, alarmEventsOnly)
        .then((fetchResult: { pagination: PaginationMetadata | null; actualDataLength: number } | null) => {
          if (fetchResult && fetchResult.pagination) {
            const pMeta = fetchResult.pagination;
            if (tableRef.current) {
              const newPageCount = pMeta.hasNextPage ? pMeta.currentPage + 1 : pMeta.currentPage;
              setTablePageCount(newPageCount);
            }
          } else if (fetchResult && fetchResult.pagination === null) {
            if (tableRef.current) {
              const pageCountForNoMeta = fetchResult.actualDataLength > 0 ? pagination.pageIndex + 1 : Math.max(1, pagination.pageIndex);
              setTablePageCount(pageCountForNoMeta);
            }
          } else {
            // Handle case where fetchEvents returns null
          }
          prevPageIndexRef.current = pagination.pageIndex;
          prevPageSizeRef.current = pagination.pageSize;
          prevEventCategoryFilterRef.current = eventCategoryFilter;
          prevConnectorCategoryFilterRef.current = connectorCategoryFilter;
          prevLocationFilterRef.current = locationFilter;
          prevSpaceFilterRef.current = spaceFilter;
          prevAlarmEventsOnlyRef.current = alarmEventsOnly;
        })
        .finally(() => {
          setLoading(false); 
        });
    }
  }, [pagination.pageIndex, pagination.pageSize, fetchEvents, eventCategoryFilter, connectorCategoryFilter, locationFilter, spaceFilter, alarmEventsOnly, isLoadingConnectors, isLoadingSpaces, isLoadingDevices, isLoadingLocations, connectors.length]);
  // --- END REVISED ---

  const toggleCardViewFullScreen = () => { // Simpler toggle, actual API calls in useEffect
    if (!document.fullscreenElement) {
      // Intention is to enter fullscreen: set state, useEffect will handle API call
      setIsCardViewFullScreen(true); 
    } else {
      // Intention is to exit fullscreen: call API, event listener will update state
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.error("Error exiting fullscreen:", err));
      }
    }
  };

  // Effect to handle entering fullscreen AFTER the container is rendered
  useEffect(() => {
    if (isCardViewFullScreen && cardViewContainerRef.current && !document.fullscreenElement) {
      cardViewContainerRef.current.requestFullscreen()
        .catch(err => {
          console.error("Error attempting to enable full-screen mode:", err);
          toast.error("Could not enter full-screen mode. Browser might have denied the request.");
          setIsCardViewFullScreen(false); // Revert state if request failed
        });
    }
  }, [isCardViewFullScreen]); // Run when isCardViewFullScreen changes

  // Effect to listen for browser fullscreen changes (e.g., Esc key)
  useEffect(() => {
    const handleFullscreenChange = () => {
      // Update events page fullscreen state when user exits fullscreen
      if (isCardViewFullScreen && !document.fullscreenElement) {
        setIsCardViewFullScreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isCardViewFullScreen]);

  // Define columns for TanStack Table
  const columns = useMemo<ColumnDef<EnrichedEvent>[]>(() => [
    {
      accessorKey: 'connectorName',
      id: 'connectorName',
      header: "Connector",
      enableSorting: true,
      enableColumnFilter: true,
      filterFn: (row, columnId, filterValue) => {
        const name = row.original.connectorName || 'System';
        const filterText = String(filterValue || '').toLowerCase();
        if (!filterText) {
          return true;
        }
        return name.toLowerCase().includes(filterText);
      },
      cell: ({ row }) => {
        const connectorName = row.original.connectorName;
        const connectorCategory = row.original.connectorCategory;
        const fullText = connectorName || 'System';

        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                  <ConnectorIcon connectorCategory={connectorCategory} size={12} />
                  <span className="block max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap text-xs">
                    {fullText}
                  </span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>{fullText}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      accessorKey: 'connectorCategory',
      id: 'connectorCategoryGlobalFilter',
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

        // Render as button only if deviceInternalId exists and it's *not* a NetBox event 
        // (since the name is composite and doesn't map to a single device record for the dialog)
        if (event.deviceInternalId && event.connectorCategory !== 'netbox') {
          return (
            <Button
              variant="link"
              className="p-0 h-auto text-left whitespace-normal text-foreground"
              onClick={() => fetchDeviceDetails(event.deviceInternalId!)}
            >
              {displayValue}
            </Button>
          );
        }
        // Otherwise, just render the text (covers NetBox events and events without deviceInternalId)
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
      enableColumnFilter: false,
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
        
        // Special case for Smart Fob button events - simple inline
        if (eventType === EventType.BUTTON_PRESSED || eventType === EventType.BUTTON_LONG_PRESSED) {
          const buttonNumber = row.original.payload?.buttonNumber;
          const buttonText = `Button ${buttonNumber || '?'}${eventType === EventType.BUTTON_LONG_PRESSED ? ' (Long)' : ''}`;
          
          return (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="font-normal inline-flex items-center gap-1">
                    <Gamepad className="h-3 w-3" />
                    <span>{buttonText}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{buttonText}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }
        
        // Regular event type handling
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
                <Badge variant="outline" className="font-normal">
                  <span className="block max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
                    {typeDisplayName}
                    {subtypeDisplayName && (
                      <span className="text-muted-foreground ml-1">/ {subtypeDisplayName}</span>
                    )}
                  </span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
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
                <div className="max-w-32 whitespace-nowrap overflow-hidden text-ellipsis cursor-default">
                  <Badge variant="outline" className="inline-flex items-center gap-1 px-2 py-0.5">
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
        const eventData = {
          ...row.original,
          connectorCategory: row.original.connectorCategory || 'system',
        } as EnrichedEvent; 

        eventData.thumbnailUrl = '/placeholder-thumbnail.jpg';
        eventData.videoUrl = '/placeholder-video.mp4';

        return (
          <div className="flex items-center gap-1">
            <Dialog>
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="icon" className="h-6 w-6 flex-shrink-0">
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
                
                <div className="aspect-video bg-muted rounded-md flex items-center justify-center mb-2 mt-4">
                  <p className="text-muted-foreground">Video Player for {eventData.videoUrl} goes here</p>
                </div>
                
                <div className="mb-2">
                  <Select disabled>
                    <SelectTrigger className="w-full bg-muted/40">
                      <SelectValue placeholder="Select Camera..." />
                    </SelectTrigger>
                  </Select>
                </div>
                
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
            <EventDetailDialogContent
              event={{
                ...eventData,
                bestShotUrlComponents: eventData.bestShotUrlComponents ? {
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
    initialState: {
      columnVisibility: {
        'connectorCategoryGlobalFilter': false, // Keep this column hidden
      }
    },
    state: {
      sorting,
      columnFilters,
      expanded,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onExpandedChange: setExpanded,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableMultiSort: true,
    getRowId: (originalRow) => originalRow.eventUuid,
    manualPagination: true,
    manualFiltering: false,
    pageCount: tablePageCount,
  });

  // --- ADDED: Ref to hold table instance for effects ---
  const tableRef = useRef(table);
  useEffect(() => {
    tableRef.current = table;
  }, [table]);
  // --- END ADDED ---

  const displayedEvents = useMemo(() => {
    return events;
  }, [events]);
  // --- END MODIFIED ---

  // Define page actions
  const pageActions = (
    <>
      <EventViewToggle viewMode={viewMode} onViewModeChange={setViewMode} cardSize={cardSize} onCardSizeChange={setCardSize} />
      {viewMode === 'card' && (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" onClick={toggleCardViewFullScreen}>
                {isCardViewFullScreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                <span className="sr-only">{isCardViewFullScreen ? 'Exit Full Screen' : 'Full Screen'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
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
          <Button variant="outline" className="w-full sm:w-[120px] h-9 justify-between">
            <div className="flex items-center gap-2 flex-1">
              {connectorCategoryFilter === 'all' ? (
                <Plug className="h-4 w-4" />
              ) : (
                <ConnectorIcon connectorCategory={connectorCategoryFilter} size={16} />
              )}
              <span>
                {connectorCategoryFilter === 'all' 
                  ? 'All' 
                  : formatConnectorCategory(connectorCategoryFilter)}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuLabel>Connector Type</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setConnectorCategoryFilter('all')}>
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4" />
              All
            </div>
          </DropdownMenuItem>
          {connectorCategories.map(category => (
            <DropdownMenuItem 
              key={category} 
              onClick={() => setConnectorCategoryFilter(category)}
            >
              <div className="flex items-center gap-2">
                <ConnectorIcon connectorCategory={category} size={16} />
                <span>{formatConnectorCategory(category)}</span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full sm:w-[150px] h-9 justify-between">
            <span>
              Categories ({eventCategoryFilter.length === Object.keys(EVENT_CATEGORY_DISPLAY_MAP).length
                ? 'All' 
                : eventCategoryFilter.length})
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuLabel>Event Filters</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={alarmEventsOnly}
            onCheckedChange={setAlarmEventsOnly}
            onSelect={(e) => e.preventDefault()}
          >
            Alarm events only
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Event Categories</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {Object.entries(EVENT_CATEGORY_DISPLAY_MAP).map(([categoryKey, displayName]) => (
            <DropdownMenuCheckboxItem
              key={categoryKey}
              checked={eventCategoryFilter.includes(categoryKey)}
              onCheckedChange={(checked) => {
                const newCategories = checked 
                  ? [...eventCategoryFilter, categoryKey] 
                  : eventCategoryFilter.filter(item => item !== categoryKey);
                setEventCategoryFilter(newCategories);
              }}
              onSelect={(e) => e.preventDefault()}
            >
              {displayName}
            </DropdownMenuCheckboxItem>
          ))}
                </DropdownMenuContent>
      </DropdownMenu>
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" onClick={resetFiltersToDefaults}>
              <CircleX className="h-4 w-4" />
              <span className="sr-only">Reset filters to defaults</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Reset filters to defaults</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Dialog open={isHierarchyDialogOpen} onOpenChange={setIsHierarchyDialogOpen}>
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
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
    </>
  );

  if (isCardViewFullScreen && viewMode === 'card') {
    return (
      <div ref={cardViewContainerRef} className="fixed inset-0 bg-background z-50 h-screen w-screen overflow-hidden">
        <div className="absolute top-0 left-0 right-0 p-2 flex justify-end bg-background/80 backdrop-blur-sm z-10">
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                 <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleCardViewFullScreen}>
                  <Minimize className="h-5 w-5" />
                  <span className="sr-only">Exit Full Screen</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Exit Full Screen (or press Esc)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="pt-12 h-full">
            <EventCardView events={displayedEvents} spaces={spaces} allDevices={allDevices} cardSize={cardSize} onPlayVideo={handlePlayVideo} />
        </div>
        
        {/* Video Playback Modal - custom modal for fullscreen mode (no portaling) */}
        {videoPlayerProps && isVideoPlayerOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background rounded-lg shadow-xl max-w-[80vw] max-h-[90vh] w-full mx-4 flex flex-col">
              <div className="p-4 pb-2 flex flex-row items-center justify-between space-y-0 flex-shrink-0 border-b">
                <div className="flex items-center gap-2">
                  <Video className="h-5 w-5 text-muted-foreground"/>
                  <h2 className="text-lg font-medium">{videoPlayerProps.title}</h2>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsVideoPlayerOpen(false)}>
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>
              {videoPlayerProps.deviceName && (
                <p className="px-4 pt-6 text-xs text-muted-foreground mb-2">
                  Camera: {videoPlayerProps.deviceName}
                </p>
              )}
              <div className="relative flex-grow w-full min-h-0 p-4">
                                 <PikoVideoPlayer 
                   connectorId={videoPlayerProps.connectorId || ''}
                   pikoSystemId={videoPlayerProps.pikoSystemId || undefined}
                   cameraId={videoPlayerProps.cameraId || ''}
                   positionMs={videoPlayerProps.positionMs || undefined}
                   className="w-full h-full"
                   disableFullscreen={true}
                 />
              </div>
              <div className="p-4 border-t flex justify-end">
                <Button type="button" variant="secondary" onClick={() => setIsVideoPlayerOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Default page rendering (when not in full-screen card view)
  return (
    <div className="flex flex-col h-full p-4 md:p-6">
      <TooltipProvider>
        <PageHeader 
          title="Events"
          description="View incoming events from connected devices."
          icon={<Activity className="h-6 w-6" />}
          actions={pageActions}
        />



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

        <div className="flex-shrink-0">
           {loading ? (
            viewMode === 'card' 
              ? <EventCardViewSkeleton segmentCount={2} cardsPerSegment={4} cardSize={cardSize} />
              : <EventsTableSkeleton rowCount={15} columnCount={columns.length} />
          ) : null}
        </div>

        {!loading && displayedEvents.length === 0 ? (
          <p className="text-muted-foreground">
            No events match your current filters or no events have been received yet.
          </p>
        ) : null}

        {!loading && displayedEvents.length > 0 ? (
          <div className="border rounded-md flex-grow overflow-hidden flex flex-col">
            {viewMode === 'table' ? (
              <EventsTableView table={table} columns={columns} />
            ) : viewMode === 'card' ? (
              <EventCardView events={displayedEvents} spaces={spaces} allDevices={allDevices} cardSize={cardSize} onPlayVideo={handlePlayVideo} /> 
            ) : null}
          </div>
        ) : null}
      </TooltipProvider>

      {/* Video Playback Dialog - rendered at page level for normal mode only */}
      {!isCardViewFullScreen && videoPlayerProps && (
        <VideoPlaybackDialog 
          isOpen={isVideoPlayerOpen} 
          onOpenChange={setIsVideoPlayerOpen} 
          {...videoPlayerProps}
          disableFullscreen={false}
        />
      )}
    </div>
  );
}