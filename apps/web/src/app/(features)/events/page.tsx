'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
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
import { ArrowUpDown, ArrowUp, ArrowDown, X, Activity, Layers, List, ChevronDown, ChevronRight, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, Play, Loader2, ListTree, Maximize, Minimize, Gamepad } from 'lucide-react';
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
  const [connectorCategoryFilter, setConnectorCategoryFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const initialEventCategories = Object.keys(EVENT_CATEGORY_DISPLAY_MAP).filter(
    categoryKey => categoryKey !== EventCategory.DIAGNOSTICS
  );
  const [eventCategoryFilter, setEventCategoryFilter] = useState<string[]>(initialEventCategories);
  
  // State for view mode with localStorage persistence
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table'); // Default to table view, consistent with server

  // --- ADDED: Refs for managing fetch logic ---
  const isInitialLoadRef = useRef(true);
  const prevPageIndexRef = useRef(pagination.pageIndex);
  const prevPageSizeRef = useRef(pagination.pageSize);
  // --- ADDED: Refs for previous filter states ---
  const prevEventCategoryFilterRef = useRef(eventCategoryFilter);
  const prevConnectorCategoryFilterRef = useRef(connectorCategoryFilter);
  const prevLocationFilterRef = useRef(locationFilter);
  // --- END ADDED ---

  // Effect to load and set viewMode from localStorage after initial render
  useEffect(() => {
    const storedPreference = localStorage.getItem('eventsViewModePreference');
    if (storedPreference === 'table' || storedPreference === 'card') {
      setViewMode(storedPreference);
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  const [isCardViewFullScreen, setIsCardViewFullScreen] = useState(false);
  const cardViewContainerRef = useRef<HTMLDivElement>(null);

  const connectors = useFusionStore(state => state.connectors);
  const areas = useFusionStore(state => state.areas);
  const allDevices = useFusionStore(state => state.allDevices);
  const locations = useFusionStore(state => state.locations);
  
  // Use store loading states instead of manual loading
  const isLoadingConnectors = useFusionStore(state => state.isLoading);
  const isLoadingAreas = useFusionStore(state => state.isLoadingAreas);
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
    if (connectors.length > 0 && events.length === 0 && !loading && !isLoadingConnectors && !isLoadingAreas && !isLoadingDevices && !isLoadingLocations) {
      console.log('[EventsPage] Triggering initial events fetch');
      // This will trigger the main useEffect above to fetch events
      setLoading(true);
      setTimeout(() => setLoading(false), 100); // Reset loading state to trigger the main effect
    }
  }, [connectors.length, events.length, loading, isLoadingConnectors, isLoadingAreas, isLoadingDevices, isLoadingLocations]);

  // MODIFIED: fetchEvents signature and URL construction
  const fetchEvents = useCallback(async (
    page: number, 
    pageSize: number, 
    isInitialLoad = false,
    currentEventCategories: string[],
    currentConnectorCategory: string,
    currentLocationFilter: string
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
      if (currentLocationFilter && currentLocationFilter.toLowerCase() !== 'all') {
        params.append('locationId', currentLocationFilter);
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
      } else {
         console.warn(`Background fetch failed: ${displayMessage}`);
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
          internalId: deviceData.id // Use the internal DB ID
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
    if (!tableRef.current || isLoadingConnectors || isLoadingAreas || isLoadingDevices || isLoadingLocations || connectors.length === 0) return;

    setLoading(true);
    console.log('[EventsPage] Initial/Polling useEffect: Fetching initial data.');
            fetchEvents(pagination.pageIndex + 1, pagination.pageSize, true, eventCategoryFilter, connectorCategoryFilter, locationFilter)
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
          console.warn('[EventsPage] Initial fetch: fetchEvents returned null.');
        }
        isInitialLoadRef.current = false;
        prevPageIndexRef.current = pagination.pageIndex;
        prevPageSizeRef.current = pagination.pageSize;
        prevEventCategoryFilterRef.current = eventCategoryFilter;
        prevConnectorCategoryFilterRef.current = connectorCategoryFilter;
      })
      .finally(() => {
        setLoading(false); 
      });

    const intervalId = setInterval(() => {
      if (!tableRef.current || isLoadingConnectors || isLoadingAreas || isLoadingDevices || isLoadingLocations || connectors.length === 0) return;
      console.log('[EventsPage] Polling useEffect: Polling for data.');
      fetchEvents(pagination.pageIndex + 1, pagination.pageSize, false, eventCategoryFilter, connectorCategoryFilter, locationFilter)
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
  }, [fetchEvents, pagination.pageIndex, pagination.pageSize, eventCategoryFilter, connectorCategoryFilter, locationFilter, isLoadingConnectors, isLoadingAreas, isLoadingDevices, isLoadingLocations, connectors.length]);
  // --- END REVISED ---

  // --- REVISED: useEffect for actual pagination OR filter changes by the user ---
  useEffect(() => {
    // Don't execute while store is loading or if no connectors loaded yet
    if (!tableRef.current || isLoadingConnectors || isLoadingAreas || isLoadingDevices || isLoadingLocations || connectors.length === 0) return; 
    if (isInitialLoadRef.current) {
      return; 
    }

    const pageIndexChanged = pagination.pageIndex !== prevPageIndexRef.current;
    const pageSizeChanged = pagination.pageSize !== prevPageSizeRef.current;
    const eventCategoriesChanged = JSON.stringify(eventCategoryFilter) !== JSON.stringify(prevEventCategoryFilterRef.current);
    const connectorCategoryChanged = connectorCategoryFilter !== prevConnectorCategoryFilterRef.current;
    const locationFilterChanged = locationFilter !== prevLocationFilterRef.current;

    if (eventCategoriesChanged || connectorCategoryChanged || locationFilterChanged) {
      console.log('[EventsPage] Filter change detected.');
      prevEventCategoryFilterRef.current = eventCategoryFilter;
      prevConnectorCategoryFilterRef.current = connectorCategoryFilter;
      prevLocationFilterRef.current = locationFilter;
      if (pagination.pageIndex !== 0) {
        console.log('[EventsPage] Resetting to page 0 due to filter change.');
        tableRef.current.setPageIndex(0);
        return;
      }
    }

    if (pageIndexChanged || pageSizeChanged || ((eventCategoriesChanged || connectorCategoryChanged || locationFilterChanged) && pagination.pageIndex === 0)) {
      setLoading(true); 
      console.log('[EventsPage] Pagination/Filter useEffect: Change requiring fetch. Fetching data.', 
                  { pageIndex: pagination.pageIndex, pageSize: pagination.pageSize, eventCategories: eventCategoryFilter, connectorCategory: connectorCategoryFilter });
      
      fetchEvents(pagination.pageIndex + 1, pagination.pageSize, false, eventCategoryFilter, connectorCategoryFilter, locationFilter)
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
            console.warn('[EventsPage] Pagination/Filter fetch: fetchEvents returned null.');
          }
          prevPageIndexRef.current = pagination.pageIndex;
          prevPageSizeRef.current = pagination.pageSize;
          prevEventCategoryFilterRef.current = eventCategoryFilter;
          prevConnectorCategoryFilterRef.current = connectorCategoryFilter;
          prevLocationFilterRef.current = locationFilter;
        })
        .finally(() => {
          setLoading(false); 
        });
    }
  }, [pagination.pageIndex, pagination.pageSize, fetchEvents, eventCategoryFilter, connectorCategoryFilter, locationFilter, isLoadingConnectors, isLoadingAreas, isLoadingDevices, isLoadingLocations, connectors.length]);
  // --- END REVISED ---

  // Effect to save viewMode to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('eventsViewModePreference', viewMode);
    }
  }, [viewMode]);

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
      setIsCardViewFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Define columns for TanStack Table
  const columns = useMemo<ColumnDef<EnrichedEvent>[]>(() => [
    {
      accessorKey: 'connectorName',
      id: 'connectorName',
      header: "Connector",
      enableSorting: true,
      enableColumnFilter: true,
      filterFn: (row, columnId, filterValue) => {
        // ADDED: Log filterFn execution
        console.log(`[EventsPage] filterFn for '${columnId}': filterValue='${filterValue}', rowValue='${row.original.connectorName || 'System'}'`);
        // END ADDED
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
      <EventViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
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
      <Select
        value={connectorCategoryFilter}
        onValueChange={(value) => setConnectorCategoryFilter(value)}
      >
        <SelectTrigger className="w-full sm:w-[180px] h-9">
          <div className="flex items-center gap-2 flex-1">
            {connectorCategoryFilter !== 'all' && (
              <ConnectorIcon connectorCategory={connectorCategoryFilter} size={16} />
            )}
            <span>
              {connectorCategoryFilter === 'all' 
                ? 'All Connectors' 
                : formatConnectorCategory(connectorCategoryFilter)}
            </span>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Connectors</SelectItem>
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
      <Select
        value={locationFilter}
        onValueChange={(value) => setLocationFilter(value)}
      >
        <SelectTrigger className="w-full sm:w-[180px] h-9">
          <SelectValue placeholder="Select location..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Locations</SelectItem>
          {locations
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(location => (
              <SelectItem key={location.id} value={location.id}>
                {location.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full sm:w-[180px] h-9 justify-between">
            <span>
              Categories ({eventCategoryFilter.length === Object.keys(EVENT_CATEGORY_DISPLAY_MAP).length
                ? 'All' 
                : eventCategoryFilter.length})
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuLabel>Filter by Event Category</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {Object.entries(EVENT_CATEGORY_DISPLAY_MAP).map(([categoryKey, displayName]) => (
            <DropdownMenuCheckboxItem
              key={categoryKey}
              checked={eventCategoryFilter.includes(categoryKey)}
              onCheckedChange={(checked) => {
                setEventCategoryFilter(prev => 
                  checked 
                    ? [...prev, categoryKey] 
                    : prev.filter(item => item !== categoryKey)
                );
              }}
              onSelect={(e) => e.preventDefault()}
            >
              {displayName}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
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
            <EventCardView events={displayedEvents} areas={areas} allDevices={allDevices} />
        </div>
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
              ? <EventCardViewSkeleton segmentCount={2} cardsPerSegment={4} />
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
              <EventCardView events={displayedEvents} areas={areas} allDevices={allDevices} /> 
            ) : null}
          </div>
        ) : null}
      </TooltipProvider>
    </div>
  );
}