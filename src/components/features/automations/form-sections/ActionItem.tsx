'use client';

import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  AccordionItem,
  AccordionTrigger,
  AccordionContent
} from "@/components/ui/accordion";
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Trash2, HelpCircle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
    AutomationAction,
    CreateEventActionParamsSchema,
    CreateBookmarkParamsSchema,
    SendHttpRequestActionParamsSchema,
    SetDeviceStateActionParamsSchema,
    SendPushNotificationActionParamsSchema,
} from '@/lib/automation-schemas';
import { AutomationActionType, getActionTitle, getActionIconProps, getActionStyling, formatActionDetail } from '@/lib/automation-types';
import { ActionableState } from '@/lib/mappings/definitions';
import { TokenInserter } from '@/components/features/automations/TokenInserter'; // Adjust path if needed
import { AVAILABLE_AUTOMATION_TOKENS } from '@/lib/automation-tokens';
import { SendHttpRequestActionFields } from './SendHttpRequestActionFields'; // Adjust path as needed
import { ConnectorIcon } from '@/components/features/connectors/connector-icon'; // Adjust path as needed
import { getIconComponentByName } from '@/lib/mappings/presentation'; // Adjust path as needed
import { priorityOptions } from '@/lib/pushover-constants'; // Adjust path as needed
import type { connectors } from '@/data/db/schema';
import type { z } from 'zod'; // Import z
import type { AutomationFormValues } from '../AutomationForm'; // Adjust path as needed

// --- Add constant for the "All Users" value ---
const ALL_USERS_PUSHOVER_VALUE = '__all__';

type ConnectorSelect = typeof connectors.$inferSelect;
type TargetDeviceOption = {
    id: string;
    name: string;
    displayType: string;
    iconName: string;
    areaId?: string | null;
    locationId?: string | null;
};

const descriptionStyles = "text-xs text-muted-foreground mt-1";
const ACTIONABLE_STATE_DISPLAY_MAP: Record<ActionableState, string> = {
    [ActionableState.SET_ON]: "Turn On",
    [ActionableState.SET_OFF]: "Turn Off",
};

// Define InsertableFieldNames here (ideally move to a shared types file later)
export type InsertableFieldNames = 
    | keyof z.infer<typeof CreateEventActionParamsSchema>
    | keyof z.infer<typeof CreateBookmarkParamsSchema>
    | Exclude<keyof z.infer<typeof SendHttpRequestActionParamsSchema>, 'headers'>
    | keyof z.infer<typeof SendPushNotificationActionParamsSchema>
    | `headers.${number}.keyTemplate`
    | `headers.${number}.valueTemplate`;

interface ActionItemProps {
  form: UseFormReturn<AutomationFormValues>;
  index: number;
  fieldItem: Record<"id", string>; // Field item from useFieldArray
  isOpen: boolean; // Whether this specific item accordion is open
  removeAction: (index: number) => void;
  handleInsertToken: (
      fieldName: InsertableFieldNames,
      actionIndex: number,
      token: string,
      context: 'action',
      headerIndex?: number
  ) => void;
  isLoading: boolean;
  // Pass sorted lists directly to avoid re-sorting
  sortedPikoConnectors: Pick<ConnectorSelect, 'id' | 'name' | 'category'>[];
  sortedAvailableTargetDevices: TargetDeviceOption[];
}

export function ActionItem({
  form,
  index,
  fieldItem,
  isOpen,
  removeAction,
  handleInsertToken,
  isLoading,
  sortedPikoConnectors,
  sortedAvailableTargetDevices,
}: ActionItemProps) {
  const actionType = form.watch(`config.actions.${index}.type`);
  const actionParams = form.watch(`config.actions.${index}.params`);

  // State for user selection dropdown (moved to top level)
  const [groupUsers, setGroupUsers] = React.useState<Array<{ user: string; memo: string; device?: string | null }>>([]);
  const [isFetchingUsers, setIsFetchingUsers] = React.useState(false);
  const [fetchUsersError, setFetchUsersError] = React.useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);

  // Fetch users when dropdown is opened (moved to top level)
  React.useEffect(() => {
    if (actionType === AutomationActionType.SEND_PUSH_NOTIFICATION && isDropdownOpen && groupUsers.length === 0 && !isFetchingUsers) {
      const fetchUsers = async () => {
        setIsFetchingUsers(true);
        setFetchUsersError(null);
        try {
          const response = await fetch('/api/services/pushover/group-users/list');
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to fetch users: ${response.statusText}`);
          }
          const users = await response.json();
          setGroupUsers(users);
        } catch (error) {
          console.error("Error fetching Pushover group users:", error);
          setFetchUsersError(error instanceof Error ? error.message : "An unknown error occurred");
        } finally {
          setIsFetchingUsers(false);
        }
      };
      fetchUsers();
    }
  }, [actionType, isDropdownOpen, groupUsers.length, isFetchingUsers]);

  const actionTitle = getActionTitle(actionType);
  const ActionIcon = () => {
    const { icon: IconComponent, className } = getActionIconProps(actionType);
    return <IconComponent className={`${className} mr-2`} />;
  };
  const { bgColor, borderColor } = getActionStyling(actionType);

  const handleActionTypeChange = (value: string) => {
    const newType = value as AutomationAction['type'];
    let newActionParams: AutomationAction['params'];

    // Determine default params based on the new type
    if (newType === AutomationActionType.CREATE_EVENT) { 
        newActionParams = { sourceTemplate: '', captionTemplate: '', descriptionTemplate: '', targetConnectorId: '' };
    } else if (newType === AutomationActionType.CREATE_BOOKMARK) { 
        newActionParams = { nameTemplate: '', descriptionTemplate: '', durationMsTemplate: '5000', tagsTemplate: '', targetConnectorId: '' };
    } else if (newType === AutomationActionType.SEND_HTTP_REQUEST) { 
        newActionParams = { urlTemplate: '', method: 'GET', headers: [], contentType: 'text/plain', bodyTemplate: '' };
    } else if (newType === AutomationActionType.SET_DEVICE_STATE) {
        newActionParams = {
            targetDeviceInternalId: sortedAvailableTargetDevices.length > 0 ? sortedAvailableTargetDevices[0].id : '',
            targetState: ActionableState.SET_ON
        };
    } else if (newType === AutomationActionType.SEND_PUSH_NOTIFICATION) {
        newActionParams = { 
            titleTemplate: '',
            messageTemplate: '',
            targetUserKeyTemplate: ALL_USERS_PUSHOVER_VALUE,
            priority: 0
        };
    } else { 
        console.warn(`Unexpected action type: ${value}. Defaulting to minimal params.`); 
        newActionParams = {} as any; // Fallback, should ideally not happen
    }

    // Update both the type and the params
    // Use setValue for potentially complex nested objects
    form.setValue(`config.actions.${index}.type`, newType, { shouldValidate: true, shouldDirty: true });
    form.setValue(`config.actions.${index}.params`, newActionParams, { shouldValidate: true, shouldDirty: true });
    // field.onChange is not directly suitable here as we need to change both type and params
  };

  return (
      <AccordionItem 
          key={fieldItem.id} 
          value={`action-${index}`} // Value used by the parent Accordion
          className={`${bgColor} border-2 ${borderColor} rounded-md overflow-hidden shadow-sm`}
      >
          <div className="relative">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center w-full pr-14"> {/* Added pr-14 for button space */} 
                      <div className="flex items-center flex-shrink-0">
                          <ActionIcon />
                          <span className="text-sm font-semibold">{actionTitle}</span>
                      </div>
                      {/* Show details when action is collapsed */} 
                      {!isOpen && 
                          <div className="ml-2 overflow-hidden flex-1 w-0 flex items-center">
                              <span className="text-xs text-muted-foreground truncate inline-block w-full">
                                  {formatActionDetail(
                                      actionType, 
                                      actionParams, 
                                      {
                                          connectors: sortedPikoConnectors,
                                          devices: sortedAvailableTargetDevices
                                      },
                                      { includeType: false } // Don't repeat type in summary
                                  )}
                              </span>
                          </div>
                      }
                  </div>
              </AccordionTrigger>
              <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  className="absolute right-12 top-2.5 h-6 w-6 text-destructive hover:bg-destructive/10" // Positioned next to trigger arrow
                  onClick={(e) => {
                      e.stopPropagation(); // Prevent accordion toggle
                      removeAction(index);
                  }}
                  disabled={isLoading}
              >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Delete action</span>
              </Button>
          </div>
          <AccordionContent className="px-4 pb-4 pt-2"> 
              <div className="space-y-4">
                  <FormField 
                      control={form.control}
                      // Use name for validation, but value is handled by Select below
                      name={`config.actions.${index}.type`} 
                      render={({ field, fieldState }) => ( 
                          <FormItem>
                              <FormLabel>Action Type</FormLabel>
                              <FormControl>
                                  <Select
                                      // Use the watched value for the Select's value
                                      value={actionType ?? AutomationActionType.CREATE_EVENT} 
                                      // Use the custom handler to update type and params
                                      onValueChange={handleActionTypeChange}
                                      disabled={isLoading}
                                  >
                                      <SelectTrigger className={cn("w-[220px]", fieldState.error && 'border-destructive')}>
                                          <SelectValue placeholder="Select Action Type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                          {/* Explicitly list available types */} 
                                          <SelectItem value={AutomationActionType.CREATE_BOOKMARK}>{getActionTitle(AutomationActionType.CREATE_BOOKMARK)}</SelectItem>
                                          <SelectItem value={AutomationActionType.CREATE_EVENT}>{getActionTitle(AutomationActionType.CREATE_EVENT)}</SelectItem>
                                          <SelectItem value={AutomationActionType.SEND_HTTP_REQUEST}>{getActionTitle(AutomationActionType.SEND_HTTP_REQUEST)}</SelectItem>
                                          <SelectItem value={AutomationActionType.SET_DEVICE_STATE}>{getActionTitle(AutomationActionType.SET_DEVICE_STATE)}</SelectItem>
                                          <SelectItem value={AutomationActionType.SEND_PUSH_NOTIFICATION}>{getActionTitle(AutomationActionType.SEND_PUSH_NOTIFICATION)}</SelectItem>
                                      </SelectContent>
                                  </Select>
                              </FormControl>
                              <FormMessage />
                          </FormItem>
                      )}
                  />
                  
                  {/* Target Connector for Event and Bookmark */} 
                  {(actionType === AutomationActionType.CREATE_EVENT || actionType === AutomationActionType.CREATE_BOOKMARK) && (
                      <FormField
                          control={form.control}
                          name={`config.actions.${index}.params.targetConnectorId`}
                          render={({ field, fieldState }) => {
                              const selectedConnector = sortedPikoConnectors.find(c => c.id === field.value);
                              return (
                                  <FormItem>
                                      <FormLabel>Target Connector</FormLabel>
                                      <FormControl>
                                          <Select 
                                              onValueChange={field.onChange} 
                                              value={field.value ?? ''} 
                                              disabled={isLoading}
                                          >
                                              <SelectTrigger className={cn("flex items-center w-[220px]", fieldState.error && 'border-destructive')}>
                                                  <SelectValue placeholder="Select Target Connector">
                                                      {selectedConnector && (
                                                          <div className="flex items-center gap-2">
                                                              <ConnectorIcon 
                                                                  connectorCategory={selectedConnector.category} 
                                                                  size={18} 
                                                                  className="mr-1 flex-shrink-0"
                                                              />
                                                              <span className="truncate">{selectedConnector.name}</span>
                                                          </div>
                                                      )} 
                                                      {!selectedConnector && "Select Target Connector"}
                                                  </SelectValue>
                                              </SelectTrigger>
                                              <SelectContent>
                                                  {sortedPikoConnectors.map(connector => (
                                                      <SelectItem 
                                                          key={connector.id} 
                                                          value={connector.id}
                                                          className="flex items-center py-1.5"
                                                      >
                                                          <div className="flex items-center gap-2">
                                                              <ConnectorIcon 
                                                                  connectorCategory={connector.category} 
                                                                  size={16} 
                                                                  className="flex-shrink-0"
                                                              />
                                                              <span className="font-medium">{connector.name}</span>
                                                          </div>
                                                      </SelectItem>
                                                  ))}
                                                  
                                                  {sortedPikoConnectors.length === 0 && (
                                                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                                          No Piko connectors found
                                                      </div>
                                                  )}
                                              </SelectContent>
                                          </Select>
                                      </FormControl>
                                      <FormDescription className={descriptionStyles}>
                                          {actionType === AutomationActionType.CREATE_EVENT 
                                              ? 'Select the Piko system to create an event in.'
                                              : 'Select the Piko system to create a bookmark in.'}
                                      </FormDescription>
                                      <FormMessage />
                                  </FormItem>
                              );
                          }}
                      />
                  )}
                  
                  {/* Parameters section */}
                  <div className={`space-y-2 border-l-2 pl-4 ml-1 rounded-sm p-2 mt-2 bg-white/50 dark:bg-black/10 ${borderColor}`}>
                      <h3 className="text-sm font-medium text-muted-foreground mb-2">Action Parameters</h3>
                      <p className="text-xs text-muted-foreground mb-2"> 
                          {actionType === AutomationActionType.CREATE_BOOKMARK && "Creates a bookmark on related Piko cameras."}
                          {actionType === AutomationActionType.CREATE_EVENT && "Creates an event in the target Piko system."}
                          {actionType === AutomationActionType.SEND_HTTP_REQUEST && "Sends an HTTP request."}
                          {actionType === AutomationActionType.SET_DEVICE_STATE && "Changes the state of a specified device (e.g., turn on/off)."}
                          {actionType === AutomationActionType.SEND_PUSH_NOTIFICATION && "Sends a push notification via the Pushover service."}
                          {!Object.values(AutomationActionType).includes(actionType as any) && "Select an action type to see parameters."}
                      </p>
                      
                      {/* Action type specific fields */} 
                      {actionType === AutomationActionType.CREATE_EVENT && (
                          <>
                              <FormField control={form.control} name={`config.actions.${index}.params.sourceTemplate`} render={({ field, fieldState }) => (
                                  <FormItem>
                                      <div className="flex items-center justify-between">
                                          <FormLabel>Source</FormLabel>
                                          <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('sourceTemplate', index, token, 'action')} />
                                      </div>
                                      <FormControl><Input placeholder="Fusion" {...field} value={field.value ?? ''} disabled={isLoading} className={cn("w-full max-w-xs", fieldState.error && 'border-destructive')} /></FormControl>
                                      <FormMessage />
                                  </FormItem>
                              )} />
                              <FormField control={form.control} name={`config.actions.${index}.params.captionTemplate`} render={({ field, fieldState }) => (
                                  <FormItem>
                                      <div className="flex items-center justify-between">
                                          <FormLabel>Caption</FormLabel>
                                          <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('captionTemplate', index, token, 'action')} />
                                      </div>
                                      <FormControl><Textarea placeholder="Device: {{device.name}} // Event: {{event.data.state}} at {{event.time}}" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
                                      <FormMessage />
                                  </FormItem>
                              )} />
                              <FormField control={form.control} name={`config.actions.${index}.params.descriptionTemplate`} render={({ field, fieldState }) => (
                                  <FormItem>
                                      <div className="flex items-center justify-between">
                                          <FormLabel>Description</FormLabel>
                                          <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('descriptionTemplate', index, token, 'action')} />
                                      </div>
                                      <FormControl><Textarea placeholder="Device: {{event.deviceId}} // Type: {{event.event}} // State: {{event.data.state}}" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
                                      <FormMessage />
                                  </FormItem>
                              )} />
                          </>
                      )}
                      
                      {actionType === AutomationActionType.CREATE_BOOKMARK && (
                          <>
                              <FormField control={form.control} name={`config.actions.${index}.params.nameTemplate`} render={({ field, fieldState }) => (
                                  <FormItem>
                                      <div className="flex items-center justify-between">
                                          <FormLabel>Name</FormLabel>
                                          <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('nameTemplate', index, token, 'action')}/>
                                      </div>
                                      <FormControl><Input placeholder="e.g., Alert: {{device.name}}" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
                                      <FormMessage />
                                  </FormItem>
                              )} />
                              <FormField control={form.control} name={`config.actions.${index}.params.descriptionTemplate`} render={({ field, fieldState }) => (
                                  <FormItem>
                                      <div className="flex items-center justify-between">
                                          <FormLabel>Description</FormLabel>
                                          <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('descriptionTemplate', index, token, 'action')}/>
                                      </div>
                                      <FormControl><Textarea placeholder="e.g., Device: {{device.name}} triggered event {{event.event}}" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
                                      <FormMessage />
                                  </FormItem>
                              )} />
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <FormField control={form.control} name={`config.actions.${index}.params.durationMsTemplate`} render={({ field, fieldState }) => (
                                      <FormItem>
                                          <FormLabel>Duration (ms)</FormLabel>
                                          <FormControl>
                                              <Input 
                                                  type="number" 
                                                  min="0" 
                                                  step="1" 
                                                  placeholder="e.g., 5000" 
                                                  {...field}
                                                  value={field.value ?? ''} 
                                                  onChange={(e) => {
                                                      const value = e.target.value;
                                                      // Allow empty string or positive numbers
                                                      if (value === '' || /^[0-9]+$/.test(value)) {
                                                          field.onChange(value);
                                                      }
                                                  }}
                                                  disabled={isLoading} 
                                                  className={cn(fieldState.error && 'border-destructive')} 
                                              />
                                          </FormControl>
                                          <FormDescription className={descriptionStyles}>Duration in milliseconds.</FormDescription>
                                          <FormMessage />
                                      </FormItem>
                                  )} />
                                  <FormField control={form.control} name={`config.actions.${index}.params.tagsTemplate`} render={({ field, fieldState }) => (
                                      <FormItem>
                                          <FormLabel>Tags</FormLabel>
                                          <FormControl>
                                              <Input
                                                  placeholder="e.g., Alert,{{device.type}},Automation"
                                                  {...field}
                                                  value={field.value ?? ''}
                                                  disabled={isLoading}
                                                  className={cn(fieldState.error && 'border-destructive')}
                                              />
                                          </FormControl>
                                          <FormDescription className={descriptionStyles}>Enter tags separated by commas.</FormDescription>
                                          <FormMessage />
                                      </FormItem>
                                  )} />
                              </div>
                          </>
                      )}
                      
                      {actionType === AutomationActionType.SEND_HTTP_REQUEST && (
                          <SendHttpRequestActionFields 
                              form={form} // Pass form down
                              actionIndex={index} 
                              handleInsertToken={(fieldName, actIndex, token, headerIndex) => {
                                  // Pass token insertion up to the main handler
                                  handleInsertToken(fieldName, actIndex, token, 'action', headerIndex);
                              }}
                          /> 
                      )}
                      
                      {actionType === AutomationActionType.SET_DEVICE_STATE && (
                          <>
                              <div className="flex flex-col space-y-2 mt-2">
                                  <FormLabel className="mb-1 mt-2">Device Control Flow</FormLabel>
                                  <div className="flex items-center space-x-2">
                                      <FormField
                                          control={form.control}
                                          name={`config.actions.${index}.params.targetDeviceInternalId`}
                                          render={({ field, fieldState }) => (
                                              <FormItem className="flex-grow-0 m-0">
                                                  <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isLoading}>
                                                      <FormControl>
                                                          <SelectTrigger className={cn("w-[250px]", fieldState.error && 'border-destructive')}>
                                                              <SelectValue placeholder="Select Device..." />
                                                          </SelectTrigger>
                                                      </FormControl>
                                                      <SelectContent>
                                                          {sortedAvailableTargetDevices.map(device => {
                                                              const IconComponent = getIconComponentByName(device.iconName) || HelpCircle;
                                                              return (
                                                                  <SelectItem key={device.id} value={device.id}>
                                                                      <div className="flex items-center">
                                                                          <IconComponent className="h-4 w-4 mr-2 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                                                                          <span>{device.name}</span>
                                                                      </div>
                                                                  </SelectItem>
                                                              );
                                                          })}
                                                          {sortedAvailableTargetDevices.length === 0 && (
                                                              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                                                  No controllable devices found.
                                                              </div>
                                                          )}
                                                      </SelectContent>
                                                  </Select>
                                                  <FormMessage />
                                              </FormItem>
                                          )}
                                      />
                                      
                                      <div className="flex items-center text-muted-foreground">
                                          <span className="text-lg">→</span>
                                      </div>
                                      
                                      <FormField
                                          control={form.control}
                                          name={`config.actions.${index}.params.targetState`}
                                          render={({ field, fieldState }) => (
                                              <FormItem className="flex-grow-0 m-0">
                                                  <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isLoading}>
                                                      <FormControl>
                                                          <SelectTrigger className={cn("w-[120px]", fieldState.error && 'border-destructive')}>
                                                              <SelectValue placeholder="Select State..." />
                                                          </SelectTrigger>
                                                      </FormControl>
                                                      <SelectContent>
                                                          {Object.entries(ACTIONABLE_STATE_DISPLAY_MAP).map(([value, label]) => (
                                                              <SelectItem key={value} value={value}>{label}</SelectItem>
                                                          ))}
                                                      </SelectContent>
                                                  </Select>
                                                  <FormMessage />
                                              </FormItem>
                                          )}
                                      />
                                  </div>
                                  <FormDescription className={descriptionStyles}>
                                      Select the device to control and the state to set it to.
                                  </FormDescription>
                              </div>
                          </>
                      )}
                      
                      {actionType === AutomationActionType.SEND_PUSH_NOTIFICATION && (
                          <>
                              <FormField 
                                  control={form.control}
                                  name={`config.actions.${index}.params.titleTemplate`}
                                  render={({ field, fieldState }) => (
                                      <FormItem>
                                          <div className="flex items-center justify-between">
                                              <FormLabel>Title</FormLabel>
                                              <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('titleTemplate', index, token, 'action')} />
                                          </div>
                                          <FormControl><Input placeholder="Notification title" {...field} value={field.value ?? ''} disabled={isLoading} className={cn("w-full", fieldState.error && 'border-destructive')} /></FormControl>
                                          <FormDescription className={descriptionStyles}>Optional title for the notification.</FormDescription>
                                          <FormMessage />
                                      </FormItem>
                                  )}
                              />

                              <FormField 
                                  control={form.control}
                                  name={`config.actions.${index}.params.messageTemplate`}
                                  render={({ field, fieldState }) => (
                                      <FormItem>
                                          <div className="flex items-center justify-between">
                                              <FormLabel>Message</FormLabel>
                                              <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('messageTemplate', index, token, 'action')} />
                                          </div>
                                          <FormControl><Textarea placeholder="Notification message content" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
                                          <FormDescription className={descriptionStyles}>The main content of the notification.</FormDescription>
                                          <FormMessage />
                                      </FormItem>
                                  )}
                              />
                              
                              <FormField 
                                  control={form.control}
                                  name={`config.actions.${index}.params.targetUserKeyTemplate`}
                                  render={({ field, fieldState }) => {
                                      // Find selected user info for display
                                      const currentSelectedUser = (field.value && field.value !== ALL_USERS_PUSHOVER_VALUE) ? groupUsers.find(u => u.user === field.value) : null;
                                      
                                      return (
                                          <FormItem>
                                              <FormLabel className="flex items-center">
                                                  <Users className="h-4 w-4 mr-1.5 text-muted-foreground" /> Target User
                                              </FormLabel>
                                              <Select
                                                  onValueChange={field.onChange}
                                                  value={field.value || ALL_USERS_PUSHOVER_VALUE} 
                                                  disabled={isLoading || isFetchingUsers}
                                                  open={isDropdownOpen}
                                                  onOpenChange={setIsDropdownOpen}
                                              >
                                                  <FormControl>
                                                      <SelectTrigger className={cn("text-left w-[220px]", fieldState.error && 'border-destructive')}>
                                                          <SelectValue placeholder={
                                                              isFetchingUsers ? "Loading users..." : 
                                                              fetchUsersError ? "Error loading users" : 
                                                              "Select target user..."
                                                          }>
                                                              {!field.value || field.value === ALL_USERS_PUSHOVER_VALUE
                                                                  ? <span className="text-sm">All Users</span>
                                                                  : <span className="text-sm">
                                                                        {currentSelectedUser 
                                                                            ? (currentSelectedUser.memo || `User Key: ${currentSelectedUser.user.substring(0, 7)}...`) 
                                                                            : `Key: ${(field.value || '').substring(0, 7)}...`
                                                                        }
                                                                    </span>
                                                              }
                                                          </SelectValue>
                                                      </SelectTrigger>
                                                  </FormControl>
                                                  <SelectContent>
                                                      <SelectItem value={ALL_USERS_PUSHOVER_VALUE}>
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
                                                      {isFetchingUsers && (
                                                          <div className="flex items-center justify-center p-2">
                                                              <span className="text-sm text-muted-foreground">Loading users...</span>
                                                          </div>
                                                      )}
                                                      {fetchUsersError && (
                                                          <div className="p-2 text-sm text-destructive">
                                                              Error: {fetchUsersError}
                                                          </div>
                                                      )}
                                                  </SelectContent>
                                              </Select>
                                              {fetchUsersError && <FormMessage className="text-destructive">{fetchUsersError}</FormMessage>}
                                              <FormDescription className={descriptionStyles}>
                                                  Select a specific user to send to, or leave empty to send to all users in the group.
                                              </FormDescription>
                                              <FormMessage />
                                          </FormItem>
                                      );
                                  }}
                              />

                              <FormField 
                                  control={form.control}
                                  name={`config.actions.${index}.params.priority`}
                                  render={({ field, fieldState }) => {
                                      const selectedOption = priorityOptions.find(option => option.value === field.value);
                                      return (
                                          <FormItem>
                                              <FormLabel>Priority</FormLabel>
                                              <Select 
                                                  onValueChange={(value) => field.onChange(parseInt(value, 10))} 
                                                  // Ensure value is a string for the Select component
                                                  value={field.value?.toString() ?? '0'} 
                                                  disabled={isLoading}
                                              >
                                                  <FormControl>
                                                      <SelectTrigger className={cn("w-[220px]", fieldState.error && 'border-destructive')}>
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
                                              <FormDescription className={descriptionStyles}>
                                                  Affects notification delivery and sound.
                                              </FormDescription>
                                              <FormMessage />
                                          </FormItem>
                                      );
                                  }}
                              />
                          </>
                      )}
                  </div>
              </div>
          </AccordionContent>
      </AccordionItem>
  );
} 