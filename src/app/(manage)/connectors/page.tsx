'use client'; // Make this a client component

import React, { useEffect, useState, useCallback } from 'react';
import { useFusionStore } from '@/stores/store'; // Import the store hook
import { Button, buttonVariants } from '@/components/ui/button'; // Import buttonVariants
import { AddConnectorModal } from '@/components/features/connectors/add-connector-modal'; // Import the modal
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Trash2, Plus, Plug, AlertCircle, X, Copy, Check } from "lucide-react";
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
import { toast } from 'sonner'; // <<< Added for copy toast
import { ConnectorRow } from '@/components/features/connectors/ConnectorRow'; // <<< Import ConnectorRow
import { PageHeader } from '@/components/layout/page-header'; // Import PageHeader

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

export default function ConnectorsPage() {
  // Select state
  const { connectors, isLoading, getMqttState, getPikoState, getWebhookState, error } = useFusionStore((state) => ({
    connectors: state.connectors,
    isLoading: state.isLoading,
    getMqttState: state.getMqttState,
    getPikoState: state.getPikoState,
    getWebhookState: state.getWebhookState,
    error: state.error,
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
    setMqttState,
    setPikoState,
    setWebhookState
  } = useFusionStore(); 

  // State for modals and delete confirmation
  const [connectorIdToDelete, setConnectorIdToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingConnectorId, setTogglingConnectorId] = useState<string | null>(null);
  const [copiedPayloadId, setCopiedPayloadId] = useState<string | null>(null); // <<< State for copy button

  // Set page title
  useEffect(() => {
    document.title = 'Connectors // Fusion';
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
              lastEventTime: mqttState.lastEvent?.time ?? null, 
              eventCount: mqttState.lastEvent?.count ?? null,
              lastStandardizedPayload: mqttState.lastStandardizedPayload ?? null,
              lastActivity: statusPayload.lastActivity ?? mqttState.lastEvent?.time ?? null
            });
          } else if (statusPayload.connectionType === 'websocket' && statusPayload.state) {
            const pikoState: FetchedPikoState = statusPayload.state;
            const storeStatus: ConnectionStatus = translatePikoStatus(connector.eventsEnabled === true, pikoState);
            setPikoState(connectorId, { 
              status: storeStatus, 
              error: pikoState.error,
              lastEventTime: pikoState.lastActivity, 
              eventCount: null, 
              lastStandardizedPayload: pikoState.lastStandardizedPayload ?? null,
              lastActivity: statusPayload.lastActivity ?? pikoState.lastActivity ?? null
            });
          } else if (statusPayload.connectionType === 'webhook') {
            const webhookState = statusPayload.state || {}; 
            setWebhookState(connectorId, { 
              lastActivity: statusPayload.lastActivity ?? webhookState.lastActivity ?? null
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
      if (isInitialLoad) setError('Failed to load page data');
    } finally {
      if (isInitialLoad) { setLoading(false); }
    }
  }, [setLoading, setConnectors, setError, setMqttState, setPikoState, setWebhookState]);

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
  }, [setError, refreshConnectorsData]);

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

  // Define page actions
  const pageActions = (
    <Button onClick={handleAddConnectorClick} size="sm">
      <Plus className="h-4 w-4" /> 
      Add Connector
    </Button>
  );

  return (
    <TooltipProvider> {/* Wrap page content */}
      <div className="container py-6">
        {/* Use PageHeader */}
        <PageHeader 
          title="Connectors"
          description="Manage integration connectors."
          icon={<Plug className="h-6 w-6" />}
          actions={pageActions}
        />

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error}
              <button 
                onClick={() => setError(null)}
                className="absolute top-2 right-2 p-1 rounded-md hover:bg-destructive/20"
                aria-label="Dismiss error"
              >
                <X className="h-4 w-4" />
              </button>
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : connectors.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <div className="rounded-full p-3 bg-muted mb-4">
                <Plus className="h-6 w-6 text-muted-foreground" />
              </div>
              <CardTitle className="text-lg mb-2">No connectors found</CardTitle>
              <CardDescription className="max-w-xs mb-4">
                Add your first connector to get started with external integrations
              </CardDescription>
              <Button onClick={handleAddConnectorClick} size="sm">
                <Plus className="h-4 w-4" />
                Add Connector
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[25%]">Name</TableHead>
                  <TableHead className="w-[15%]">Type</TableHead>
                  <TableHead className="w-[15%]">Events</TableHead>
                  <TableHead className="w-[15%]">Status</TableHead>
                  <TableHead className="w-[15%]">Last Activity</TableHead>
                  <TableHead className="text-right w-[15%]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connectors.map((connector: ConnectorWithConfig) => {
                  // <<< Get relevant state for the current row >>>
                  const mqttState = getMqttState(connector.id);
                  const pikoState = getPikoState(connector.id);
                  const webhookState = getWebhookState(connector.id);
                  const isToggling = togglingConnectorId === connector.id;
                  // Construct the copy ID dynamically based on category for comparison
                  const currentCopiedPayloadId = connector.category === 'yolink' 
                    ? `${connector.id}-mqtt` 
                    : connector.category === 'piko' 
                      ? `${connector.id}-piko` 
                      : null;

                  return (
                    // <<< Render ConnectorRow component >>>
                    <ConnectorRow
                      key={connector.id}
                      connector={connector}
                      mqttState={mqttState}
                      pikoState={pikoState}
                      webhookState={webhookState}
                      isToggling={isToggling}
                      copiedPayloadId={copiedPayloadId}
                      onMqttToggle={handleMqttToggle}
                      onWebSocketToggle={handleWebSocketToggle}
                      onEdit={handleEditClick}
                      onDelete={handleDeleteClick}
                      onCopy={handleCopy}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
        
        {/* Add/Edit Connector Modal */}
        <AddConnectorModal />
        
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!connectorIdToDelete} onOpenChange={(open: boolean) => !open && setConnectorIdToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the connector{' '}
                {connectorToDelete && <strong className="font-medium">{connectorToDelete.name}</strong>}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDelete} 
                disabled={isDeleting} 
                className={buttonVariants({ variant: "destructive" })}
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}