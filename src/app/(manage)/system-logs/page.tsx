"use client"; // Add this directive for client-side hooks

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eraser, Terminal, Activity, ChevronsUpDown } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";

export default function SystemLogsPage() {
  // TODO: Fetch logs from a source (API, WebSocket, etc.)
  // const logs = exampleLogs;
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isLiveEnabled, setIsLiveEnabled] = useState(true);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

  // Set page title
  useEffect(() => {
    document.title = 'System Logs // Fusion Bridge';
  }, []);

  useEffect(() => {
    if (!isLiveEnabled) {
      setIsConnected(false);
      return; // Don't connect if live logs are disabled
    }

    const eventSource = new EventSource('/api/system-logs');
    let isMounted = true; // Flag to track if component is mounted

    eventSource.onopen = () => {
      if (!isMounted) return;
      setIsConnected(true);
      setError(null);
    };

    eventSource.addEventListener('initial', (event) => {
      try {
        const newLogs = JSON.parse(event.data);
        if (!isMounted) return;
        setLogs(newLogs);
        setIsInitialLoad(true);
      } catch (err) {
        console.error('Error parsing initial logs:', err);
      }
    });

    eventSource.addEventListener('update', (event) => {
      try {
        const newLogs = JSON.parse(event.data);
        if (!isMounted) return;
        setLogs(prev => [...prev, ...newLogs]);
        setIsInitialLoad(false);
      } catch (err) {
        console.error('Error parsing log update:', err);
      }
    });

    eventSource.onerror = (err) => {
      console.error('EventSource error:', err);
      if (!isMounted) return;
      setError('Connection error. Retrying...');
      setIsConnected(false);
    };

    return () => {
      isMounted = false;
      eventSource.close();
      setIsConnected(false);
    };
  }, [isLiveEnabled]); // Re-run effect when isLiveEnabled changes

  // Effect specifically for scrolling
  useEffect(() => {
    if (isAutoScrollEnabled && isLiveEnabled && !isInitialLoad && scrollContainerRef.current) {
      const scrollElement = scrollContainerRef.current;
      // Use setTimeout to ensure DOM update completes before scrolling
      setTimeout(() => {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }, 0);
    }
  }, [logs, isInitialLoad, isAutoScrollEnabled, isLiveEnabled]); // Added isLiveEnabled dependency

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
              <div className="flex items-center gap-3">
                <Toggle 
                  pressed={isLiveEnabled} 
                  onPressedChange={setIsLiveEnabled}
                  size="sm"
                  className="h-8 gap-1 data-[state=on]:bg-green-50 data-[state=on]:text-green-900 hover:bg-muted hover:text-muted-foreground data-[state=on]:hover:bg-green-100 data-[state=on]:hover:text-green-900"
                  aria-label="Toggle live updates"
                >
                  <Activity className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Live</span>
                </Toggle>
                
                <Toggle 
                  pressed={isAutoScrollEnabled} 
                  onPressedChange={setIsAutoScrollEnabled}
                  disabled={!isLiveEnabled}
                  size="sm"
                  className="h-8 gap-1 data-[state=on]:bg-blue-50 data-[state=on]:text-blue-900 hover:bg-muted hover:text-muted-foreground data-[state=on]:hover:bg-blue-100 data-[state=on]:hover:text-blue-900"
                  aria-label="Toggle auto-scroll"
                >
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Auto Scroll</span>
                </Toggle>
              </div>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={clearLogs}
                      className="h-8 w-8"
                    >
                      <Eraser className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Clear Logs
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <Badge variant={
                !isLiveEnabled ? "outline" : 
                isConnected ? "default" : "destructive"
              } className="h-7 px-3 flex items-center gap-1.5 w-24 justify-center pointer-events-none">
                <span className={`h-2 w-2 rounded-full inline-flex flex-shrink-0 ${
                  !isLiveEnabled ? 'bg-gray-500' : 
                  isConnected ? 'bg-green-500' : 'bg-red-400 ring-1 ring-white'
                }`} />
                <span className="inline-flex">
                  {!isLiveEnabled ? 'Paused' : 
                   isConnected ? 'Connected' : 'Error'}
                </span>
              </Badge>
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
                    {isConnected || isLiveEnabled ? 'Waiting for logs...' : 'Live logs disabled.'}
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