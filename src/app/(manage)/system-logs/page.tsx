"use client"; // Add this directive for client-side hooks

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eraser, Terminal } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export default function SystemLogsPage() {
  // TODO: Fetch logs from a source (API, WebSocket, etc.)
  // const logs = exampleLogs;
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/system-logs');

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.addEventListener('initial', (event) => {
      try {
        const newLogs = JSON.parse(event.data);
        setLogs(newLogs);
        setIsInitialLoad(true);
      } catch (err) {
        console.error('Error parsing initial logs:', err);
      }
    });

    eventSource.addEventListener('update', (event) => {
      try {
        const newLogs = JSON.parse(event.data);
        setLogs(prev => [...prev, ...newLogs]);
        setIsInitialLoad(false);
      } catch (err) {
        console.error('Error parsing log update:', err);
      }
    });

    eventSource.onerror = (err) => {
      console.error('EventSource error:', err);
      setError('Connection error. Retrying...');
      setIsConnected(false);
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, []);

  // Effect specifically for scrolling
  useEffect(() => {
    if (!isInitialLoad && scrollContainerRef.current) {
      const scrollElement = scrollContainerRef.current;
      // Use setTimeout to ensure DOM update completes before scrolling
      setTimeout(() => {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }, 0);
    }
  }, [logs, isInitialLoad]); // Depend on logs and isInitialLoad

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="px-6">
      <Card className="h-[calc(100vh-12rem)] flex flex-col">
        <CardHeader className="flex-none pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Terminal className="h-6 w-6 text-muted-foreground" />
              <div>
                <CardTitle>System Logs</CardTitle>
                <p className="text-sm text-muted-foreground">
                  View real-time system messages and events.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={clearLogs}
                    >
                      <Eraser className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Clear Logs
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-muted-foreground">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0 min-h-0">
          <div className="h-full bg-gray-950 rounded-md">
            <div 
              ref={scrollContainerRef}
              className="h-full overflow-auto"
            >
              <div className="p-4 font-mono text-sm">
                {error && (
                  <div className="text-red-500 mb-2">{error}</div>
                )}
                {logs.length > 0 ? (
                  logs.map((log, index) => (
                    <SyntaxHighlighter
                      key={index}
                      language="log" // Or "plaintext", "json" etc. based on log content
                      style={vscDarkPlus}
                      wrapLines={true}
                      lineProps={{ style: { wordBreak: 'break-all', whiteSpace: 'pre-wrap' } }}
                      customStyle={{ background: 'transparent', padding: '0', margin: '0' }}
                    >
                      {log}
                    </SyntaxHighlighter>
                  ))
                ) : (
                  <div className="text-muted-foreground italic">
                    {isConnected ? 'Waiting for logs...' : 'Connecting to log stream...'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 