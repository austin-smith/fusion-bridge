'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessagesSquare, X, Maximize2, Minimize2 } from 'lucide-react';
import { Chat } from '@/components/ui/chat/chat';
import { type Message } from '@/components/ui/chat/chat-message';
import type { QueryResults } from '@/types/ai/natural-language-query-types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
// Simple UUID generation function
const generateId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

interface ChatAIAssistantProps {
  onResults?: (results: QueryResults) => void;
}

// Suggestions for empty chat state
const DEFAULT_SUGGESTIONS = [
  "Door events today",
  "Sensor status",
  "This week's events",
  "Security issues"
];

export function ChatAIAssistant({ onResults }: ChatAIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleSubmit = useCallback(async (event?: { preventDefault?: () => void }) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    
    if (!input.trim() || isGenerating) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: input.trim(),
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsGenerating(true);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/events/natural-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userMessage.content,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      let assistantContent = '';
      
      if (result.success && result.data) {
        const interpretation = result.data;
        
        // Create a helpful response based on the query type and results
        if (interpretation.queryType === 'events' && interpretation.results?.events) {
          const eventCount = interpretation.results.events.length;
          assistantContent = `Found ${eventCount} event${eventCount !== 1 ? 's' : ''} matching your query.\n\n`;
          assistantContent += `**Query interpretation:** ${interpretation.interpretation}\n\n`;
          
                      if (eventCount > 0) {
              assistantContent += `**Recent events:**\n`;
              interpretation.results.events.slice(0, 5).forEach((event: any, index: number) => {
              const time = new Date(event.timestamp).toLocaleString();
              assistantContent += `${index + 1}. **${event.deviceName || event.deviceId}** - ${event.eventType} at ${time}\n`;
            });
            
            if (eventCount > 5) {
              assistantContent += `\n...and ${eventCount - 5} more events. Check the events page to see all results.`;
            }
          }
        } else if (interpretation.queryType === 'status' && interpretation.results?.devices) {
          const deviceCount = interpretation.results.devices.length;
          assistantContent = `Found status information for ${deviceCount} device${deviceCount !== 1 ? 's' : ''}.\n\n`;
          assistantContent += `**Query interpretation:** ${interpretation.interpretation}\n\n`;
          
          if (deviceCount > 0) {
            assistantContent += `**Device status:**\n`;
            interpretation.results.devices.slice(0, 5).forEach((device: any, index: number) => {
              assistantContent += `${index + 1}. **${device.deviceName || device.deviceId}** - ${device.status || 'Unknown'}\n`;
            });
            
            if (deviceCount > 5) {
              assistantContent += `\n...and ${deviceCount - 5} more devices.`;
            }
          }
        } else if (interpretation.queryType === 'analytics' && interpretation.results?.summary) {
          assistantContent = `Here's your analytics summary:\n\n`;
          assistantContent += `**Query interpretation:** ${interpretation.interpretation}\n\n`;
          assistantContent += `**Results:** ${interpretation.results.summary}`;
        } else {
          assistantContent = `I understood your query: "${interpretation.interpretation}"\n\n`;
          assistantContent += `However, I wasn't able to find specific results. You might want to try rephrasing your question or check the events page directly.`;
        }

        // Call the onResults callback if provided
        if (result.data.results && onResults) {
          onResults(result.data.results);
        }
      } else {
        assistantContent = result.error || 'Sorry, I encountered an error processing your request. Please try again.';
      }

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: assistantContent,
        createdAt: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // Request was cancelled, don't add error message
        return;
      }

      console.error('Error processing query:', error);
      
      const errorMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        createdAt: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }, [input, isGenerating, onResults]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const handleAppend = useCallback((message: { role: "user"; content: string }) => {
    setInput(message.content);
    // Trigger form submission
    setTimeout(() => {
      handleSubmit();
    }, 0);
  }, [handleSubmit]);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
  }, []);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 200);
  }, []);



  // Handle escape key to close chat
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, handleClose]);

  // Floating button when closed
  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                onClick={() => setIsOpen(true)}
                size="lg"
                className="h-14 w-14 min-w-14 rounded-full shadow-lg hover:shadow-2xl transition-all duration-300 ai-gradient ai-gradient-hover border-0 ring-2 ring-white/10 hover:ring-white/20 hover:scale-105 active:scale-95 p-0 flex items-center justify-center"
              >
                <MessagesSquare className="!h-6 !w-6 text-white drop-shadow-sm" />
                <span className="sr-only">AI Assistant</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              AI Assistant
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  // Chat interface when open
  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-[calc(100vw-3rem)] max-h-[calc(100vh-3rem)]">
      <Card 
        className={cn(
          "border-0 transition-all duration-300 ease-in-out flex flex-col shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5),0_25px_50px_-10px_rgba(0,0,0,0.3),0_10px_30px_rgba(0,0,0,0.2)]",
          isExpanded 
            ? "w-[min(600px,calc(100vw-3rem))] h-[min(750px,calc(100vh-3rem))]" 
            : "w-[min(480px,calc(100vw-3rem))] h-[min(600px,calc(100vh-3rem))]",
          isClosing 
            ? "animate-out fade-out-0 zoom-out-95 slide-out-to-bottom-1 duration-200"
            : "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-1 duration-200"
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 ai-gradient rounded-t-lg flex-shrink-0">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <MessagesSquare className="h-5 w-5" />
            AI Assistant
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-0 flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0">
            <Chat
              messages={messages}
              input={input}
              handleInputChange={handleInputChange}
              handleSubmit={handleSubmit}
              isGenerating={isGenerating}
              stop={handleStop}
              append={handleAppend}
              suggestions={DEFAULT_SUGGESTIONS}
              className="h-full p-2"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 