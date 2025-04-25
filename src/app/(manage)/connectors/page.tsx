'use client'; // Make this a client component

import React, { useEffect, useState, useCallback } from 'react';
import { useFusionStore } from '@/stores/store'; // Import the store hook
import { Button, buttonVariants } from '@/components/ui/button'; // Import buttonVariants
import { AddConnectorModal } from '@/components/features/connectors/add-connector-modal'; // Import the modal
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Trash2, Plus, Plug, AlertCircle, X } from "lucide-react";
// Using console for messaging instead of toast
import { ConnectorWithConfig } from '@/types'; // Renamed type
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"; // Import AlertDialog components
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // <<< Added Alert imports
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { SiMqtt } from "react-icons/si";
import { LuArrowRightLeft } from "react-icons/lu"; // Use requested WebSocket icon
import { ConnectorIcon } from "@/components/features/connectors/connector-icon"; // Import ConnectorIcon
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"; // Import TooltipProvider & components
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"; // <<< Added Popover imports
import { formatConnectorCategory } from "@/lib/utils"; // Import formatConnectorCategory
import { formatDistanceToNow } from 'date-fns'; // <<< Import date-fns function
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'; // <<< Added SyntaxHighlighter
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism'; // <<< Added style
import { Check, Copy } from "lucide-react"; // <<< Added icons for copy button
import { toast } from 'sonner'; // <<< Added for copy toast

// Define structure for fetched YoLink MQTT state from API
interface FetchedMqttState {
  connected: boolean;
  lastEvent: { time: number; count: number } | null;
  error: string | null;
  reconnecting: boolean;
  disabled: boolean;
  homeId?: string | null; // Add optional homeId
  lastStandardizedPayload?: Record<string, any> | null;
}

// Define structure for fetched Piko WebSocket state from API
interface FetchedPikoState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnecting: boolean;
  disabled: boolean;
  lastActivity: number | null; // Assuming timestamp
  systemId?: string | null; // Add optional systemId
  lastStandardizedPayload?: Record<string, any> | null;
}

// Shared connection status type used in the store
type ConnectionStatus = 'connected' | 'disconnected' | 'unknown' | 'reconnecting' | 'error';

// Helper function to translate YoLink fetched state to store status
const translateMqttStatus = (
  eventsEnabled: boolean,
  state: FetchedMqttState
): ConnectionStatus => {
  if (!eventsEnabled || state.disabled) {
    return 'unknown'; // Explicitly disabled by user OR by backend service
  }
  if (state.connected) {
    return 'connected';
  }
  if (state.reconnecting) {
    return 'reconnecting';
  }
  if (state.error) {
    return 'error';
  }
  return 'disconnected';
};

// Helper function to translate Piko fetched state to store status
const translatePikoStatus = (
  eventsEnabled: boolean,
  state: FetchedPikoState
): ConnectionStatus => {
  if (!eventsEnabled || state.disabled) {
    return 'unknown'; // Explicitly disabled by user OR by backend service
  }
  if (state.isConnected) {
    return 'connected';
  }
  if (state.isConnecting || state.reconnecting) { // Consider both connecting and reconnecting states
    return 'reconnecting';
  }
  if (state.error) {
    return 'error';
  }
  return 'disconnected';
};

// Define return types for state getters
type MqttStateType = ReturnType<typeof useFusionStore.getState().getMqttState>;
type PikoStateType = ReturnType<typeof useFusionStore.getState().getPikoState>;

// --- Reusable Status Component ---
interface ConnectorStatusProps {
  connector: ConnectorWithConfig;
  togglingConnectorId: string | null;
  getMqttState: (id: string) => MqttStateType; // Use defined type
  getPikoState: (id: string) => PikoStateType; // Use defined type
  // Pass helper functions as props to avoid redefining them or making them global
  getStatusColorClass: (id: string) => string;
  getMqttStatusText: (id: string) => string;
  getPikoStatusColorClass: (id: string) => string;
  getPikoStatusText: (id: string) => string;
}

const ConnectorStatus: React.FC<ConnectorStatusProps> = ({ 
  connector, 
  togglingConnectorId,
  getMqttState,
  getPikoState,
  getStatusColorClass,
  getMqttStatusText,
  getPikoStatusColorClass,
  getPikoStatusText
}) => {
  if (togglingConnectorId === connector.id) {
    return (
      <div className="flex items-center justify-start px-2.5 py-1">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (connector.category === 'yolink') {
    const state = getMqttState(connector.id);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${getStatusColorClass(connector.id)}`}>
            <SiMqtt className="h-3.5 w-3.5" />
            <span>{getMqttStatusText(connector.id)}</span>
            {state.status === 'reconnecting' && (
              <Loader2 className="h-3 w-3 animate-spin ml-1" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {state.status === 'error' ? 
            `Error: ${state.error || 'Unknown error'}` : 
            getMqttStatusText(connector.id)
          }
        </TooltipContent>
      </Tooltip>
    );
  } else if (connector.category === 'piko') {
    const state = getPikoState(connector.id);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${getPikoStatusColorClass(connector.id)}`}>
            <LuArrowRightLeft className="h-3.5 w-3.5" />
            <span>{getPikoStatusText(connector.id)}</span>
            {state?.status === 'reconnecting' && (
              <Loader2 className="h-3 w-3 animate-spin ml-1" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {state?.status === 'error' ? 
            `Error: ${state?.error || 'Unknown error'}` :
             getPikoStatusText(connector.id)
          }
        </TooltipContent>
      </Tooltip>
    );
  } else {
    return <span className="text-muted-foreground">-</span>;
  }
};

// --- Reusable Last Activity Component Placeholder ---
// TODO: Define LastActivity component similarly

// --- End Reusable Components ---

export default function ConnectorsPage() {
  // Select state
  const { connectors, isLoading, getMqttState, getPikoState, error } = useFusionStore((state) => ({
    connectors: state.connectors,
    isLoading: state.isLoading,
    getMqttState: state.getMqttState,
    getPikoState: state.getPikoState, // Now should work
    error: state.error, // <<< Get error state
  }));
  
  // Get stable action references
  const { 
    setConnectors, 
    setAddConnectorOpen,
    setLoading, 
    setError,
    setEditConnectorOpen,
    setEditingConnector, 
    deleteConnector, 
    setMqttState, // Get MQTT action
    setPikoState // <<< Get Piko action
  } = useFusionStore(); 

  // State for modals and delete confirmation
  const [connectorIdToDelete, setConnectorIdToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingConnectorId, setTogglingConnectorId] = useState<string | null>(null);
  const [copiedPayloadId, setCopiedPayloadId] = useState<string | null>(null); // <<< State for copy button

  // Set page title
  useEffect(() => {
    document.title = 'Connectors // Fusion Bridge';
  }, []);

  // --- Data Fetching and Polling ---
  const refreshConnectorsData = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) {
      setLoading(true);
    }
    try {
      const connectorsResponse = await fetch('/api/connectors');
      const connectorsData = await connectorsResponse.json();
      let fetchedConnectors: ConnectorWithConfig[] = [];
      if (connectorsData.success) {
        fetchedConnectors = connectorsData.data;
        setConnectors(fetchedConnectors);
      } else {
        setError(connectorsData.error || 'Failed to load connectors');
        if (isInitialLoad) setLoading(false);
        return;
      }
      // Fetch status from the /api/connection-status endpoint
      const statusResponse = await fetch('/api/connection-status'); 
      const statusData = await statusResponse.json();
      
      if (statusData.success && statusData.statuses && Array.isArray(statusData.statuses)) {
        const connectorMap = new Map(fetchedConnectors.map(c => [c.id, c]));

        for (const statusPayload of statusData.statuses) {
          const connectorId = statusPayload.connectorId;
          const connector = connectorMap.get(connectorId);

          if (!connector) {
            console.warn(`[ConnectorsPage] Received status for unknown connector ID: ${connectorId}`);
            continue;
          }

          // Process based on connectionType
          if (statusPayload.connectionType === 'mqtt' && statusPayload.state) {
            const mqttState: FetchedMqttState = statusPayload.state;
            const storeStatus: ConnectionStatus = translateMqttStatus(connector.eventsEnabled === true, mqttState);
            setMqttState(connectorId, { 
              status: storeStatus, 
              error: mqttState.error,
              // Extract time/count from lastEvent object if it exists
              lastEventTime: mqttState.lastEvent?.time ?? null, 
              eventCount: mqttState.lastEvent?.count ?? null,
              lastStandardizedPayload: mqttState.lastStandardizedPayload ?? null
            });
          } else if (statusPayload.connectionType === 'websocket' && statusPayload.state) {
            const pikoState: FetchedPikoState = statusPayload.state;
            const storeStatus: ConnectionStatus = translatePikoStatus(connector.eventsEnabled === true, pikoState);
            setPikoState(connectorId, { 
              status: storeStatus, 
              error: pikoState.error,
              lastEventTime: pikoState.lastActivity, // Map lastActivity to lastEventTime
              eventCount: null, // Piko state doesn't seem to track event count in this structure
              lastStandardizedPayload: pikoState.lastStandardizedPayload ?? null
            });
          } else if (statusPayload.connectionType !== 'unknown') {
            console.warn(`[ConnectorsPage] Received status for connector ${connectorId} with unknown state or connection type:`, statusPayload);
          }
        }
      } else {
        console.error('[ConnectorsPage] Failed to fetch or parse connection statuses:', statusData.error || 'Invalid format');
      }
    } catch (error) {
      console.error('[ConnectorsPage] Error refreshing data:', error);
      if (isInitialLoad) { setError('Failed to load page data'); }
    } finally {
      if (isInitialLoad) { setLoading(false); }
    }
    // Include setPikoState in dependencies
  }, [setLoading, setConnectors, setError, setMqttState, setPikoState]);

  // Fetch initial data and set up polling
  useEffect(() => {
     refreshConnectorsData(true); // Initial fetch

     const intervalId = setInterval(() => {
       refreshConnectorsData(); // Poll periodically
     }, 5000); // Poll every 5 seconds

     // Cleanup interval on component unmount
     return () => {
       clearInterval(intervalId);
     };
  }, [refreshConnectorsData]);
  
  // --- Event Handlers using renamed actions and state ---
  const handleAddConnectorClick = useCallback(() => {
    setAddConnectorOpen(true);
  }, [setAddConnectorOpen]);

  const handleEditClick = useCallback((connector: ConnectorWithConfig) => {
    setEditingConnector(connector);
    setEditConnectorOpen(true);
  }, [setEditingConnector, setEditConnectorOpen]);

  const handleDeleteClick = useCallback((connectorId: string) => {
    setConnectorIdToDelete(connectorId);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!connectorIdToDelete) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/connectors/${connectorIdToDelete}`, { method: 'DELETE' });
      const data = await response.json();
      if (response.ok && data.success) {
        deleteConnector(connectorIdToDelete);
      } else {
        console.error(data.error || "Failed to delete connector.");
        setError(data.error || 'Failed to delete connector');
      }
    } catch (error) {
      console.error("Error deleting connector:", error);
      setError('Network error deleting connector.');
    } finally {
      setIsDeleting(false);
      setConnectorIdToDelete(null);
    }
  }, [connectorIdToDelete, deleteConnector, setError]);

  // Function to handle toggle change for YoLink MQTT
  const handleMqttToggle = useCallback(async (connector: ConnectorWithConfig, currentCheckedState: boolean) => {
    const newValue = !currentCheckedState;
    
    setTogglingConnectorId(connector.id); // Show spinner

    try {
      // Use connectorId in the payload for the toggle API
      const response = await fetch('/api/mqtt-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: !newValue, connectorId: connector.id })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to update MQTT setting.');
        // Trigger a refresh even on failure to get latest state
        refreshConnectorsData(); 
        return; // Stop processing
      }
      
      // Trigger immediate refresh to get updated DB state and MQTT status
      refreshConnectorsData(); 

    } catch (error) {
      setError('Network error updating MQTT setting.');
      // Trigger a refresh even on network error
      refreshConnectorsData(); 
    } finally {
      setTogglingConnectorId(null); // Clear spinner state
    }
  }, [setError, setMqttState, refreshConnectorsData]);

  // Function to handle toggle change for Piko WebSocket
  const handleWebSocketToggle = useCallback(async (connector: ConnectorWithConfig, currentCheckedState: boolean) => {
    const newValue = !currentCheckedState;
    
    setTogglingConnectorId(connector.id); // Show spinner

    try {
      // Use connectorId in the payload for the toggle API
      const response = await fetch('/api/websocket-toggle', { // <-- Use new API endpoint
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: !newValue, connectorId: connector.id })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to update WebSocket setting.');
        refreshConnectorsData(); 
        return;
      }
      
      // Trigger immediate refresh to get updated DB state and connection status
      refreshConnectorsData(); 

    } catch (error) {
      setError('Network error updating WebSocket setting.');
      refreshConnectorsData(); 
    } finally {
      setTogglingConnectorId(null); // Clear spinner state
    }
    // Note: No direct setPikoState here, rely on refreshConnectorsData
  }, [setError, refreshConnectorsData]); 
  
  // <<< Added handleCopy function >>>
  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPayloadId(id); // Track which payload was copied
      toast.success("Copied JSON to clipboard!");
      setTimeout(() => setCopiedPayloadId(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      toast.error("Failed to copy JSON.");
    }
  };
  
  // --- Rendering Logic (using destructured state and stable handlers) ---
  // getStatusColorClass and getMqttStatusText can remain inside or be moved outside 
  // if they don't rely on component state other than connectorId and getMqttState.
  // Keep them inside for now for simplicity, as they run on render anyway.
  
  // Find the connector being deleted to display its name in the dialog
  const connectorToDelete = connectors.find(c => c.id === connectorIdToDelete);

  // Get status color class based on MQTT status
  const getStatusColorClass = useCallback((connectorId: string) => {
    const mqttState = getMqttState(connectorId);
    const connector = connectors.find(c => c.id === connectorId);
    if (connector) {
      if (mqttState.status === 'connected') {
        return 'text-green-500';
      } else if (mqttState.status === 'disconnected') {
        return 'text-red-500';
      } else if (mqttState.status === 'reconnecting') {
        return 'text-yellow-500';
      } else if (mqttState.status === 'error') {
        return 'text-red-500';
      }
    }
    return 'text-muted-foreground';
  }, [connectors, getMqttState]);

  const getMqttStatusText = useCallback((connectorId: string) => {
    const mqttState = getMqttState(connectorId);
    const connector = connectors.find(c => c.id === connectorId);
    if (connector) {
      if (mqttState.status === 'connected') {
        return 'Connected';
      } else if (mqttState.status === 'disconnected') {
        return 'Disconnected';
      } else if (mqttState.status === 'reconnecting') {
        return 'Reconnecting';
      } else if (mqttState.status === 'error') {
        return 'Error';
      }
    }
    return 'Unknown';
  }, [connectors, getMqttState]);

  const getPikoStatusColorClass = useCallback((connectorId: string) => {
    const pikoState = getPikoState(connectorId);
    const connector = connectors.find(c => c.id === connectorId);
    if (connector) {
      if (pikoState.status === 'connected') {
        return 'text-green-500';
      } else if (pikoState.status === 'disconnected') {
        return 'text-red-500';
      } else if (pikoState.status === 'reconnecting') {
        return 'text-yellow-500';
      } else if (pikoState.status === 'error') {
        return 'text-red-500';
      }
    }
    return 'text-muted-foreground';
  }, [connectors, getPikoState]);

  const getPikoStatusText = useCallback((connectorId: string) => {
    const pikoState = getPikoState(connectorId);
    const connector = connectors.find(c => c.id === connectorId);
    if (connector) {
      if (pikoState.status === 'connected') {
        return 'Connected';
      } else if (pikoState.status === 'disconnected') {
        return 'Disconnected';
      } else if (pikoState.status === 'reconnecting') {
        return 'Reconnecting';
      } else if (pikoState.status === 'error') {
        return 'Error';
      }
    }
    return 'Unknown';
  }, [connectors, getPikoState]);

  return (
    <TooltipProvider> {/* Wrap page content */}
      <div className="container py-6">
        {/* ... Header and Alert ... */}
        {isLoading ? (
          // ... Loading spinner ...
        ) : connectors.length === 0 ? (
          // ... Empty state card ...
        ) : (
          <Card>
            <Table>
              <TableHeader>
                {/* ... TableHead rows ... */}
              </TableHeader>
              <TableBody>
                {connectors.map((connector: ConnectorWithConfig) => (
                  <TableRow key={connector.id}>
                    {/* ... Name, Type, Events Cells ... */}
                    <TableCell>
                      {/* <<< Original Status Logic >>> */}
                      {togglingConnectorId === connector.id ? (
                        <div className="flex items-center justify-start px-2.5 py-1">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : connector.category === 'yolink' ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${getStatusColorClass(connector.id)}`}>
                              <SiMqtt className="h-3.5 w-3.5" />
                              <span>{getMqttStatusText(connector.id)}</span>
                              {getMqttState(connector.id).status === 'reconnecting' && (
                                <Loader2 className="h-3 w-3 animate-spin ml-1" />
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {getMqttState(connector.id).status === 'error' ? 
                              `Error: ${getMqttState(connector.id).error || 'Unknown error'}` : 
                              getMqttStatusText(connector.id)
                            }
                          </TooltipContent>
                        </Tooltip>
                      ) : connector.category === 'piko' ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${getPikoStatusColorClass(connector.id)}`}>
                              <LuArrowRightLeft className="h-3.5 w-3.5" />
                              <span>{getPikoStatusText(connector.id)}</span>
                              {getPikoState(connector.id)?.status === 'reconnecting' && (
                                <Loader2 className="h-3 w-3 animate-spin ml-1" />
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {getPikoState(connector.id)?.status === 'error' ? 
                              `Error: ${getPikoState(connector.id)?.error || 'Unknown error'}` :
                               getPikoStatusText(connector.id)
                            }
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {/* <<< Keep existing Last Activity logic >>> */}
                      {connector.category === 'yolink' ? (
                        <Popover>
                           {/* ... Popover for YoLink ... */}
                        </Popover>
                      ) : connector.category === 'piko' ? (
                        <Popover>
                           {/* ... Popover for Piko ... */}
                        </Popover>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    {/* ... Actions Cell ... */}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
        
        {/* ... Modals ... */}
      </div>
    </TooltipProvider>
  );
}
