'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Brain, AlertCircle, CheckCircle2, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import type { ChatResponse } from '@/types/ai/chat-types';

interface NaturalLanguageSearchProps {
  onResults?: (results: any) => void;
  className?: string;
}

export function NaturalLanguageSearch({ onResults, className }: NaturalLanguageSearchProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState<ChatResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!query.trim()) {
      toast.error('Please enter a query');
      return;
    }

    setIsLoading(true);
    setLastResponse(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          query: query.trim(),
          userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      const data: ChatResponse = await response.json();
      setLastResponse(data);

      if (data.success) {
        if (data.data) {
          const resultCount = data.data.count || data.data.totalCount || 0;
          toast.success(`Found ${resultCount} results`);
          onResults?.(data.data);
        } else {
          toast.success('Query processed successfully');
        }
      } else {
        toast.error(data.error || 'Failed to process query');
      }
    } catch (error) {
      console.error('Error processing natural language query:', error);
      toast.error('Failed to process query. Please try again.');
      setLastResponse({
        success: false,
        error: 'Failed to connect to the server. Please try again.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExampleClick = (exampleQuery: string) => {
    setQuery(exampleQuery);
  };

  const exampleQueries = [
    "Show me all door events from today",
    "What sensors are offline?",
    "How many events occurred last week?",
    "Show motion detector activity in the lobby",
    "What happened in Building A yesterday evening?"
  ];

  return (
    <div>
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Natural Language Query
          </CardTitle>
          <CardDescription>
            Ask questions about your events, devices, and system status in plain English
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Query Input Form */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask me anything... e.g., 'Show door events from Building A yesterday'"
              disabled={isLoading}
              className="flex-1"
              maxLength={1000}
            />
            <Button type="submit" disabled={isLoading || !query.trim()}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="sr-only">Search</span>
            </Button>
          </form>

          {/* Example Queries */}
          {!lastResponse && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lightbulb className="h-4 w-4" />
                Try these examples:
              </div>
              <div className="flex flex-wrap gap-2">
                {exampleQueries.map((example, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    onClick={() => handleExampleClick(example)}
                    disabled={isLoading}
                    className="text-xs"
                  >
                    {example}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Understanding your query and searching...
              </AlertDescription>
            </Alert>
          )}

          {/* Response Display */}
          {lastResponse && !isLoading && (
            <div className="space-y-4">
              {lastResponse.success && lastResponse.response ? (
                <>
                  {/* AI Response */}
                  <Alert>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription>
                      {lastResponse.response}
                    </AlertDescription>
                  </Alert>

                  {/* Token Usage */}
                  {lastResponse.usage && (
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs">
                        {lastResponse.usage.totalTokens} tokens used
                      </Badge>
                    </div>
                  )}
                </>
              ) : (
                /* Error Display */
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Error:</strong> {lastResponse.error || 'Unknown error occurred'}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 