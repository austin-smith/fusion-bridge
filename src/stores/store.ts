import { create } from 'zustand';
import { NodeWithConfig } from '@/types';

// Type for MQTT status representation in the store
type MqttStatus = 'connected' | 'disconnected' | 'unknown' | 'reconnecting' | 'error';

// MQTT state for a specific connector
interface ConnectorMqttState {
  status: MqttStatus;
  error: string | null;
  lastEventTime: number | null; 
  eventCount: number | null;
}

interface FusionState {
  nodes: NodeWithConfig[];
  isLoading: boolean;
  error: string | null;
  addConnectorOpen: boolean;
  yolinkHomeId: string | null;
  editConnectorOpen: boolean;
  editingNode: NodeWithConfig | null;
  
  // MQTT Status States by connector ID
  mqttStates: Record<string, ConnectorMqttState>;
  
  // Actions
  setNodes: (nodes: NodeWithConfig[]) => void;
  addNode: (node: NodeWithConfig) => void;
  updateNode: (node: NodeWithConfig) => void;
  deleteNode: (id: string) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setAddConnectorOpen: (open: boolean) => void;
  setYolinkHomeId: (id: string | null) => void;
  setEditConnectorOpen: (open: boolean) => void;
  setEditingNode: (node: NodeWithConfig | null) => void;

  // MQTT Status Actions
  setMqttState: (connectorId: string, state: { 
    status: MqttStatus; 
    error?: string | null; 
    lastEventTime?: number | null; 
    eventCount?: number | null; 
  }) => void;
  
  // Get MQTT state for a specific connector
  getMqttState: (connectorId: string) => ConnectorMqttState;
}

export const useFusionStore = create<FusionState>((set, get) => ({
  nodes: [],
  isLoading: false,
  error: null,
  addConnectorOpen: false,
  yolinkHomeId: null,
  editConnectorOpen: false,
  editingNode: null,
  
  // Initial MQTT Status State
  mqttStates: {},
  
  // Actions
  setNodes: (nodes) => set({ nodes }),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  updateNode: (updatedNode) => set((state) => ({
    nodes: state.nodes.map((node) => 
      node.id === updatedNode.id ? updatedNode : node
    )
  })),
  deleteNode: (id) => set((state) => ({
    nodes: state.nodes.filter((node) => node.id !== id),
    // Also clean up the MQTT state for this node
    mqttStates: Object.fromEntries(
      Object.entries(state.mqttStates).filter(([nodeId]) => nodeId !== id)
    )
  })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setAddConnectorOpen: (open) => set({ addConnectorOpen: open }),
  setYolinkHomeId: (id) => set({ yolinkHomeId: id }),
  setEditConnectorOpen: (open) => set({ editConnectorOpen: open }),
  setEditingNode: (node) => set({ editingNode: node }),

  // MQTT Status Actions
  setMqttState: (connectorId, state) => set((existingState) => {
    const currentState = existingState.mqttStates[connectorId] || {
      status: 'unknown',
      error: null,
      lastEventTime: null,
      eventCount: null
    };
    
    return {
      mqttStates: {
        ...existingState.mqttStates,
        [connectorId]: {
          status: state.status,
          error: state.error !== undefined ? state.error : currentState.error,
          lastEventTime: state.lastEventTime !== undefined ? state.lastEventTime : currentState.lastEventTime,
          eventCount: state.eventCount !== undefined ? state.eventCount : currentState.eventCount,
        }
      }
    };
  }),
  
  // Get MQTT state for a specific connector with fallback to default state
  getMqttState: (connectorId) => {
    const state = get().mqttStates[connectorId];
    if (!state) {
      return {
        status: 'unknown',
        error: null,
        lastEventTime: null,
        eventCount: null
      };
    }
    return state;
  }
})); 