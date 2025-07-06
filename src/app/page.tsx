"use client";

import { useEffect, useRef } from 'react';
import { useFusionStore } from '@/stores/store';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2 } from 'lucide-react';
import { ConnectorWithConfig } from '@/types';
import { AddConnectorModal } from '@/components/features/connectors/add-connector-modal';
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { formatConnectorCategory } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// Skeleton Component for Connector Grid Card
const ConnectorCardSkeleton = () => {
  return (
    <div className="p-4 border rounded-lg flex flex-col justify-between min-h-[120px]">
      <div>
        <div className="flex justify-between items-start mb-2">
          <div>
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>
      <div className="mt-auto pt-2">
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
};

export default function Home() {
  const { connectors, isLoading, error, setConnectors, deleteConnector, setAddConnectorOpen, setLoading, setError, fetchOpenAiStatus } = useFusionStore();
  const hasInitialized = useRef(false);

  // Set page title
  useEffect(() => {
    document.title = 'Dashboard // Fusion';
  }, []);

  useEffect(() => {
    async function fetchConnectors() {
      try {
        setLoading(true);
        const response = await fetch('/api/connectors');
        const data = await response.json();
        
        if (data.success) {
          setConnectors(data.data);
        } else {
          setError(data.error || 'Failed to fetch connectors');
        }
      } catch (error) {
        console.error('Error fetching connectors:', error);
        setError('Failed to fetch connectors');
      } finally {
        setLoading(false);
      }
    }

    fetchConnectors();
  }, [setConnectors, setLoading, setError]);

  // Fetch OpenAI status once on mount using ref guard
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      fetchOpenAiStatus();
    }
  }, [fetchOpenAiStatus]); // Include the dependency but guard with ref

  const handleDelete = async (id: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/connectors/${id}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (data.success) {
        deleteConnector(id);
      } else {
        setError(data.error || 'Failed to delete connector');
      }
    } catch (error) {
      console.error('Error deleting connector:', error);
      setError('Failed to delete connector');
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
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <ConnectorCardSkeleton />
                <ConnectorCardSkeleton />
                <ConnectorCardSkeleton />
              </div>
            ) : error ? (
               <div className="text-destructive p-4">{error}</div>
            ) : connectors.length === 0 ? (
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
                {connectors.map((connector: ConnectorWithConfig) => (
                  <div 
                    key={connector.id} 
                    className="p-4 border rounded-lg hover:shadow-md transition-shadow flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-medium mb-1">{connector.name}</h3>
                          <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                            <ConnectorIcon connectorCategory={connector.category} size={12} />
                            <span className="text-xs">{formatConnectorCategory(connector.category)}</span>
                          </Badge>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDelete(connector.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 flex-shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </div>
                    <div className="mt-auto pt-2 text-xs text-muted-foreground">
                        Created: {new Date(connector.createdAt).toLocaleString()}
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