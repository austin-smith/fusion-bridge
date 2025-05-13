'use client';

import { useEffect, useState, useRef } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { savePushoverConfigurationAction, type SavePushoverConfigFormState } from '@/app/(app)/settings/services/actions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import type { PushoverConfig } from '@/data/repositories/service-configurations';
import type { PushoverGroupInfo } from '@/types/pushover-types';
import { AddPushoverUserModal } from './pushover/add-pushover-user-modal';
import { toast } from 'sonner';
import { Eye, EyeOff, Users, RefreshCw, UserPlus, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface ServiceConfigFormProps {
  initialConfig: PushoverConfig | null;
  onTestClick?: () => void;
  isEnabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onSaveSuccess: (savedIsEnabled: boolean) => void;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />} 
      Save
    </Button>
  );
}

export function ServiceConfigForm({ initialConfig, onTestClick, isEnabled, onEnabledChange, onSaveSuccess }: ServiceConfigFormProps) {
  const initialState: SavePushoverConfigFormState = { success: false };
  const [formState, formAction] = useActionState(savePushoverConfigurationAction, initialState);
  const [showApiToken, setShowApiToken] = useState(false);
  const [showGroupKey, setShowGroupKey] = useState(false);
  
  // Group users state
  const [isLoadingGroupInfo, setIsLoadingGroupInfo] = useState(false);
  const [groupInfo, setGroupInfo] = useState<PushoverGroupInfo | null>(null);
  const [groupInfoError, setGroupInfoError] = useState<string | null>(null);
  const [accordionValue, setAccordionValue] = useState<string | undefined>(undefined);
  
  // Modal state
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);

  useEffect(() => {
    if (formState.success && formState.savedIsEnabled !== undefined) {
      toast.success('Pushover Configuration', { description: formState.message || 'Saved successfully.' });
      onSaveSuccess(formState.savedIsEnabled);
    } else if (!formState.success && formState.message) {
      toast.error('Error Saving Configuration', {
        description: formState.message || 'An unexpected error occurred.',
      });
    }
  }, [formState, onSaveSuccess]);

  const fetchGroupInfo = async () => {
    if (!initialConfig) {
      setGroupInfoError("Pushover must be configured before viewing group users.");
      return;
    }

    setIsLoadingGroupInfo(true);
    setGroupInfoError(null);

    try {
      const response = await fetch('/api/services/pushover/group-info');
      const data = await response.json();

      if (response.ok && data.success) {
        setGroupInfo(data.groupInfo);
      } else {
        setGroupInfoError(data.error || 'Failed to fetch group information');
        toast.error('Error fetching group info', {
          description: data.error || 'An unexpected error occurred',
        });
      }
    } catch (err) {
      console.error("Error fetching group info:", err);
      setGroupInfoError('Network error while fetching group information');
      toast.error('Network Error', {
        description: 'Could not connect to the server',
      });
    } finally {
      setIsLoadingGroupInfo(false);
    }
  };

  // Handle accordion state change
  const handleAccordionChange = (value: string) => {
    setAccordionValue(value);
    
    // If accordion is opening and we don't have group info yet, fetch it
    if (value === "users" && !groupInfo && !isLoadingGroupInfo) {
      fetchGroupInfo();
    }
  };

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="isEnabled" value={String(isEnabled)} />

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="apiToken">API Token</Label>
          <div className="relative">
            <Input 
              id="apiToken" 
              name="apiToken" 
              type={showApiToken ? "text" : "password"} 
              defaultValue={initialConfig?.apiToken || ''} 
              placeholder="Enter your Pushover Application API Token"
              required 
              className="w-full pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3 py-2 text-muted-foreground"
              onClick={() => setShowApiToken(!showApiToken)}
              aria-label={showApiToken ? "Hide API token" : "Show API token"}
            >
              {showApiToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {formState.errors?.apiToken && (
            <p className="text-sm text-destructive">
              {formState.errors.apiToken.join(', ')}
            </p>
          )}
        </div>
        
        <div className="grid gap-2">
          <Label htmlFor="groupKey">Group Key</Label>
          <div className="relative">
            <Input 
              id="groupKey" 
              name="groupKey" 
              type={showGroupKey ? "text" : "password"} 
              defaultValue={initialConfig?.groupKey || ''} 
              placeholder="Enter your Pushover Delivery Group Key"
              required
              className="w-full pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3 py-2 text-muted-foreground"
              onClick={() => setShowGroupKey(!showGroupKey)}
              aria-label={showGroupKey ? "Hide group key" : "Show group key"}
            >
              {showGroupKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            This is the key for the Pushover Delivery Group that will receive notifications. See {' '} 
            <a 
              href="https://support.pushover.net/i152-creating-group-based-subscriptions" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline hover:text-primary"
            >
               Pushover documentation
            </a> for details.
          </p>
          {formState.errors?.groupKey && (
            <p className="text-sm text-destructive">
              {formState.errors.groupKey.join(', ')}
            </p>
          )}
        </div>
      </div>

      {/* Group Users Section - Only shown when configuration exists */}
      {initialConfig && (
        <Accordion 
          type="single" 
          collapsible 
          className="w-full border rounded-md"
          value={accordionValue}
          onValueChange={handleAccordionChange}
        >
          <AccordionItem value="users" className="border-b-0">
            <AccordionTrigger className="px-4 py-2 hover:no-underline">
              <div className="flex items-center">
                <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>Group Users</span>
                {groupInfo && (
                  <Badge variant="outline" className="ml-2 bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    {groupInfo.users.length}
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-4">
              {/* Refresh and Group Name Row */}
              <div className="flex justify-between items-center">
                {groupInfo && (
                  <span className="text-sm text-muted-foreground">
                    Group Name: {groupInfo.name}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setIsAddUserModalOpen(true)}
                    disabled={isLoadingGroupInfo} // Disable if loading, or add other conditions
                  >
                    <UserPlus className="h-4 w-4" />
                    Add User
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={fetchGroupInfo} 
                    disabled={isLoadingGroupInfo}
                  >
                    {isLoadingGroupInfo ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {isLoadingGroupInfo ? "Loading..." : "Refresh"}
                  </Button>
                </div>
              </div>

              {/* Users Table or Loading/Error State */}
              {isLoadingGroupInfo ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : groupInfoError ? (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {groupInfoError}
                </div>
              ) : groupInfo && groupInfo.users && groupInfo.users.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupInfo.users.map((user, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          {user.name || user.memo || user.user.substring(0, 8) + '...'}
                          {user.email && <div className="text-xs text-muted-foreground">{user.email}</div>}
                        </TableCell>
                        <TableCell>{user.device || 'All Devices'}</TableCell>
                        <TableCell>
                          {user.disabled ? (
                            <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                              Disabled
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                              Active
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : !groupInfo ? (
                <div className="text-center py-3 text-muted-foreground">
                  Click the refresh button to load group users
                </div>
              ) : (
                <div className="text-center py-3 text-muted-foreground">
                  No users found in this group
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
      
      {formState.errors?._form && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {formState.errors._form.join(', ')}
        </div>
      )}
      
      <div className="mt-6 flex items-center justify-end gap-2">
        {/* Test button - render if onTestClick is provided, disable if no initialConfig */}
        {onTestClick && (
          <Button 
            type="button" 
            variant="outline" 
            onClick={onTestClick}
            size="default"
            disabled={!initialConfig} // Disable if no initialConfig
          >
            Send Test
          </Button>
        )}
        <SubmitButton />
      </div>

      {/* Add User Modal */}
      <AddPushoverUserModal 
        isOpen={isAddUserModalOpen}
        onOpenChange={setIsAddUserModalOpen}
        onUserAdded={() => {
          fetchGroupInfo(); // Refresh group info after user is added
        }}
      />
    </form>
  );
} 