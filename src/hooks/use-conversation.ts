import { useState, useCallback } from 'react';
import type { ChatMessage } from '@/types/ai/chat-types';

interface UseConversationReturn {
  messages: ChatMessage[];
  addUserMessage: (content: string) => void;
  addAssistantMessage: (content: string) => void;
  addFunctionMessage: (name: string, content: string) => void;
  clearConversation: () => void;
  hasMessages: boolean;
}

export function useConversation(): UseConversationReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const addUserMessage = useCallback((content: string) => {
    const newMessage: ChatMessage = { role: 'user', content };
    setMessages(prev => {
      const updated = [...prev, newMessage];
      console.log('[Conversation Hook] Added user message, total messages:', updated.length);
      return updated;
    });
  }, []);

  const addAssistantMessage = useCallback((content: string) => {
    const newMessage: ChatMessage = { role: 'assistant', content };
    setMessages(prev => {
      const updated = [...prev, newMessage];
      console.log('[Conversation Hook] Added assistant message, total messages:', updated.length);
      return updated;
    });
  }, []);

  const addFunctionMessage = useCallback((name: string, content: string) => {
    const newMessage: ChatMessage = { role: 'function', name, content };
    setMessages(prev => {
      const updated = [...prev, newMessage];
      console.log('[Conversation Hook] Added function message, total messages:', updated.length);
      return updated;
    });
  }, []);

  const clearConversation = useCallback(() => {
    console.log('[Conversation Hook] Clearing conversation');
    setMessages([]);
  }, []);

  return {
    messages,
    addUserMessage,
    addAssistantMessage,
    addFunctionMessage,
    clearConversation,
    hasMessages: messages.length > 0,
  };
} 