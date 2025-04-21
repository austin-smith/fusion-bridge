'use client'; // Make this a client component

import React, { useEffect, useState, useCallback } from 'react';
import { useFusionStore } from '@/stores/store'; // Import the store hook
import { Button, buttonVariants } from '@/components/ui/button'; // Import buttonVariants
import { AddConnectorModal } from '@/components/features/connectors/add-connector-modal'; // Import the modal
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Trash2, Plus, Plug } from "lucide-react";
// Using console for messaging instead of toast
import { NodeWithConfig } from '@/types'; // Import NodeWithConfig
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
import { useMqttSse } from '@/hooks/use-mqtt-sse'; // <-- Import the new hook

// Define the structure for the status event data received via SSE
// This might need adjustment based on the actual structure sent by the hook/API
interface SseMqttStatusEvent {
  homeId: string | null;
  connected: boolean;
  lastEvent: { time: number; count: number } | null;
  error: string | null;
  reconnecting: boolean;
  disabled: boolean;
}

type MqttStatus = 'connected' | 'disconnected' | 'unknown' | 'reconnecting' | 'error';

// Helper function moved outside the component for stability
const translateStatus = (
  eventsEnabled: boolean,
  state: SseMqttStatusEvent 
): MqttStatus => {
  if (!eventsEnabled) {
    return 'unknown';
  }
  if (state.disabled) {
    return 'unknown'; // Explicitly disabled in backend service
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

export default function ConnectorsPage() {
  // Select only state needed for rendering directly
  const { nodes, isLoading, getMqttState } = useFusionStore((state) => ({
    nodes: state.nodes,
    isLoading: state.isLoading,
    getMqttState: state.getMqttState
  }));
  
  // Get stable action references ONCE from the store
  const { 
    setNodes,
    setAddConnectorOpen,
    setLoading, 
    setError,
    setEditConnectorOpen,
    setEditingNode,
    deleteNode,
    setMqttState
  } = useFusionStore(); // No selector here returns the whole store, actions are stable

  // State for modals and delete confirmation
  const [nodeIdToDelete, setNodeIdToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [yolinkHomeInfo, setYolinkHomeInfo] = useState<{id: string, nodeName: string} | null>(null);

  // Stable callback for handling SSE status events
  const handleSseStatus = useCallback((statusEvent: SseMqttStatusEvent) => {
    const { homeId } = statusEvent;
    if (!homeId) return;
    const currentNodes = useFusionStore.getState().nodes;
    const node = currentNodes.find((n) => n.yolinkHomeId === homeId);
    if (!node) {
      return;
    }
    const storeStatus: MqttStatus = translateStatus(node.eventsEnabled === true, statusEvent);
    // Use the stable setMqttState reference
    setMqttState(node.id, {
      status: storeStatus,
      error: statusEvent.error,
      lastEventTime: statusEvent.lastEvent?.time ?? null,
      eventCount: statusEvent.lastEvent?.count ?? null,
    });
  }, [setMqttState]); // Dependency only on stable action

  // Stable callback for handling SSE errors
  const handleSseError = useCallback((error: Event) => {
    console.error('[ConnectorsPage] SSE connection error:', error);
  }, []);

  // Use the SSE hook for real-time status updates
  useMqttSse({
    onStatus: handleSseStatus,
    onError: handleSseError
  });

  // --- Initial Data Fetch --- 
  // Define fetchInitialData using useCallback, but outside the main useEffect 
  // to ensure stability if dependencies change
  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const nodesResponse = await fetch('/api/nodes');
      const nodesData = await nodesResponse.json();
      
      if (nodesData.success) {
        const fetchedNodes = nodesData.data;
        setNodes(fetchedNodes);
        
        const yolinkNode = fetchedNodes.find((node: NodeWithConfig) => 
          node.category === 'yolink' && node.yolinkHomeId
        );
        if (yolinkNode && yolinkNode.yolinkHomeId) {
          setYolinkHomeInfo({
            id: yolinkNode.yolinkHomeId,
            nodeName: yolinkNode.name
          });
        }
        
        // Fetch initial MQTT status
        const statusResponse = await fetch('/api/mqtt-status');
        const statusData = await statusResponse.json();
        if (statusData.success && statusData.statuses && Array.isArray(statusData.statuses)) {
          for (const nodeStatus of statusData.statuses) {
            if (nodeStatus.nodeId && nodeStatus.mqttState) {
              const node = fetchedNodes.find((n: NodeWithConfig) => n.id === nodeStatus.nodeId);
              if (node) {
                const storeStatus: MqttStatus = translateStatus(node.eventsEnabled === true, nodeStatus.mqttState);
                setMqttState(nodeStatus.nodeId, {
                  status: storeStatus,
                  error: nodeStatus.mqttState.error,
                  lastEventTime: nodeStatus.mqttState.lastEvent?.time,
                  eventCount: nodeStatus.mqttState.lastEvent?.count
                });
              }
            }
          }
        } else {
          console.error('[ConnectorsPage] Failed to fetch initial MQTT status:', statusData.error || 'Invalid format');
        }
      } else {
        setError(nodesData.error || 'Failed to load connectors');
      }
    } catch (error) {
      console.error('[ConnectorsPage] Error fetching initial data:', error);
      setError('Failed to load page data');
    } finally {
      setLoading(false);
    }
    // Stable setters from store are used, no unstable dependencies needed
  }, [setLoading, setNodes, setError, setMqttState]);

  // Fetch connectors and initial MQTT status ONLY on mount
  useEffect(() => {
     fetchInitialData();
  }, [fetchInitialData]); // Depends only on the stable fetchInitialData callback
  
  // --- Event Handlers using stable actions ---
  const handleAddConnectorClick = useCallback(() => {
    setAddConnectorOpen(true);
  }, [setAddConnectorOpen]);

  const handleEditClick = useCallback((node: NodeWithConfig) => {
    setEditingNode(node);
    setEditConnectorOpen(true);
  }, [setEditingNode, setEditConnectorOpen]);

  const handleDeleteClick = useCallback((nodeId: string) => {
    setNodeIdToDelete(nodeId); 
  }, []); // Relies only on local state setter

  const confirmDelete = useCallback(async () => {
    if (!nodeIdToDelete) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/nodes/${nodeIdToDelete}`, { method: 'DELETE' });
      const data = await response.json();
      if (response.ok && data.success) {
        deleteNode(nodeIdToDelete);
      } else {
        console.error(data.error || "Failed to delete connector.");
        setError(data.error || 'Failed to delete connector'); // Use store error setter
      }
    } catch (error) {
      console.error("Error deleting connector:", error);
      setError('Network error deleting connector.');
    } finally {
      setIsDeleting(false);
      setNodeIdToDelete(null);
    }
  }, [nodeIdToDelete, deleteNode, setError]); // Depends on local state + stable setters

  // Function to handle toggle change 
  const handleMqttToggle = useCallback(async (node: NodeWithConfig, currentCheckedState: boolean) => {
    const newValue = !currentCheckedState;
    
    // --- Optimistic UI Update ---
    const originalNodes = useFusionStore.getState().nodes; // Get current state
    const updatedNodesOptimistic = originalNodes.map((n: NodeWithConfig) => 
      n.id === node.id ? {...n, eventsEnabled: newValue} : n
    );
    setNodes(updatedNodesOptimistic); // Pass the new array directly
    
    // Revert function in case of error
    const revertNodes = () => {
      setNodes(originalNodes.map((n: NodeWithConfig) => 
         n.id === node.id ? {...n, eventsEnabled: currentCheckedState} : n
      ));
    };

    try {
      const response = await fetch('/api/mqtt-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: !newValue, nodeId: node.id })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to update MQTT setting.');
        revertNodes(); // Revert optimistic update
        return;
      }
      
      // Optional: Preemptively update MQTT state based on response
      // Relying on SSE update is generally cleaner
      if (data.mqttState) {
        const state = data.mqttState;
        const nodeId = data.nodeId || node.id;
        // Ensure we read the *potentially updated* node list from store state again 
        // if the toggle was successful and we want to derive status from it.
        // However, translateStatus should ideally use the `newValue` we intended.
        const storeStatus: MqttStatus = translateStatus(newValue, state);
        setMqttState(nodeId, {
          status: storeStatus,
          error: state.error,
          lastEventTime: state.lastEvent?.time,
          eventCount: state.lastEvent?.count
        });
      }
    } catch (error) {
      setError('Network error updating MQTT setting.');
      revertNodes(); // Revert optimistic update
    }
  }, [setNodes, setError, setMqttState]); // Stable dependencies
  
  // --- Rendering Logic (using destructured state and stable handlers) ---
  // getStatusColorClass and getMqttStatusText can remain inside or be moved outside 
  // if they don't rely on component state other than nodeId and getMqttState.
  // Keep them inside for now for simplicity, as they run on render anyway.
  
  // Get status color class based on MQTT status
  const getStatusColorClass = (nodeId: string) => {
    const mqttState = getMqttState(nodeId);
    // Find node from the list obtained from store selector
    const node = nodes.find(n => n.id === nodeId);
    const eventsEnabled = node?.eventsEnabled === true;
    
    // If events are explicitly disabled by the user, show gray
    if (!eventsEnabled) {
      return 'bg-slate-300/20 text-slate-500 border border-slate-300/20';
    }
    
    // Use mqttStatus from Zustand store
    switch (mqttState.status) {
      case 'connected': return 'bg-green-500/20 text-green-600 border border-green-500/20';
      case 'reconnecting': return 'bg-yellow-500/20 text-yellow-600 border border-yellow-500/20';
      case 'disconnected': return 'bg-red-500/25 text-red-600 border border-red-500/30';
      case 'error': return 'bg-red-500/25 text-red-600 border border-red-500/30';
      case 'unknown': return 'bg-slate-300/20 text-slate-500 border border-slate-300/20';
      default: return 'bg-muted text-muted-foreground border border-muted-foreground/20';
    }
  };
  
  // Get status text based on MQTT status
  const getMqttStatusText = (nodeId: string) => {
    const mqttState = getMqttState(nodeId);
    const node = nodes.find(n => n.id === nodeId);
    const eventsEnabled = node?.eventsEnabled === true;
    
    // If events are explicitly disabled by the user, show "Disabled"
    if (!eventsEnabled) {
      return 'Disabled';
    }
    
    // Use mqttStatus from Zustand store
    switch (mqttState.status) {
      case 'connected': return 'Connected';
      case 'reconnecting': return 'Reconnecting';
      case 'disconnected': return 'Disconnected';
      case 'error': return mqttState.error ? `Error: ${mqttState.error}` : 'Error';
      case 'unknown': return 'Unknown';
      default: return 'Unknown';
    }
  };

  return (
    <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <Plug className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Connectors
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage integration connectors.
            </p>
          </div>
        </div>
        <Button onClick={handleAddConnectorClick} size="sm">
          <Plus className="h-4 w-4" />
          Add Connector
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : nodes.length === 0 ? (
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
                <TableHead className="w-[20%]">Events</TableHead>
                <TableHead className="w-[20%]">Status</TableHead>
                <TableHead className="text-right w-[20%]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodes.map((node: NodeWithConfig) => (
                <TableRow key={node.id}>
                  <TableCell className="font-medium">{node.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {node.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {node.category === 'yolink' ? (
                      <div className="flex items-center">
                        <Switch 
                          checked={node.eventsEnabled === true}
                          onCheckedChange={() => handleMqttToggle(node, node.eventsEnabled === true)}
                        />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {node.category === 'yolink' ? (
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${getStatusColorClass(node.id)}`}>
                        <SiMqtt className="h-3.5 w-3.5" />
                        <span>{getMqttStatusText(node.id)}</span>
                        {getMqttState(node.id).status === 'reconnecting' && (
                          <Loader2 className="h-3 w-3 animate-spin ml-1" />
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEditClick(node)} className="h-8 w-8" aria-label="Edit connector">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(node.id)} className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" aria-label="Delete connector">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      
      {/* Add/Edit Connector Modal */}
      <AddConnectorModal />
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!nodeIdToDelete} onOpenChange={(open: boolean) => !open && setNodeIdToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the connector.
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
  );
}