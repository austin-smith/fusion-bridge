'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { OpenAIConfig, OpenAITestResponse } from '@/types/openai-service-types';
import { OPENAI_MODEL_DISPLAY_NAMES } from '@/types/openai-service-types';

interface OpenAITestModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  openAIConfig: OpenAIConfig | null;
}

export function OpenAITestModal({ isOpen, onOpenChange, openAIConfig }: OpenAITestModalProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<OpenAITestResponse | null>(null);

  const handleTest = async () => {
    if (!openAIConfig || !openAIConfig.apiKey) {
      setTestResult({
        success: false,
        errorMessage: 'No OpenAI configuration found. Please configure the service first.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/services/openai/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          configId: openAIConfig.id,
        }),
      });

      const result = await response.json();
      
      // Handle both success and error responses properly
      if (response.ok) {
        setTestResult(result);
      } else {
        setTestResult({
          success: false,
          errorMessage: result.error || 'Failed to test OpenAI configuration.',
        });
      }
    } catch (error) {
      console.error('Error testing OpenAI configuration:', error);
      setTestResult({
        success: false,
        errorMessage: 'Failed to test OpenAI configuration. Please check your network connection.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleClose = () => {
    setTestResult(null);
    onOpenChange(false);
  };



  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Test OpenAI Configuration</DialogTitle>
          <DialogDescription>
            Test connectivity and AI capabilities with your OpenAI configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Warning when not configured - matches OpenWeather pattern */}
          {(!openAIConfig || !openAIConfig.apiKey) && (
            <div className="p-3 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-700/50 dark:text-yellow-300 flex items-start">
              <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
              <p className="text-sm">
                {!openAIConfig 
                  ? 'OpenAI service is not configured. Please configure it in the settings before testing.'
                  : 'OpenAI API Key is not configured. Please configure it in the settings before testing.'
                }
              </p>
            </div>
          )}

          {/* Configuration Summary - only show if configured */}
          {openAIConfig && openAIConfig.apiKey && (
            <div className="rounded-md border p-3 space-y-2">
              <h4 className="text-sm font-medium">Configuration Details</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Model:</span>
                  <div className="font-mono">{OPENAI_MODEL_DISPLAY_NAMES[openAIConfig.model]}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Max Tokens:</span>
                  <div className="font-mono">{openAIConfig.maxTokens.toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Temperature:</span>
                  <div className="font-mono">{openAIConfig.temperature.toFixed(2)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Top P:</span>
                  <div className="font-mono">{openAIConfig.topP.toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Test Results - only show when configured and test has been run */}
          {testResult && openAIConfig && openAIConfig.apiKey && (
            <div className={`p-3 rounded-md border ${
              testResult.success 
                ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-700/50 dark:text-green-300'
                : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-700/50 dark:text-red-300'
            }`}>
              <div className="flex items-start">
                {testResult.success ? (
                  <CheckCircle2 className="h-5 w-5 mr-2 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                )}
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {testResult.success 
                      ? 'OpenAI API test successful!'
                      : testResult.errorMessage || 'Failed to test OpenAI API'
                    }
                  </p>
                  {testResult.success && testResult.usage && (
                    <div className="text-xs space-y-1">
                      <p><strong>Response Time:</strong> {testResult.responseTime}ms</p>
                      <p><strong>Tokens Used:</strong> {testResult.usage.totalTokens} (prompt: {testResult.usage.promptTokens}, completion: {testResult.usage.completionTokens})</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={handleClose} disabled={isTesting}>
              Close
            </Button>
            <Button onClick={handleTest} disabled={isTesting || !openAIConfig || !openAIConfig.apiKey}>
              {isTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Configuration'
              )}
            </Button>
          </div>

          {/* Test Information */}
          <div className="text-xs text-muted-foreground border-t pt-3">
            <p>
              This test will send a simple prompt to OpenAI to verify your API key, 
              model access, and basic AI capabilities. 
              A small number of tokens will be consumed.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 