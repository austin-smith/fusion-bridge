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
import { Loader2, Send, MapPin, RotateCcw, AlertTriangle } from 'lucide-react';
import type { OpenWeatherConfig } from '@/types/openweather-types';

// Form schema
const formSchema = z.object({
  address: z.string().min(1, 'Address is required'),
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
      formattedAddress: string;
      country: string;
      state?: string;
    };
  } | null>(null);

  const form = useForm<TestFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      address: '1600 Pennsylvania Avenue, Washington, DC, US',
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
          address: values.address,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setTestResult({
          success: true,
          message: data.message || 'Test geocoding completed successfully!',
          result: data.result,
        });
        toast.success('Geocoding test successful!', {
          description: `Address geocoded to: ${data.result?.latitude}, ${data.result?.longitude}`,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Failed to test geocoding',
        });
        toast.error('Geocoding test failed', {
          description: data.error || 'See console for more details',
        });
      }
    } catch (error) {
      console.error('Error testing OpenWeather geocoding:', error);
      setTestResult({
        success: false,
        message: 'Network error while testing geocoding',
      });
      toast.error('Network error while testing geocoding');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetToDefault = () => {
    form.setValue('address', '1600 Pennsylvania Avenue, Washington, DC, US');
    setTestResult(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Test OpenWeather API</DialogTitle>
          <DialogDescription>
            Test your OpenWeather API key.
          </DialogDescription>
        </DialogHeader>

        {!openWeatherConfig?.apiKey && (
          <div className="p-3 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-700/50 dark:text-yellow-300 flex items-start">
            <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
            <p className="text-sm">
              OpenWeather API Key is not configured. Please configure it in the settings before testing.
            </p>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" id="openweather-test-form">
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Test Address</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="1600 Pennsylvania Avenue, Washington, DC, US"
                        disabled={isSubmitting || !openWeatherConfig?.apiKey}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={resetToDefault}
                      disabled={isSubmitting || !openWeatherConfig?.apiKey}
                      title="Reset to default address"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                  <FormDescription className="text-xs">
                    Enter a full address including street, city, state, and country.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {testResult && (
              <div className={`p-3 rounded-md border ${
                testResult.success 
                  ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-700/50 dark:text-green-300'
                  : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-700/50 dark:text-red-300'
              }`}>
                <div className="flex items-start">
                  <MapPin className="h-5 w-5 mr-2 flex-shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{testResult.message}</p>
                    {testResult.result && (
                      <div className="text-xs space-y-1">
                        <p><strong>Coordinates:</strong> {testResult.result.latitude}, {testResult.result.longitude}</p>
                        <p><strong>Formatted Address:</strong> {testResult.result.formattedAddress}</p>
                        <p><strong>Country:</strong> {testResult.result.country}</p>
                        {testResult.result.state && (
                          <p><strong>State:</strong> {testResult.result.state}</p>
                        )}
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