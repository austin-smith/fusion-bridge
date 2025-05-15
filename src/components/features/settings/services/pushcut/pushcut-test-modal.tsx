'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Send, Settings, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

import type { PushcutConfig, PushcutNotificationParams, PushcutActionPayload, PushcutDefinedNotification, PushcutDevice } from '@/types/pushcut-types';
import { PushcutNotificationParamsSchema, PushcutActionPayloadSchema } from '@/types/pushcut-types';
import { PUSHHCUT_SOUND_OPTIONS, type PushcutSoundOption } from '@/lib/pushcut-constants';

const ALL_DEVICES_VALUE = '__ALL_DEVICES__'; // Sentinel value for "All Devices"

// Schema for the form, including notificationName
const formSchema = z.object({
  notificationName: z.string().min(1, 'Notification Name is required.'),
  title: z.string().optional(),
  text: z.string().optional(),
  sound: z.string().optional(), // Will match values from PUSHHCUT_SOUND_OPTIONS or custom
  devices: z.string().optional(), // Value will be device ID or ALL_DEVICES_VALUE
  input: z.string().optional(),
  image: z.string().url().or(z.string()).optional().describe('URL or name of imported image'),
  // imageData: For simplicity, we'll omit direct base64 input in the modal for now, focusing on URL/name for image
  // We can add file upload for imageData later if needed by enhancing this modal
  actions: z.string().optional().refine((val) => {
    if (!val) return true;
    try { z.array(PushcutActionPayloadSchema).parse(JSON.parse(val)); return true; } catch { return false; }
  }, "Invalid JSON for Actions. Must be an array of action objects."),
  defaultAction: z.string().optional().refine((val) => {
    if (!val) return true;
    try { PushcutActionPayloadSchema.parse(JSON.parse(val)); return true; } catch { return false; }
  }, "Invalid JSON for Default Action. Must be an action object."),
  isTimeSensitive: z.boolean().optional().default(false),
  threadId: z.string().optional(),
  delay: z.string().regex(/^\d+(s|m|h)$|^$/, 'Delay must be like "10s", "15m", "6h" or empty').optional(),
});

type PushcutTestFormValues = z.infer<typeof formSchema>;

interface PushcutTestModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  pushcutConfig: PushcutConfig | null; // To check if API key is configured
}

export function PushcutTestModal({ isOpen, onOpenChange, pushcutConfig }: PushcutTestModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [definedNotifications, setDefinedNotifications] = useState<PushcutDefinedNotification[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [fetchNotificationsError, setFetchNotificationsError] = useState<string | null>(null);
  const [activeDevices, setActiveDevices] = useState<PushcutDevice[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [fetchDevicesError, setFetchDevicesError] = useState<string | null>(null);

  const form = useForm<PushcutTestFormValues>(
    {
      resolver: zodResolver(formSchema),
      defaultValues: {
        notificationName: '',
        title: 'Test Pushcut Notification',
        text: 'This is a test message from Fusion Bridge! 🤗',
        sound: PUSHHCUT_SOUND_OPTIONS[0]?.value || 'system',
        devices: ALL_DEVICES_VALUE,
        input: '',
        image: '',
        actions: '',
        defaultAction: '',
        isTimeSensitive: false,
        threadId: '',
        delay: '',
      },
      mode: 'onBlur',
    }
  );

  useEffect(() => {
    async function fetchData() {
      if (isOpen && pushcutConfig?.apiKey) {
        setIsLoadingNotifications(true);
        setFetchNotificationsError(null);
        setDefinedNotifications([]);
        try {
          const response = await fetch('/api/services/pushcut/list-notifications');
          const data = await response.json();
          if (response.ok && data.success) {
            setDefinedNotifications(data.notifications || []);
            if (data.notifications && data.notifications.length > 0) {
              // Optionally set the first notification as default in the form
              // form.setValue('notificationName', data.notifications[0].id);
            } else {
              setFetchNotificationsError('No defined notifications found in your Pushcut account.');
            }
          } else {
            const errorMsg = data.error || 'Failed to fetch defined notifications.';
            setFetchNotificationsError(errorMsg);
            toast.error('Error fetching Pushcut notifications', { description: errorMsg });
          }
        } catch (error) {
          const errorMsg = 'Network error while fetching notifications.';
          setFetchNotificationsError(errorMsg);
          toast.error('Network Error', { description: errorMsg });
          console.error("Error fetching Pushcut defined notifications:", error);
        } finally {
          setIsLoadingNotifications(false);
        }

        setIsLoadingDevices(true);
        setFetchDevicesError(null);
        setActiveDevices([]);
        try {
          const response = await fetch('/api/services/pushcut/list-devices');
          const data = await response.json();
          if (response.ok && data.success) {
            setActiveDevices(data.devices || []);
            if (!data.devices || data.devices.length === 0) {
              // Optional: set error if no devices, or just let it be an empty list
              // setFetchDevicesError('No active devices found.');
            }
          } else {
            const errorMsg = data.error || 'Failed to fetch active devices.';
            setFetchDevicesError(errorMsg);
            toast.error('Error fetching Pushcut devices', { description: errorMsg });
          }
        } catch (error) {
          const errorMsg = 'Network error while fetching devices.';
          setFetchDevicesError(errorMsg);
          toast.error('Network Error', { description: errorMsg });
        } finally {
          setIsLoadingDevices(false);
        }
      } else if (!isOpen) {
        setDefinedNotifications([]);
        setIsLoadingNotifications(false);
        setFetchNotificationsError(null);
        setActiveDevices([]);
        setIsLoadingDevices(false);
        setFetchDevicesError(null);
      }
    }
    fetchData();
  }, [isOpen, pushcutConfig?.apiKey]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTimeout(() => {
        form.reset();
        setIsAdvancedOpen(false);
        setIsSubmitting(false);
        setDefinedNotifications([]);
        setIsLoadingNotifications(false);
        setFetchNotificationsError(null);
        setActiveDevices([]);
        setIsLoadingDevices(false);
        setFetchDevicesError(null);
      }, 300);
    }
    onOpenChange(open);
  };

  const onSubmit = async (values: PushcutTestFormValues) => {
    if (!pushcutConfig || !pushcutConfig.apiKey) {
      toast.error('Pushcut API Key is not configured.');
      return;
    }
    setIsSubmitting(true);

    const { notificationName, ...apiParams } = values;

    const payload: PushcutNotificationParams & { notificationName: string } = {
      notificationName,
      title: apiParams.title || undefined,
      text: apiParams.text || undefined,
      sound: apiParams.sound || undefined,
      devices: apiParams.devices && apiParams.devices !== ALL_DEVICES_VALUE ? [apiParams.devices] : undefined,
      input: apiParams.input || undefined,
      image: apiParams.image || undefined,
      isTimeSensitive: apiParams.isTimeSensitive,
      threadId: apiParams.threadId || undefined,
      delay: apiParams.delay || undefined,
    };

    if (apiParams.actions) {
      try {
        payload.actions = JSON.parse(apiParams.actions) as PushcutActionPayload[];
      } catch (e) { /* Zod already validated, this is for type casting */ }
    }
    if (apiParams.defaultAction) {
      try {
        payload.defaultAction = JSON.parse(apiParams.defaultAction) as PushcutActionPayload;
      } catch (e) { /* Zod already validated */ }
    }

    try {
      const response = await fetch('/api/services/pushcut/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(data.message || 'Test notification sent successfully!');
        handleOpenChange(false);
      } else {
        toast.error(data.error || 'Failed to send test notification', {
          description: data.details?.message || (Array.isArray(data.details?.errors) ? data.details.errors.join(', ') : 'See console for more details'),
        });
        console.error("Pushcut test error data:", data);
      }
    } catch (error) {
      console.error('Error sending Pushcut test notification:', error);
      toast.error('Network error sending test notification.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Send Test Pushcut Notification</DialogTitle>
          <DialogDescription>
            Send a test notification using your Pushcut configuration.
          </DialogDescription>
        </DialogHeader>

        {!pushcutConfig?.apiKey && (
          <div className="px-6 pb-6">
            <div className="p-3 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-700/50 dark:text-yellow-300 flex items-start">
              <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
              <p className="text-sm">
                Pushcut API Key is not configured. Please configure it in the settings before sending a test.
              </p>
            </div>
          </div>
        )}

        <div className="flex-grow overflow-y-auto px-6 pb-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" id="pushcut-test-form">
              <FormField
                control={form.control}
                name="notificationName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notification Name <span className="text-destructive">*</span></FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value} 
                      value={field.value}
                      disabled={isSubmitting || !pushcutConfig?.apiKey || isLoadingNotifications || !!fetchNotificationsError}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={
                            isLoadingNotifications ? "Loading notifications..." :
                            fetchNotificationsError ? "Error loading notifications" :
                            definedNotifications.length === 0 ? "No notifications found" :
                            "Select a notification"
                          } />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {definedNotifications.map((notif) => (
                          <SelectItem key={notif.id} value={notif.id}>
                            {notif.title || notif.id} {notif.title && <span className="text-xs text-muted-foreground ml-2">({notif.id})</span>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      {fetchNotificationsError 
                        ? <span className="text-destructive">{fetchNotificationsError}</span> 
                        : "Select a notification defined in your Pushcut app."
                      }
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isSubmitting || !pushcutConfig?.apiKey} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="text"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Text</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} disabled={isSubmitting || !pushcutConfig?.apiKey} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen} className="rounded-md border">
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 rounded-t-md">
                    <div className="flex items-center gap-2 font-medium text-sm">
                      <Settings className="h-4 w-4" />
                      <h3>Advanced Options</h3>
                    </div>
                    {isAdvancedOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden">
                  <div className="p-4 pt-2 space-y-4 border-t bg-muted/30 rounded-b-md">
                    <FormField
                      control={form.control}
                      name="sound"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sound</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting || !pushcutConfig?.apiKey}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select a sound" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {PUSHHCUT_SOUND_OPTIONS.map((opt: PushcutSoundOption) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                              <SelectItem value="custom">Custom (enter below)</SelectItem>
                            </SelectContent>
                          </Select>
                          {field.value === 'custom' && (
                             <FormControl>
                               <Input {...field} placeholder="Enter custom sound name" disabled={isSubmitting || !pushcutConfig?.apiKey} />
                             </FormControl>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={form.control}
                      name="devices"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Device</FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            defaultValue={field.value}
                            value={field.value}
                            disabled={isSubmitting || !pushcutConfig?.apiKey || isLoadingDevices}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={
                                  isLoadingDevices ? "Loading devices..." :
                                  fetchDevicesError ? "Error loading devices" :
                                  "Select a device"
                                } />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={ALL_DEVICES_VALUE}>All Devices</SelectItem>
                              {activeDevices.map((device) => (
                                <SelectItem key={device.id} value={device.id}>
                                  {device.id}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs">
                            {fetchDevicesError 
                              ? <span className="text-destructive">{fetchDevicesError}</span> 
                              : "Target a specific device or leave blank for all."
                            }
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="input"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Input</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Value passed to notification action" disabled={isSubmitting || !pushcutConfig?.apiKey} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="image"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Image URL or Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="https://example.com/image.png or ImportedImageName" disabled={isSubmitting || !pushcutConfig?.apiKey} />
                          </FormControl>
                           <FormDescription className="text-xs">
                            URL to an image or name of an image imported in Pushcut.
                            </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="defaultAction"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Default Action (JSON)</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={3} placeholder={'{"name": "Open Link", "url": "https://example.com"}'} disabled={isSubmitting || !pushcutConfig?.apiKey} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            JSON object for the default action.
                            </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={form.control}
                      name="actions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Actions (JSON Array)</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={4} placeholder={'[{\"name\": \"Action 1\", \"input\": \"input1\"}]'} disabled={isSubmitting || !pushcutConfig?.apiKey} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            JSON array of action objects.
                            </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="isTimeSensitive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting || !pushcutConfig?.apiKey} />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Time-Sensitive</FormLabel>
                            <FormDescription className="text-xs">
                              Mark as a time-sensitive notification.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="threadId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Thread ID</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Group related notifications" disabled={isSubmitting || !pushcutConfig?.apiKey} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="delay"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Delay</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="10s, 15m, 1h" disabled={isSubmitting || !pushcutConfig?.apiKey} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Delay execution (e.g., 10s, 5m, 2h). Requires Server Extended subscription.
                            </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </form>
          </Form>
        </div>

        <DialogFooter className="border-t px-6 pt-4 pb-6">
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
            form="pushcut-test-form"
            disabled={isSubmitting || !pushcutConfig?.apiKey || !form.formState.isValid}
            className="w-28"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            ) : (
              <><Send className="h-4 w-4" /> Send</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 