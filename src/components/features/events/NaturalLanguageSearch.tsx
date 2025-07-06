'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Brain, AlertCircle, CheckCircle2, Clock, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import type { 
  QueryResults, 
  QueryType,
  InterpretedQuery 
} from '@/types/ai/natural-language-query-types';

interface NaturalLanguageSearchProps {
  onResults?: (results: QueryResults) => void;
  className?: string;
}

interface QueryResponse {
  success: boolean;
  data?: {
    interpretation: string;
    queryType: QueryType;
    confidence: number;
    ambiguities?: string[];
    suggestions?: string[];
    results: QueryResults;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
  error?: {
    type: string;
    message: string;
    details?: any;
  };
}

export function NaturalLanguageSearch({ onResults, className }: NaturalLanguageSearchProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState<QueryResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!query.trim()) {
      toast.error('Please enter a query');
      return;
    }

    setIsLoading(true);
    setLastResponse(null);

    try {
      const response = await fetch('/api/events/natural-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: query.trim() }),
      });

      const data: QueryResponse = await response.json();
      setLastResponse(data);

      if (data.success && data.data) {
        toast.success(`Found ${data.data.results.totalResults} results`);
        onResults?.(data.data.results);
      } else {
        toast.error(data.error?.message || 'Failed to process query');
      }
    } catch (error) {
      console.error('Error processing natural language query:', error);
      toast.error('Failed to process query. Please try again.');
      setLastResponse({
        success: false,
        error: {
          type: 'network_error',
          message: 'Failed to connect to the server. Please try again.'
        }
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
              {lastResponse.success && lastResponse.data ? (
                <>
                  {/* AI Interpretation */}
                  <Alert>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="space-y-2">
                      <div>
                        <strong>I understood:</strong> {lastResponse.data.interpretation}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="secondary" className="text-xs">
                          {lastResponse.data.queryType}
                        </Badge>
                        <Badge 
                          variant={lastResponse.data.confidence > 0.8 ? "default" : "outline"}
                          className="text-xs"
                        >
                          {Math.round(lastResponse.data.confidence * 100)}% confidence
                        </Badge>
                        {lastResponse.data.usage && (
                          <Badge variant="outline" className="text-xs">
                            {lastResponse.data.usage.totalTokens} tokens
                          </Badge>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>

                  {/* Ambiguities */}
                  {lastResponse.data.ambiguities && lastResponse.data.ambiguities.length > 0 && (
                    <Alert>
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <AlertDescription>
                        <strong>Unclear parts:</strong> {lastResponse.data.ambiguities.join(', ')}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Suggestions */}
                  {lastResponse.data.suggestions && lastResponse.data.suggestions.length > 0 && (
                    <Alert>
                      <Lightbulb className="h-4 w-4 text-blue-600" />
                      <AlertDescription>
                        <div><strong>Alternative interpretations:</strong></div>
                        <ul className="list-disc list-inside mt-1">
                          {lastResponse.data.suggestions.map((suggestion, index) => (
                            <li key={index} className="text-sm">{suggestion}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Results Summary */}
                  <Alert>
                    <Clock className="h-4 w-4 text-blue-600" />
                    <AlertDescription>
                      Found {lastResponse.data.results.totalResults} results in {lastResponse.data.results.executionTime}ms
                    </AlertDescription>
                  </Alert>

                  {/* Results Preview */}
                  {lastResponse.data.queryType === 'events' && lastResponse.data.results.events && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Event Results</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {lastResponse.data.results.events.length > 0 ? (
                          <div className="space-y-2">
                            {lastResponse.data.results.events.slice(0, 5).map((event, index) => (
                              <div key={event.eventUuid} className="flex items-center justify-between p-2 rounded border">
                                <div className="space-y-1">
                                  <div className="text-sm font-medium">
                                    {event.deviceName || 'Unknown Device'}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {event.eventType} • {new Date(event.timestamp).toLocaleString()}
                                  </div>
                                  {event.areaName && (
                                    <div className="text-xs text-muted-foreground">
                                      {event.areaName}{event.locationName ? ` (${event.locationName})` : ''}
                                    </div>
                                  )}
                                </div>
                                {event.displayState && (
                                  <Badge variant="outline" className="text-xs">
                                    {event.displayState}
                                  </Badge>
                                )}
                              </div>
                            ))}
                            {lastResponse.data.results.events.length > 5 && (
                              <div className="text-center text-sm text-muted-foreground">
                                ... and {lastResponse.data.results.events.length - 5} more events
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center text-muted-foreground">No events found</div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Device Status Results */}
                  {lastResponse.data.queryType === 'status' && lastResponse.data.results.deviceStatuses && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Device Status Results</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {lastResponse.data.results.deviceStatuses.length > 0 ? (
                          <div className="space-y-2">
                            {lastResponse.data.results.deviceStatuses.slice(0, 10).map((device, index) => (
                              <div key={device.deviceId} className="flex items-center justify-between p-2 rounded border">
                                <div className="space-y-1">
                                  <div className="text-sm font-medium">
                                    {device.deviceName}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {device.deviceType} • {device.areaName || 'Unassigned'}
                                  </div>
                                </div>
                                <Badge 
                                  variant={device.status === 'online' ? "default" : "destructive"}
                                  className="text-xs"
                                >
                                  {device.status}
                                </Badge>
                              </div>
                            ))}
                            {lastResponse.data.results.deviceStatuses.length > 10 && (
                              <div className="text-center text-sm text-muted-foreground">
                                ... and {lastResponse.data.results.deviceStatuses.length - 10} more devices
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center text-muted-foreground">No devices found</div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Analytics Results */}
                  {lastResponse.data.queryType === 'analytics' && lastResponse.data.results.analytics && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Analytics Results</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {lastResponse.data.results.analytics.count !== undefined && (
                          <div className="text-center">
                            <div className="text-3xl font-bold text-primary">
                              {lastResponse.data.results.analytics.count.toLocaleString()}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Total events
                            </div>
                          </div>
                        )}
                        
                        {lastResponse.data.results.analytics.breakdown && (
                          <div className="mt-4 space-y-2">
                            <div className="text-sm font-medium">Breakdown:</div>
                            {Object.entries(lastResponse.data.results.analytics.breakdown).map(([key, value]) => (
                              <div key={key} className="flex justify-between items-center">
                                <span className="text-sm">{key}</span>
                                <Badge variant="outline">{value}</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                /* Error Display */
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Error:</strong> {lastResponse.error?.message || 'Unknown error occurred'}
                    {lastResponse.error?.type === 'service_unavailable' && (
                      <div className="mt-2 text-sm">
                        Go to Settings → AI Services to configure OpenAI integration.
                      </div>
                    )}
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