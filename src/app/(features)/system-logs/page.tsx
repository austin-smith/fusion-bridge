"use client"; // Add this directive for client-side hooks

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eraser, Terminal, Activity, ChevronsUpDown, Search, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { useDebounce } from 'use-debounce';

export default function SystemLogsPage() {
  // TODO: Fetch logs from a source (API, WebSocket, etc.)
  // const logs = exampleLogs;
  const [logs, setLogs] = useState<string[]>([]);
  type ConnectionStatus = 'connecting' | 'connected' | 'error' | 'paused';
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting'); // Initialize based on isLiveEnabled later
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isLiveEnabled, setIsLiveEnabled] = useState(true);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);

  // Set page title
  useEffect(() => {
    document.title = 'System Logs // Fusion';
  }, []);

  // Initialize connectionStatus based on initial isLiveEnabled
  useEffect(() => {
    setConnectionStatus(isLiveEnabled ? 'connecting' : 'paused');
  }, [isLiveEnabled]); // Add isLiveEnabled dependency

  useEffect(() => {
    if (!isLiveEnabled) {
      setConnectionStatus('paused');
      return; // Don't connect if live logs are disabled
    }

    setConnectionStatus('connecting'); // Set to connecting when attempting connection
    const eventSource = new EventSource('/api/system-logs');
    let isMounted = true; // Flag to track if component is mounted

    eventSource.onopen = () => {
      if (!isMounted) return;
      setConnectionStatus('connected');
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
      setConnectionStatus('error');
    };

    return () => {
      isMounted = false;
      eventSource.close();
    };
  }, [isLiveEnabled]); // Re-run effect when isLiveEnabled changes

  // Effect specifically for scrolling
  useEffect(() => {
    if (isAutoScrollEnabled && isLiveEnabled && !isInitialLoad && scrollContainerRef.current) {
      const scrollElement = scrollContainerRef.current;
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [logs, isInitialLoad, isAutoScrollEnabled, isLiveEnabled]);

  const clearLogs = () => {
    setLogs([]);
  };

  // Filter logs based on debounced search query
  const filteredLogs = useMemo(() => {
    if (!debouncedSearchQuery) {
      return logs;
    }
    const lowerCaseQuery = debouncedSearchQuery.toLowerCase();
    return logs.filter(log => log.toLowerCase().includes(lowerCaseQuery));
  }, [logs, debouncedSearchQuery]);

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // Define actions separately for clarity, used inside CardHeader now
  const cardHeaderActions = (
    <div className="flex items-center gap-4 flex-wrap justify-end">
      <div className="flex items-center gap-3">
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

      <Badge variant={
        connectionStatus === 'paused' ? "outline" :
        connectionStatus === 'connected' ? "default" :
        connectionStatus === 'connecting' ? "secondary" :
        "destructive" // error state
      } className="h-8 px-3 flex items-center gap-1.5 w-28 justify-center pointer-events-none">
        <span className={`h-2 w-2 rounded-full inline-flex shrink-0 animate-pulse ${
          connectionStatus === 'paused' ? 'bg-gray-500' :
          connectionStatus === 'connected' ? 'bg-green-400 ring-1 ring-white' :
          connectionStatus === 'connecting' ? 'bg-yellow-400 ring-1 ring-white' :
          'bg-red-400 ring-1 ring-white'
        } ${connectionStatus !== 'connecting' ? 'animate-none' : ''}`} />
        <span className="inline-flex text-white">
          {connectionStatus === 'paused' ? 'Paused' :
           connectionStatus === 'connected' ? 'Connected' :
           connectionStatus === 'connecting' ? 'Connecting...' :
           'Error'}
        </span>
      </Badge>
    </div>
  );

  return (
    // Keep h-full and padding on the root div
    <div className="flex flex-col h-full px-4 md:px-6 py-4"> 
      {/* Card takes full height and contains header + content */}
      <Card className="flex-1 flex flex-col min-h-0">
        {/* Re-introduce CardHeader */}
        <CardHeader className="flex-none pb-4 border-b"> {/* Add border back */} 
          <div className="flex items-start justify-between gap-4">
            {/* Title/Description Section */}
            <div className="flex items-center gap-4 shrink-0">
              <Terminal className="h-6 w-6 text-muted-foreground" />
              <div>
                <CardTitle className="text-xl">System Logs</CardTitle> {/* Adjusted size */}
                <p className="text-sm text-muted-foreground">
                  View real-time system messages and events.
                </p>
              </div>
            </div>
            {/* Actions Section (using the defined variable) */}
            {cardHeaderActions}
          </div>
        </CardHeader>
        
        {/* CardContent remains largely the same, holds the dark inset area */}
        <CardContent className="flex-1 p-0 min-h-0"> 
          <div className="h-full bg-gray-950 rounded-b-md flex flex-col"> {/* rounded-b-md */} 
            {/* Search bar */}
            <div className="flex-none p-2 border-b border-gray-800">
              <div className="relative max-w-xs">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="pl-8 h-7 bg-gray-900 border-gray-700 focus:border-blue-500 focus:ring-blue-500 text-sm"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={clearSearch}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {/* Log scroll area */}
            <div 
              ref={scrollContainerRef}
              className="overflow-auto"
              style={{ height: 'calc(100vh - 300px)' }}
            >
              <div className="p-4 font-mono text-sm">
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log, index) => (
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
                    {searchQuery ? 'No logs match your search.' :
                     connectionStatus === 'connected' || connectionStatus === 'connecting' ? 'Waiting for logs...' :
                     connectionStatus === 'paused' ? 'Live logs disabled.' :
                     'Connection error.'}
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