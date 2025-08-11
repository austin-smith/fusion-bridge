'use client';

import { useState, useEffect, ElementRef } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Send, Settings, ChevronDown, ChevronUp, Users } from 'lucide-react';
import type { PushoverConfig } from '@/data/repositories/service-configurations';
import type { ResolvedPushoverMessageParams } from '@/types/pushover-types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
// Import the shared constants
import { priorityOptions } from '@/lib/pushover-constants';

// Define Zod schema for the form
const formSchema = z.object({
  title: z.string().min(1, 'Title is required').default('Test Notification'),
  message: z.string().min(1, 'Message is required').default('This is a test message from Fusion! 🔔 '),
  attachment: z.instanceof(File).optional().nullable()
    .refine(file => !file || file.size <= 5 * 1024 * 1024, `Max file size is 5MB.`), // Validate size
  targetUserKey: z.string().optional().default('__all__'), // __all__ represents the group key
  device: z.string().optional().default(''),
  priority: z.union([
    z.literal(-2),
    z.literal(-1),
    z.literal(0),
    z.literal(1),
    z.literal(2)
  ]).default(0),
  retry: z.string().optional().default('60'), // Keep as string for input, parse later
  expire: z.string().optional().default('3600'), // Keep as string for input, parse later
  format: z.enum(['none', 'html', 'monospace']).default('none'),
  url: z.string().optional().refine(val => !val || z.string().url().safeParse(val).success, "Invalid URL format").default(''),
  urlTitle: z.string().optional().default(''),
  timestampInput: z.string().optional().default(''), // Store datetime-local value
}).refine(data => {
  // Conditional validation for retry/expire based on priority
  if (data.priority === 2) {
    const retryNum = parseInt(data.retry ?? '0', 10);
    const expireNum = parseInt(data.expire ?? '0', 10);
    // Ensure retry is a number >= 30
    if (isNaN(retryNum) || retryNum < 30) return false;
    // Ensure expire is a number > 0 and <= 10800
    if (isNaN(expireNum) || expireNum <= 0 || expireNum > 10800) return false;
  }
  return true;
}, {
  message: 'Retry must be >= 30 and Expire must be between 1 and 10800 for Emergency priority.',
  // Apply message to both fields potentially causing issue
  path: ['retry'], // Can refine this if specific field messages are needed
});

type PushoverTestFormValues = z.infer<typeof formSchema>;

interface PushoverTestModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  pushoverConfig: PushoverConfig | null;
}

// Define a type for the users fetched for the dropdown
interface PushoverUserForSelect {
    user: string; // User key
    memo: string; // Memo for display
    device?: string | null; // Optional specific device
}

export function PushoverTestModal({ isOpen, onOpenChange, pushoverConfig }: PushoverTestModalProps) {
  const [attachmentState, setAttachmentState] = useState<{ file: File | null; base64: string | null; type: string | null }>({ file: null, base64: null, type: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [unixTimestamp, setUnixTimestamp] = useState<number | undefined>(undefined);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isTargetUserSelectOpen, setIsTargetUserSelectOpen] = useState(false);

  // New state for users dropdown
  const [groupUsers, setGroupUsers] = useState<PushoverUserForSelect[]>([]);
  const [isFetchingUsers, setIsFetchingUsers] = useState(false);
  const [fetchUsersError, setFetchUsersError] = useState<string | null>(null);

  const form = useForm<PushoverTestFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: formSchema.parse({}), // Initialize with defaults from schema
    mode: 'onBlur', // Validate on blur instead of change for better UX
  });

  const priorityValue = form.watch('priority');
  const urlValue = form.watch('url');
  const timestampInputValue = form.watch('timestampInput');

  // Effect to update Unix timestamp display
  useEffect(() => {
    if (timestampInputValue) {
      try {
        const date = new Date(timestampInputValue);
        setUnixTimestamp(Math.floor(date.getTime() / 1000));
      } catch (e) {
        setUnixTimestamp(undefined);
      }
    } else {
      setUnixTimestamp(undefined);
    }
  }, [timestampInputValue]);

  // Effect to fetch users when modal opens
  useEffect(() => {
    async function fetchUsers() {
      if (isOpen && pushoverConfig?.groupKey) {
        setIsFetchingUsers(true);
        setFetchUsersError(null);
        setGroupUsers([]); // Clear previous users
        try {
          // Use the existing endpoint
          const response = await fetch('/api/services/pushover/group-users/list');
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to fetch users: ${response.statusText}`);
          }
          const users: PushoverUserForSelect[] = await response.json();
          setGroupUsers(users);
        } catch (error) {
          console.error("Error fetching Pushover group users:", error);
          setFetchUsersError(error instanceof Error ? error.message : "An unknown error occurred while fetching users.");
          toast.error("Failed to load users", { description: error instanceof Error ? error.message : undefined });
        } finally {
          setIsFetchingUsers(false);
        }
      } else if (!isOpen) {
        // Clear users when modal is closed
        setGroupUsers([]);
        setFetchUsersError(null);
        setIsFetchingUsers(false);
      }
    }
    fetchUsers();
  }, [isOpen, pushoverConfig?.groupKey]);

  // Reset form state
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTimeout(() => {
        form.reset();
        setAttachmentState({ file: null, base64: null, type: null });
        setUnixTimestamp(undefined);
        setIsAdvancedOpen(false);
        // Reset user fetching state
        setGroupUsers([]);
        setIsFetchingUsers(false);
        setFetchUsersError(null);
        // Reset select open state
        setIsTargetUserSelectOpen(false);
        const fileInput = document.getElementById('attachment-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        setIsSubmitting(false);
      }, 300);
    }
    onOpenChange(open);
  };

  // Handle form submission
  const onSubmit = async (values: PushoverTestFormValues) => {
    if (!pushoverConfig) {
      toast.error('Pushover configuration is missing.');
      return;
    }

    setIsSubmitting(true);

    let finalTimestamp: number | undefined = undefined;
    if (values.timestampInput) {
      try {
        finalTimestamp = Math.floor(new Date(values.timestampInput).getTime() / 1000);
      } catch (e) { /* Ignore invalid date */ }
    }

    const payload: ResolvedPushoverMessageParams & { attachment_base64?: string; attachment_type?: string } = {
      message: values.message,
      ...(values.title && { title: values.title }),
      ...(values.device && { device: values.device }),
      ...(values.priority !== undefined && values.priority !== 0 && { priority: values.priority }),
      ...(values.url && { url: values.url }),
      ...(values.url && values.urlTitle && { urlTitle: values.urlTitle }),
      ...(finalTimestamp && { timestamp: finalTimestamp }),
      ...(values.format === 'html' && { html: 1 }),
      ...(values.format === 'monospace' && { monospace: 1 }),
    };

    if (values.priority === 2) {
      payload.retry = parseInt(values.retry ?? '60', 10);
      payload.expire = parseInt(values.expire ?? '3600', 10);
    }

    if (attachmentState.base64 && attachmentState.type) {
      payload.attachment_base64 = attachmentState.base64;
      payload.attachment_type = attachmentState.type;
    }

    // Add targetUserKey to the payload if a specific user is selected
    const finalTargetUserKey = values.targetUserKey && values.targetUserKey !== '__all__' ? values.targetUserKey : undefined;

    try {
      const response = await fetch('/api/services/pushover/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...payload, targetUserKey: finalTargetUserKey }), // Add targetUserKey to the payload
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('Test notification sent successfully');
        handleOpenChange(false);
      } else {
        toast.error(`Failed to send test notification: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error sending test notification:', error);
      toast.error('Network error sending test notification');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle file input changes
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    form.setValue('attachment', file, { shouldValidate: true });

    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setAttachmentState({ file: null, base64: null, type: null });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result?.toString().split(',')[1];
        if (base64String) {
          setAttachmentState({ file: file, base64: base64String, type: file.type });
        } else {
          toast.error('Failed to read file.');
          setAttachmentState({ file: null, base64: null, type: null });
        }
      };
      reader.onerror = () => {
        toast.error('Error reading file.');
        setAttachmentState({ file: null, base64: null, type: null });
      };
      reader.readAsDataURL(file);
    } else {
      setAttachmentState({ file: null, base64: null, type: null });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Send Test Pushover Notification</DialogTitle>
          <DialogDescription>
            Send a test notification to verify your Pushover config.
          </DialogDescription>
        </DialogHeader>

        <div className="grow overflow-y-auto px-6 pb-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" id="pushover-test-form">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={isSubmitting} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Message</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} disabled={isSubmitting} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="targetUserKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center">
                        <Users className="h-4 w-4 mr-1.5 text-muted-foreground" /> Target User
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isSubmitting || isFetchingUsers || !!fetchUsersError || !pushoverConfig?.groupKey}
                        open={isTargetUserSelectOpen}
                        onOpenChange={setIsTargetUserSelectOpen}
                      >
                        <FormControl>
                          <SelectTrigger className="text-left">
                            <SelectValue placeholder={
                              isFetchingUsers ? "Loading users..." : 
                              !pushoverConfig?.groupKey ? "Configure group key first" :
                              fetchUsersError ? "Error loading users" : 
                              "Select target user..."
                            }>
                              {field.value === '__all__' 
                                ? <span className="text-sm">All Users</span>
                                : (() => {
                                    const selectedUser = groupUsers.find(u => u.user === field.value);
                                    return (
                                      <span className="text-sm">
                                        {selectedUser 
                                          ? (selectedUser.memo || `User Key: ${selectedUser.user.substring(0, 7)}...`) 
                                          : (field.value && field.value !== '__all__' ? `Key: ${field.value.substring(0, 7)}...` : "Select target user...")
                                        }
                                      </span>
                                    );
                                  })()
                              }
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__all__">
                            <div className="flex flex-col items-start text-left">
                               <span className="font-medium">All Users</span>
                               <span className="text-xs text-muted-foreground">Send to all users in the configured group.</span>
                            </div>
                          </SelectItem>
                          {groupUsers.length > 0 && groupUsers.map(user => (
                            <SelectItem key={user.user} value={user.user}>
                               <div className="flex flex-col items-start text-left">
                                <span className="font-medium">{user.memo || `User Key: ${user.user.substring(0, 7)}...`}</span>
                                {user.memo && <span className="text-xs text-muted-foreground">Key: {user.user.substring(0, 7)}...</span>}
                                {user.device && <span className="text-xs text-muted-foreground">Device: {user.device}</span>}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fetchUsersError && <FormMessage className="text-destructive">{fetchUsersError}</FormMessage>}
                      {isTargetUserSelectOpen && (
                        <FormDescription className="text-xs pt-1">
                          Select a specific user to send the notification to, or send to all users in the group.
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="attachment"
                  render={() => (
                    <FormItem>
                      <FormLabel>Image</FormLabel>
                      <FormControl>
                        <Input
                          id="attachment-input"
                          type="file"
                          accept="image/jpeg, image/png, image/gif"
                          onChange={handleFileChange}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Optional image to include in notification. Max 5MB.
                        <a href="https://pushover.net/api#attachments" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary ml-1">Learn more</a>.
                      </FormDescription>
                      <FormMessage />
                      {attachmentState.file && (
                        <p className="text-sm text-muted-foreground">
                          Selected: {attachmentState.file.name}
                        </p>
                      )}
                    </FormItem>
                  )}
                />
              </div>

              <Collapsible 
                open={isAdvancedOpen} 
                onOpenChange={setIsAdvancedOpen} 
                className="rounded-md border"
              >
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 rounded-t-md">
                    <div className="flex items-center gap-2 font-medium text-sm">
                      <Settings className="h-4 w-4" />
                      <h3>Advanced Options</h3>
                    </div>
                    {isAdvancedOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent 
                  className="overflow-hidden"
                >
                  <div className="p-4 pt-2 space-y-4 border-t bg-muted/30 rounded-b-md">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="device"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Device</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="iphone, work_pc" disabled={isSubmitting} />
                            </FormControl>
                            <FormDescription className="text-xs">
                              Target specific devices or leave blank for all. 
                              <a href="https://pushover.net/api#identifiers" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary ml-1">Learn more</a>.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="priority"
                        render={({ field }) => {
                          // Find the selected option to display its label in the trigger
                          const selectedOption = priorityOptions.find(option => option.value === field.value);

                          return (
                            <FormItem>
                              <FormLabel>Priority</FormLabel>
                              <Select 
                                onValueChange={(value) => field.onChange(parseInt(value, 10))} 
                                defaultValue={field.value.toString()} 
                                disabled={isSubmitting}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    {/* Display only the label of the selected option or placeholder */}
                                    <SelectValue asChild>
                                      <span>{selectedOption ? selectedOption.label : "Select Priority"}</span>
                                    </SelectValue>
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {priorityOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value.toString()}>
                                      <div className="flex flex-col">
                                        <span className="font-medium">{option.label}</span>
                                        <span className="text-xs text-muted-foreground">{option.description}</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormDescription className="text-xs">
                                Affects notification delivery and sound.
                                <a href="https://pushover.net/api#priority" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary ml-1">Learn more</a>.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                    </div>

                    {priorityValue === 2 && (
                      <div className="grid grid-cols-2 gap-4 p-3 border rounded-md bg-destructive/10">
                        <FormField
                          control={form.control}
                          name="retry"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Retry Interval (sec, min 30)</FormLabel>
                              <FormControl>
                                <Input type="number" min="30" step="1" {...field} required disabled={isSubmitting} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="expire"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Expire Time (sec, max 10800)</FormLabel>
                              <FormControl>
                                <Input type="number" min="1" max="10800" step="1" {...field} required disabled={isSubmitting} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}

                    <FormField
                      control={form.control}
                      name="format"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Formatting</FormLabel>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              className="flex space-x-4"
                              disabled={isSubmitting}
                            >
                              <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                  <RadioGroupItem value="none" />
                                </FormControl>
                                <FormLabel className="font-normal">None</FormLabel>
                              </FormItem>
                              <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                  <RadioGroupItem value="html" />
                                </FormControl>
                                <FormLabel className="font-normal">HTML</FormLabel>
                              </FormItem>
                              <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                  <RadioGroupItem value="monospace" />
                                </FormControl>
                                <FormLabel className="font-normal">Monospace</FormLabel>
                              </FormItem>
                            </RadioGroup>
                          </FormControl>
                          <FormDescription className="text-xs">
                            Optionally format message content. 
                            <a href="https://pushover.net/api#html" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary ml-1">Learn more</a>.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Supplementary URL</FormLabel>
                          <FormControl>
                            <Input type="url" {...field} placeholder="https://example.com" disabled={isSubmitting} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Include a clickable link with the message.
                            <a href="https://pushover.net/api#urls" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary ml-1">Learn more</a>.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="urlTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>URL Title</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="URL Title" disabled={isSubmitting || !urlValue} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="timestampInput"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Timestamp</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" {...field} disabled={isSubmitting} />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Sets a specific time for the notification, otherwise uses current time.
                            <a href="https://pushover.net/api#timestamp" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary ml-1">Learn more</a>.
                          </FormDescription>
                          {unixTimestamp && (
                            <FormDescription className="text-xs">
                              Unix: {unixTimestamp}
                            </FormDescription>
                          )}
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
            form="pushover-test-form"
            disabled={isSubmitting || !pushoverConfig || !form.formState.isValid}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span>
              Send
            </span>
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
} 