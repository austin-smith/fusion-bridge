'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Loader2, Send, Sun, RotateCcw, AlertTriangle } from 'lucide-react';
import type { OpenWeatherConfig } from '@/types/openweather-types';

// Form schema
const formSchema = z.object({
  latitude: z.preprocess((val) => parseFloat(String(val)), z.number().min(-90).max(90)),
  longitude: z.preprocess((val) => parseFloat(String(val)), z.number().min(-180).max(180)),
});

type TestFormValues = z.infer<typeof formSchema>;

interface OpenWeatherTestModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  openWeatherConfig: OpenWeatherConfig | null;
}

export function OpenWeatherTestModal({ isOpen, onOpenChange, openWeatherConfig }: OpenWeatherTestModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    result?: {
      latitude: number;
      longitude: number;
      timezone: string;
      timezoneOffset: number;
      currentTime: string;
      sunrise: string;
      sunset: string;
    };
  } | null>(null);

  const form = useForm<TestFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      latitude: 40.7128, // New York City - reasonable default for testing
      longitude: -74.0060,
    },
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTimeout(() => {
        form.reset();
        setTestResult(null);
        setIsSubmitting(false);
      }, 300);
    }
    onOpenChange(open);
  };

  const onSubmit = async (values: TestFormValues) => {
    if (!openWeatherConfig || !openWeatherConfig.apiKey) {
      toast.error('OpenWeather API Key is not configured.');
      return;
    }

    setIsSubmitting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/services/openweather/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latitude: values.latitude,
          longitude: values.longitude,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Format the dates for display
        const result = data.result ? {
          ...data.result,
          currentTime: new Date(data.result.currentTime).toLocaleString(),
          sunrise: new Date(data.result.sunrise).toLocaleString(),
          sunset: new Date(data.result.sunset).toLocaleString(),
        } : undefined;

        setTestResult({
          success: true,
          message: data.message || 'Weather data retrieved successfully!',
          result,
        });
        toast.success('Weather API test successful!', {
          description: `Retrieved sunrise/sunset data for ${values.latitude}, ${values.longitude}`,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Failed to test weather API',
        });
        toast.error('Weather API test failed', {
          description: data.error || 'See console for more details',
        });
      }
    } catch (error) {
      console.error('Error testing OpenWeather API:', error);
      setTestResult({
        success: false,
        message: 'Network error while testing weather API',
      });
      toast.error('Network error while testing weather API');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Test OpenWeather API</DialogTitle>
          <DialogDescription>
            Test your OpenWeather API key by retrieving data from latitude and longitude coordinates.
          </DialogDescription>
        </DialogHeader>

        {!openWeatherConfig?.apiKey && (
          <div className="p-3 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-700/50 dark:text-yellow-300 flex items-start">
            <AlertTriangle className="h-5 w-5 mr-2 shrink-0" />
            <p className="text-sm">
              OpenWeather API Key is not configured. Please configure it in the settings before testing.
            </p>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="openweather-test-form">
            <div className="grid grid-cols-2 gap-4 mb-2">
              <FormField
                control={form.control}
                name="latitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitude</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="45.5152"
                        disabled={isSubmitting || !openWeatherConfig?.apiKey}
                        type="number"
                        step="any"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="longitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longitude</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="-122.6784"
                        disabled={isSubmitting || !openWeatherConfig?.apiKey}
                        type="number"
                        step="any"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormDescription className="text-xs mb-4">
              Enter latitude and longitude coordinates.
            </FormDescription>

            {testResult && (
              <div className={`p-3 rounded-md border ${
                testResult.success 
                  ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-700/50 dark:text-green-300'
                  : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-700/50 dark:text-red-300'
              }`}>
                <div className="flex items-start">
                  <Sun className="h-5 w-5 mr-2 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{testResult.message}</p>
                    {testResult.result && (
                      <div className="text-xs space-y-1">
                        <p><strong>Location:</strong> {testResult.result.latitude}, {testResult.result.longitude}</p>
                        <p><strong>Timezone:</strong> {testResult.result.timezone}</p>
                        <p><strong>Current Time:</strong> {testResult.result.currentTime}</p>
                        <p><strong>Sunrise:</strong> {testResult.result.sunrise}</p>
                        <p><strong>Sunset:</strong> {testResult.result.sunset}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </form>
        </Form>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="openweather-test-form"
            disabled={isSubmitting || !openWeatherConfig?.apiKey}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            ) : (
              <>
                <Send className="h-4 w-4" />
                Test
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 