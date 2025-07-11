'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessagesSquare, X, Maximize2, Minimize2, Calendar, Cpu, ShieldCheck, BarChart3, Activity, Cctv, PowerOff, BookOpen } from 'lucide-react';
import { Chat } from '@/components/ui/chat/chat';
import { type Message } from '@/components/ui/chat/chat-message';
import type { ChatResponse } from '@/types/ai/chat-types';

import { cn } from '@/lib/utils';
import { useFusionStore } from '@/stores/store';
// Simple UUID generation function
const generateId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

interface ChatAIAssistantProps {
  onResults?: (results: any) => void;
}

// Suggestions for empty chat state - these map directly to available AI functions
const DEFAULT_SUGGESTIONS = [
  {
    text: "How many events happened today?",
    icon: Calendar
  },
  {
    text: "Show me the status of every device",
    icon: Cpu
  },
  {
    text: "Are all areas armed?",
    icon: ShieldCheck
  },
  {
    text: "Give a system overview",
    icon: BarChart3
  },
  {
    text: "Show me recent motion events",
    icon: Activity
  },
  {
    text: "How many cameras are offline?",
    icon: Cctv
  },
  {
    text: "Arm all areas",
    icon: ShieldCheck
  },
  {
    text: "Turn off all switches",
    icon: PowerOff
  },
  {
    text: "How do I use the API?",
    icon: BookOpen
  }
];

export function ChatAIAssistant({ onResults }: ChatAIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Get OpenAI enabled status from store
  const { openAiEnabled } = useFusionStore();

  // Function to add a new message to the chat
  const addMessage = useCallback((content: string, role: 'user' | 'assistant' = 'assistant') => {
    const newMessage: Message = {
      id: generateId(),
      role,
      content,
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
  }, []);

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

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsGenerating(true);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userMessage.content,
          userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          conversationHistory: messages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content
          })),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ChatResponse = await response.json();

      let assistantContent = '';
      
      if (result.success && result.response) {
        // Use the natural language response from OpenAI
        assistantContent = result.response;

        // Call the onResults callback if we have data to display
        if (result.data && onResults) {
          onResults(result.data);
        }
      } else {
        assistantContent = result.error || 'I had trouble processing your request.';
      }

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: assistantContent,
        createdAt: new Date(),
        chatActions: result.data?.actions || undefined,
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
  }, [input, isGenerating, messages, onResults]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const handleAppend = useCallback(async (message: { role: "user"; content: string }) => {
    if (!message.content.trim() || isGenerating) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: message.content.trim(),
      createdAt: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput(''); // Clear input
    setIsGenerating(true);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userMessage.content,
          userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          conversationHistory: messages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content
          })),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ChatResponse = await response.json();

      let assistantContent = '';
      
      if (result.success && result.response) {
        // Use the natural language response from OpenAI
        assistantContent = result.response;

        // Call the onResults callback if we have data to display
        if (result.data && onResults) {
          onResults(result.data);
        }
      } else {
        assistantContent = result.error || 'I had trouble processing your request.';
      }

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: assistantContent,
        createdAt: new Date(),
        chatActions: result.data?.actions || undefined,
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
  }, [isGenerating, messages, onResults]);

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



  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      // Handle Escape key to close chat
      if (event.key === 'Escape' && isOpen) {
        handleClose();
        return;
      }

      // Handle Ctrl/Cmd + K to toggle chat
      if (event.key === 'k' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        if (isOpen) {
          handleClose();
        } else {
          setIsOpen(true);
        }
        return;
      }
    };

    document.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [isOpen, handleClose]);

  // Auto-focus the chat input when the chat opens
  useEffect(() => {
    if (isOpen && !isClosing) {
      // Use a timeout to ensure the DOM has updated
      const timer = setTimeout(() => {
        // Use a more reliable selector that doesn't depend on specific positioning classes
        const textarea = document.querySelector<HTMLTextAreaElement>(
          'textarea[aria-label="Write your prompt here"]'
        );
        if (textarea) {
          textarea.focus();
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isOpen, isClosing]);

  // Don't show anything if OpenAI is not enabled
  if (!openAiEnabled) {
    return null;
  }

  // Floating button when closed
  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button 
          onClick={() => setIsOpen(true)}
          size="lg"
          className="h-14 w-14 min-w-14 rounded-full shadow-lg hover:shadow-2xl transition-all duration-300 ai-gradient ai-gradient-hover border-0 ring-2 ring-white/10 hover:ring-white/20 hover:scale-105 active:scale-95 p-0 flex items-center justify-center"
        >
          <MessagesSquare className="!h-6 !w-6 text-white drop-shadow-sm" />
          <span className="sr-only">AI Assistant</span>
        </Button>
      </div>
    );
  }

  // Chat interface when open
  return (
    <div className={cn(
      "fixed z-50",
      // Mobile: small margin on all sides
      "inset-3",
      // Desktop: reset inset and use original bottom-right positioning
      "md:inset-auto md:bottom-6 md:right-6 md:max-w-[calc(100vw-3rem)] md:max-h-[calc(100vh-3rem)]"
    )}>
      <Card 
        className={cn(
          "border-0 transition-all duration-300 ease-in-out flex flex-col shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5),0_25px_50px_-10px_rgba(0,0,0,0.3),0_10px_30px_rgba(0,0,0,0.2)]",
          // Mobile: always fullscreen
          "w-full h-full",
          // Desktop: responsive based on expand state
          "md:w-[min(480px,calc(100vw-3rem))] md:h-[min(600px,calc(100vh-3rem))]",
          isExpanded && "md:w-[min(600px,calc(100vw-3rem))] md:h-[min(750px,calc(100vh-3rem))]",
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
              className="hidden md:flex h-8 w-8 text-white hover:bg-white/20"
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
              addMessage={addMessage}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 