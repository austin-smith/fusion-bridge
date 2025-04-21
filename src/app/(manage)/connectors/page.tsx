'use client'; // Make this a client component

import React, { useEffect, useState } from 'react';
import { useFusionStore } from '@/stores/store'; // Import the store hook
import { Button, buttonVariants } from '@/components/ui/button'; // Import buttonVariants
import { AddConnectorModal } from '@/components/features/connectors/add-connector-modal'; // Import the modal
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Trash2, Home, Plus } from "lucide-react";
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

type MqttStatus = 'connected' | 'disconnected' | 'unknown' | 'reconnecting' | 'error';

export default function ConnectorsPage() {
  const {
    nodes,
    setNodes,
    setAddConnectorOpen,
    isLoading,
    setLoading,
    setError,
    setEditConnectorOpen, 
    setEditingNode,     
    deleteNode,         
    getMqttState,
    setMqttState
  } = useFusionStore();
  const [nodeIdToDelete, setNodeIdToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [yolinkHomeInfo, setYolinkHomeInfo] = useState<{id: string, nodeName: string} | null>(null);

  // Fetch connectors and initial MQTT status on page load
  useEffect(() => {
    async function fetchInitialData() {
      try {
        setLoading(true);
        
        // Fetch connectors
        const nodesResponse = await fetch('/api/nodes');
        const nodesData = await nodesResponse.json();
        
        if (nodesData.success) {
          setNodes(nodesData.data);
          
          const yolinkNode = nodesData.data.find((node: NodeWithConfig) => 
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
          if (statusData.success) {
            // Update store with each connector's status from the API
            if (statusData.statuses && Array.isArray(statusData.statuses)) {
              console.log('MQTT statuses from API:', statusData.statuses);
              
              // Process each node status
              for (const nodeStatus of statusData.statuses) {
                if (nodeStatus.nodeId && nodeStatus.mqttState) {
                  // Determine status based on API response and node's eventsEnabled flag
                  let storeStatus: MqttStatus;
                  
                  if (!nodeStatus.enabled) {
                    // Events are explicitly disabled in the node configuration
                    storeStatus = 'unknown';
                  } else if (nodeStatus.mqttState.connected) {
                    storeStatus = 'connected';
                  } else if (nodeStatus.mqttState.reconnecting) {
                    storeStatus = 'reconnecting';
                  } else if (nodeStatus.mqttState.error) {
                    storeStatus = 'error';
                  } else if (nodeStatus.mqttState.disabled) {
                    storeStatus = 'unknown'; // Map 'disabled' status from API to 'unknown' in UI
                  } else {
                    storeStatus = 'disconnected';
                  }
                  
                  console.log(`Setting status for node ${nodeStatus.nodeId} to ${storeStatus} (enabled=${nodeStatus.enabled}, connected=${nodeStatus.mqttState.connected})`);
                  
                  // Update store
                  setMqttState(nodeStatus.nodeId, {
                    status: storeStatus,
                    error: nodeStatus.mqttState.error,
                    lastEventTime: nodeStatus.mqttState.lastEvent?.time,
                    eventCount: nodeStatus.mqttState.lastEvent?.count
                  });
                }
              }
            } else {
              console.error('Invalid MQTT status response:', statusData);
            }
          } else {
            console.error('Failed to fetch MQTT status:', statusData.error);
          }
        } else {
          setError(nodesData.error || 'Failed to load connectors');
        }
      } catch (error) {
        console.error('Error fetching initial data:', error);
        setError('Failed to load page data');
      } finally {
        setLoading(false);
      }
    }

    fetchInitialData();
  }, [setNodes, setLoading, setError, setMqttState]);
  
  // Subscribe to Server‑Sent Events for real‑time MQTT status updates
  useEffect(() => {
    // Guard against older browsers / environments
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }

    const es = new EventSource('/api/mqtt-events');

    // Helper to translate server state into our store status string
    const translateStatus = (
      eventsEnabled: boolean,
      state: { connected: boolean; reconnecting: boolean; error: string | null; disabled: boolean }
    ): MqttStatus => {
      if (!eventsEnabled) {
        return 'unknown';
      }
      if (state.disabled) {
        return 'unknown';
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

    const handleStatusEvent = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const { homeId } = data as { homeId: string | null };
        if (!homeId) return;

        // Find the node that owns this homeId
        const node = nodes.find((n) => n.yolinkHomeId === homeId);
        if (!node) return;

        const status: MqttStatus = translateStatus(node.eventsEnabled === true, data);

        setMqttState(node.id, {
          status,
          error: data.error,
          lastEventTime: data.lastEvent?.time ?? null,
          eventCount: data.lastEvent?.count ?? null,
        });
      } catch (err) {
        console.error('Failed to parse SSE MQTT status event:', err);
      }
    };

    es.addEventListener('status', handleStatusEvent);

    es.onerror = (err) => {
      console.error('SSE connection error:', err);
    };

    return () => {
      es.removeEventListener('status', handleStatusEvent);
      es.close();
    };
  }, [nodes, setMqttState]);
  
  // Function to handle Add Connector button click
  const handleAddConnectorClick = () => {
    setAddConnectorOpen(true);
  };

  // --- Edit Handler ---
  const handleEditClick = (node: NodeWithConfig) => {
    setEditingNode(node);
    setEditConnectorOpen(true);
  };

  // --- Delete Handlers ---
  const handleDeleteClick = (nodeId: string) => {
    setNodeIdToDelete(nodeId); // Open confirmation dialog
  };

  const confirmDelete = async () => {
    if (!nodeIdToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/nodes/${nodeIdToDelete}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        deleteNode(nodeIdToDelete); // Update state
        console.log("Connector deleted successfully!");
      } else {
        console.error(data.error || "Failed to delete connector.");
      }
    } catch (error) {
      console.error("Error deleting connector:", error);
      console.error("Failed to delete connector.");
    } finally {
      setIsDeleting(false);
      setNodeIdToDelete(null); // Close confirmation dialog
    }
  };

  // Function to handle toggle change - just toggles the setting and refreshes status
  const handleMqttToggle = async (node: NodeWithConfig, currentCheckedState: boolean) => {
    const newValue = !currentCheckedState;
    console.log(`Toggling MQTT for node ${node.id} from ${currentCheckedState} to ${newValue}`);

    try {
      // Update local node state immediately
      setNodes(nodes.map((n) => 
        n.id === node.id ? {...n, eventsEnabled: newValue} : n
      ));
      
      // Call API to toggle state on server
      const response = await fetch('/api/mqtt-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          disabled: !newValue,
          nodeId: node.id  // Add nodeId to identify which connector to toggle
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error("Failed to toggle MQTT state:", data.error);
        setError(data.error || 'Failed to update MQTT setting.');
        
        // Revert optimistic update
        setNodes(nodes.map((n) => 
          n.id === node.id ? {...n, eventsEnabled: currentCheckedState} : n
        ));
        return;
      }
      
      // Update MQTT state in store based on API response
      if (data.mqttState) {
        console.log('MQTT toggle API response:', data);
        const state = data.mqttState;
        const nodeId = data.nodeId || node.id;
        
        // Determine status based on server state
        let storeStatus: MqttStatus;
        
        if (!newValue) {
          // If we just disabled events, show "unknown"
          storeStatus = 'unknown';
        } else if (state.connected) {
          storeStatus = 'connected';
        } else if (state.reconnecting) {
          storeStatus = 'reconnecting';
        } else if (state.error) {
          storeStatus = 'error';
        } else if (state.disabled) {
          storeStatus = 'unknown'; // Map 'disabled' status from API to 'unknown' in UI
        } else {
          storeStatus = 'disconnected';
        }
        
        console.log(`Setting status for node ${nodeId} to ${storeStatus} (newValue=${newValue}, connected=${state.connected})`);
        
        // Update Zustand store for this specific node
        setMqttState(nodeId, {
          status: storeStatus,
          error: state.error,
          lastEventTime: state.lastEvent?.time,
          eventCount: state.lastEvent?.count
        });
      }
    } catch (error) {
      console.error("Error calling MQTT toggle API:", error);
      setError('Network error updating MQTT setting.');
      
      // Revert optimistic update
      setNodes(nodes.map((n) => 
        n.id === node.id ? {...n, eventsEnabled: currentCheckedState} : n
      ));
    }
  };
  
  // Get detailed MQTT status for a specific node for debugging
  const getDetailedMqttStatus = (nodeId: string) => {
    const mqttState = getMqttState(nodeId);
    const node = nodes.find(n => n.id === nodeId);
    
    return {
      nodeId,
      eventsEnabled: node?.eventsEnabled === true,
      homeId: node?.yolinkHomeId,
      mqttState,
      isReconnecting: mqttState.status === 'reconnecting',
    };
  };
  
  // Get status color class based on MQTT status
  const getStatusColorClass = (nodeId: string) => {
    const mqttState = getMqttState(nodeId);
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
        <h1 className="text-2xl font-semibold">Connectors</h1>
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
                        {(() => {
                          // Debug logging
                          const statusInfo = getDetailedMqttStatus(node.id);
                          console.log(`MQTT state for ${node.id}:`, JSON.stringify(statusInfo));
                          return null;
                        })()}
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