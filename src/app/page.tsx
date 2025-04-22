"use client";

import { useEffect } from 'react';
import { useFusionStore } from '@/stores/store';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2 } from 'lucide-react';
import { NodeWithConfig } from '@/types';
import { AddConnectorModal } from '@/components/features/connectors/add-connector-modal';
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { formatConnectorCategory } from "@/lib/utils";

export default function Home() {
  const { nodes, isLoading, error, setNodes, deleteNode, setAddConnectorOpen, setLoading, setError } = useFusionStore();

  useEffect(() => {
    async function fetchNodes() {
      try {
        setLoading(true);
        const response = await fetch('/api/nodes');
        const data = await response.json();
        
        if (data.success) {
          setNodes(data.data);
        } else {
          setError(data.error || 'Failed to fetch nodes');
        }
      } catch (error) {
        console.error('Error fetching nodes:', error);
        setError('Failed to fetch nodes');
      } finally {
        setLoading(false);
      }
    }

    fetchNodes();
  }, [setNodes, setLoading, setError]);

  const handleDelete = async (id: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/nodes/${id}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (data.success) {
        deleteNode(id);
      } else {
        setError(data.error || 'Failed to delete node');
      }
    } catch (error) {
      console.error('Error deleting node:', error);
      setError('Failed to delete node');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Manage your security devices and integrations in one place
        </p>
        
        <div className="border rounded-lg p-6 bg-card">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Connectors</h2>
              <Button 
                onClick={() => setAddConnectorOpen(true)}
                className="flex items-center gap-2"
              >
                <PlusCircle className="h-4 w-4" />
                Add Connector
              </Button>
            </div>

            {isLoading ? (
               <div className="flex items-center justify-center p-8">Loading...</div>
            ) : error ? (
               <div className="text-destructive p-4">{error}</div>
            ) : nodes.length === 0 ? (
              <div className="text-center p-8 border rounded-md bg-muted/40">
                <p className="text-muted-foreground">No connectors found</p>
                <Button 
                  variant="link" 
                  onClick={() => setAddConnectorOpen(true)}
                  className="mt-2"
                >
                  Add your first connector
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {nodes.map((node: NodeWithConfig) => (
                  <div 
                    key={node.id} 
                    className="p-4 border rounded-lg hover:shadow-md transition-shadow flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-medium mb-1">{node.name}</h3>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                             <ConnectorIcon connectorCategory={node.category} size={14} />
                             <span>{formatConnectorCategory(node.category)}</span>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDelete(node.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 flex-shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </div>
                    <div className="mt-auto pt-2 text-xs text-muted-foreground">
                        Created: {new Date(node.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <AddConnectorModal />
      </div>
    </TooltipProvider>
  );
} 