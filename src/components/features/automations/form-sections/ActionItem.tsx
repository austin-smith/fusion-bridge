'use client';

import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
} from "@/components/ui/form";
import { Trash2, HelpCircle, Users, ShieldCheck, ShieldOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
    AutomationAction,
    CreateEventActionParamsSchema,
    CreateBookmarkParamsSchema,
    SendHttpRequestActionParamsSchema,
    SetDeviceStateActionParamsSchema,
    SendPushNotificationActionParamsSchema,
    ArmAlarmZoneActionParamsSchema,
    DisarmAlarmZoneActionParamsSchema,
} from '@/lib/automation-schemas';
import { AutomationActionType, getActionTitle, getActionIconProps, getActionStyling, formatActionDetail, AutomationTriggerType } from '@/lib/automation-types';
import { ActionableState, ArmedState } from '@/lib/mappings/definitions';
import { TokenInserter } from '@/components/features/automations/TokenInserter';
import { AVAILABLE_AUTOMATION_TOKENS } from '@/lib/automation-tokens';
import { SendHttpRequestActionFields } from './SendHttpRequestActionFields';
import { ConnectorIcon } from '@/components/features/connectors/connector-icon';
import { getIconComponentByName } from '@/lib/mappings/presentation';
import { priorityOptions } from '@/lib/pushover-constants';
import type { connectors, alarmZones } from '@/data/db/schema';
import type { z } from 'zod';
import type { AutomationFormValues } from '../AutomationForm';
import { MultiSelectComboBox } from '@/components/ui/multi-select-combobox';

const ALL_USERS_PUSHOVER_VALUE = '__all__';

const ZONE_SCOPING_OPTIONS = [
    { value: 'ALL_ZONES_IN_SCOPE', label: "All Zones in Scope" },
    { value: 'SPECIFIC_ZONES', label: "Specific Zones" },
];

// Action type groups for better organization
const ACTION_GROUPS = [
    {
        id: 'video-camera',
        label: 'Video',
        actions: [AutomationActionType.CREATE_EVENT, AutomationActionType.CREATE_BOOKMARK]
    },
    {
        id: 'alarm',
        label: 'Alarm',
        actions: [AutomationActionType.ARM_ALARM_ZONE, AutomationActionType.DISARM_ALARM_ZONE]
    },
    {
        id: 'device-control',
        label: 'Device Control',
        actions: [AutomationActionType.SET_DEVICE_STATE]
    },
    {
        id: 'other',
        label: 'Other',
        actions: [AutomationActionType.SEND_PUSH_NOTIFICATION, AutomationActionType.SEND_HTTP_REQUEST]
    }
] as const;

type ConnectorSelect = typeof connectors.$inferSelect;
type TargetDeviceOption = {
    id: string;
    name: string;
    displayType: string;
    iconName: string;
    spaceId?: string | null;
    locationId?: string | null;
};

type ZoneOption = Pick<typeof alarmZones.$inferSelect, 'id' | 'name' | 'locationId'>;

const descriptionStyles = "text-xs text-muted-foreground mt-1";
const ACTIONABLE_STATE_DISPLAY_MAP: Record<ActionableState, string> = {
    [ActionableState.SET_ON]: "Turn On",
    [ActionableState.SET_OFF]: "Turn Off",
};

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
  fieldItem: Record<"id", string>;
  isOpen: boolean;
  triggerType: AutomationTriggerType;
  removeAction: (index: number) => void;
  handleInsertToken: (
      fieldName: InsertableFieldNames,
      actionIndex: number,
      token: string,
      context: 'action',
      headerIndex?: number
  ) => void;
  isLoading: boolean;
  sortedPikoConnectors: Pick<ConnectorSelect, 'id' | 'name' | 'category'>[];
  sortedAvailableTargetDevices: TargetDeviceOption[];
  sortedAvailableZones: ZoneOption[];
  currentRuleLocationScope?: { id: string; name: string } | null;
}

export function ActionItem({
  form,
  index,
  fieldItem,
  isOpen,
  triggerType,
  removeAction,
  handleInsertToken,
  isLoading,
  sortedPikoConnectors,
  sortedAvailableTargetDevices,
  sortedAvailableZones,
  currentRuleLocationScope,
}: ActionItemProps) {
  const actionType = form.watch(`config.actions.${index}.type`);
  const actionParams = form.watch(`config.actions.${index}.params`);
  const currentScoping = form.watch(`config.actions.${index}.params.scoping`);

  const [groupUsers, setGroupUsers] = React.useState<Array<{ user: string; memo: string; device?: string | null }>>([]);
  const [isFetchingUsers, setIsFetchingUsers] = React.useState(false);
  const [fetchUsersError, setFetchUsersError] = React.useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);

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

  const ActionIcon = () => {
    const { icon: IconComponent, className } = getActionIconProps(actionType);
    return <IconComponent className={`${className} mr-2`} />;
  };
  const { bgColor, borderColor } = getActionStyling(actionType);

  const handleActionTypeChange = (value: string) => {
    const newType = value as AutomationAction['type'];
    let newActionParams: AutomationAction['params'];

    if (newType === AutomationActionType.CREATE_EVENT) { 
        newActionParams = { sourceTemplate: '', captionTemplate: '', descriptionTemplate: '', targetConnectorId: '' };
    } else if (newType === AutomationActionType.CREATE_BOOKMARK) { 
        newActionParams = { nameTemplate: '', descriptionTemplate: '', durationMsTemplate: '5000', tagsTemplate: '', targetConnectorId: '' };
    } else if (newType === AutomationActionType.SEND_HTTP_REQUEST) { 
        newActionParams = { urlTemplate: '', method: 'GET', headers: [], contentType: 'application/json', bodyTemplate: '' };
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
    } else if (newType === AutomationActionType.ARM_ALARM_ZONE) {
        newActionParams = {
            scoping: 'ALL_ZONES_IN_SCOPE',
            targetZoneIds: []
        } as z.infer<typeof ArmAlarmZoneActionParamsSchema>;
    } else if (newType === AutomationActionType.DISARM_ALARM_ZONE) {
        newActionParams = {
            scoping: 'ALL_ZONES_IN_SCOPE',
            targetZoneIds: []
        } as z.infer<typeof DisarmAlarmZoneActionParamsSchema>;
    } else { 
        console.warn(`Unexpected action type: ${value}. Defaulting to minimal params.`); 
        newActionParams = {} as any;
    }

    form.setValue(`config.actions.${index}.type`, newType, { shouldValidate: true, shouldDirty: true });
    form.setValue(`config.actions.${index}.params`, newActionParams, { shouldValidate: true, shouldDirty: true });
  };

  const availableActionTypes = React.useMemo(() => {
    const allTypes = Object.values(AutomationActionType);
    if (triggerType === AutomationTriggerType.SCHEDULED) {
        return allTypes.filter(type => 
            type === AutomationActionType.ARM_ALARM_ZONE || 
            type === AutomationActionType.DISARM_ALARM_ZONE
        );
    }
    return allTypes;
  }, [triggerType]);

  const zoneOptionsForSelect = React.useMemo(() => 
    (sortedAvailableZones || []).map(zone => ({ value: zone.id, label: zone.name }))
  , [sortedAvailableZones]);

  return (
      <AccordionItem 
          key={fieldItem.id} 
          value={`action-${index}`}
          className={`${bgColor} border-2 ${borderColor} rounded-md shadow-sm`}
      >
                    <div className="relative">
              <AccordionTrigger className="w-full p-0 hover:no-underline pr-6">
                  <div className="flex items-center w-full px-4 py-3 pr-14">
                      <div className="flex items-center flex-shrink-0">
                          <div className="flex items-center gap-1">
                              <ActionIcon />
                              <span className="text-sm font-semibold">{getActionTitle(actionType)}</span>
                          </div>
                      </div>
                      <div className="ml-2 overflow-hidden flex-1 min-w-0 flex items-center">
                          <span className={`text-xs text-muted-foreground truncate inline-block w-full transition-opacity duration-200 ${isOpen ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
                              {formatActionDetail(
                                  actionType, 
                                  actionParams, 
                                  {
                                      connectors: sortedPikoConnectors,
                                      devices: sortedAvailableTargetDevices,
                                      alarmZones: sortedAvailableZones || [],
                                      ruleLocationScope: currentRuleLocationScope,
                                  },
                                  { includeType: false }
                              )}
                          </span>
                      </div>
                  </div>
              </AccordionTrigger>
              <div className="absolute left-4 top-[10px] z-20">
                  <Select
                      value={actionType ?? availableActionTypes[0]}
                      onValueChange={handleActionTypeChange}
                      disabled={isLoading}
                  >
                      <SelectTrigger className={`text-sm font-semibold gap-1 flex items-center cursor-pointer border-none shadow-none p-0 h-[24px] bg-transparent hover:bg-transparent focus:ring-0 ${!isOpen ? '[&>svg]:hidden' : ''}`}>
                          <div className="flex items-center gap-1 opacity-0 pointer-events-none">
                              <ActionIcon />
                              <span>{getActionTitle(actionType)}</span>
                          </div>
                      </SelectTrigger>
                      <SelectContent>
                              {availableActionTypes.length === 0 ? (
                                  <div className="px-2 py-1.5 text-sm text-muted-foreground text-center">
                                      No actions available for this trigger type.
                                  </div>
                              ) : (
                                  ACTION_GROUPS.map(group => {
                                      const groupActions = group.actions.filter(action => 
                                          availableActionTypes.includes(action)
                                      );
                                      
                                      if (groupActions.length === 0) return null;
                                      
                                      return (
                                          <SelectGroup key={group.id}>
                                              <SelectLabel className="py-2 px-1 text-xs font-medium text-muted-foreground">
                                                  {group.label}
                                              </SelectLabel>
                                              {groupActions.map(type => {
                                                  const { icon: IconComponent } = getActionIconProps(type);
                                                  return (
                                                      <SelectItem key={type} value={type} className="pl-6">
                                                          <div className="flex items-center gap-2">
                                                              <IconComponent className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                              <span>{getActionTitle(type)}</span>
                                                          </div>
                                                      </SelectItem>
                                                  );
                                              })}
                                          </SelectGroup>
                                      );
                                  })
                              )}
                          </SelectContent>
                      </Select>
                  </div>
              <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  className="absolute right-10 top-2.5 h-6 w-6 text-destructive hover:bg-destructive/10 z-10"
                  onClick={(e) => {
                      e.stopPropagation();
                      removeAction(index);
                  }}
                  disabled={isLoading}
              >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Delete action</span>
              </Button>
          </div>
          <AccordionContent className="px-4 pb-4 pt-2">
              <div className="space-y-4 [&>*>*]:space-y-1">
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
                                  </FormItem>
                              );
                          }}
                      />
                  )}
                  
                  <div className={`space-y-2 border-l-2 pl-4 ml-1 rounded-sm p-2 mt-2 bg-white/50 dark:bg-black/10 ${borderColor}`}>
                      <h3 className="text-sm font-medium text-muted-foreground mb-2">Action Parameters</h3>
                      <p className="text-xs text-muted-foreground mb-2"> 
                          {actionType === AutomationActionType.CREATE_BOOKMARK && "Creates a bookmark on related Piko cameras."}
                          {actionType === AutomationActionType.CREATE_EVENT && "Creates an event in the target Piko system."}
                          {actionType === AutomationActionType.SEND_HTTP_REQUEST && "Sends an HTTP request."}
                          {actionType === AutomationActionType.SET_DEVICE_STATE && "Changes the state of a specified device (e.g., turn on/off)."}
                          {actionType === AutomationActionType.SEND_PUSH_NOTIFICATION && "Sends a push notification via the Pushover service."}
                          {actionType === AutomationActionType.ARM_ALARM_ZONE && "Arms one or more alarm zones, either specific ones or all within the rule's scope."}
                          {actionType === AutomationActionType.DISARM_ALARM_ZONE && "Disarms one or more alarm zones, either specific ones or all within the rule's scope."}
                          {!Object.values(AutomationActionType).includes(actionType as any) && "Select an action type to see parameters."}
                      </p>
                      
                      {actionType === AutomationActionType.CREATE_EVENT && (
                        <>
                              <FormField control={form.control} name={`config.actions.${index}.params.sourceTemplate`} render={({ field, fieldState }) => (
                                  <FormItem className="space-y-1">
                                      <div className="flex items-center justify-between">
                                          <FormLabel>Source</FormLabel>
                                          <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('sourceTemplate', index, token, 'action')} />
                                      </div>
                                      <FormControl><Input placeholder="Fusion" {...field} value={field.value ?? ''} disabled={isLoading} className={cn("w-full max-w-xs", fieldState.error && 'border-destructive')} /></FormControl>
                                  </FormItem>
                              )} />
                              <FormField control={form.control} name={`config.actions.${index}.params.captionTemplate`} render={({ field, fieldState }) => (
                                  <FormItem className="space-y-1">
                                      <div className="flex items-center justify-between">
                                          <FormLabel>Caption</FormLabel>
                                          <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('captionTemplate', index, token, 'action')} />
                                      </div>
                                      <FormControl><Textarea placeholder="Device: {{device.name}} // Event: {{event.displayState}} at {{event.timestamp}}" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
                                  </FormItem>
                              )} />
                              <FormField control={form.control} name={`config.actions.${index}.params.descriptionTemplate`} render={({ field, fieldState }) => (
                                  <FormItem>
                                      <div className="flex items-center justify-between">
                                          <FormLabel>Description</FormLabel>
                                          <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('descriptionTemplate', index, token, 'action')} />
                                      </div>
                                      <FormControl><Textarea placeholder="Device: {{device.externalId}} // Type: {{event.type}} // State: {{event.displayState}}" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
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
                                  </FormItem>
                              )} />
                              <FormField control={form.control} name={`config.actions.${index}.params.descriptionTemplate`} render={({ field, fieldState }) => (
                                  <FormItem>
                                      <div className="flex items-center justify-between">
                                          <FormLabel>Description</FormLabel>
                                          <TokenInserter tokens={AVAILABLE_AUTOMATION_TOKENS} onInsert={(token) => handleInsertToken('descriptionTemplate', index, token, 'action')}/>
                                      </div>
                                      <FormControl><Textarea placeholder="e.g., Device: {{device.name}} triggered event {{event.event}}" {...field} value={field.value ?? ''} disabled={isLoading} className={cn(fieldState.error && 'border-destructive')} /></FormControl>
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
                                                      if (value === '' || /^[0-9]+$/.test(value)) {
                                                          field.onChange(value);
                                                      }
                                                  }}
                                                  disabled={isLoading} 
                                                  className={cn(fieldState.error && 'border-destructive')} 
                                              />
                                          </FormControl>
                                          <FormDescription className={descriptionStyles}>Duration in milliseconds.</FormDescription>
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
                                      </FormItem>
                                  )} />
                              </div>
                          </>
                      )}
                      
                      {actionType === AutomationActionType.SEND_HTTP_REQUEST && (
                          <SendHttpRequestActionFields 
                              form={form}
                              actionIndex={index} 
                              handleInsertToken={(fieldName, actIndex, token, headerIndex) => {
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
                                      </FormItem>
                                  )}
                              />
                              
                              <FormField 
                                  control={form.control}
                                  name={`config.actions.${index}.params.targetUserKeyTemplate`}
                                  render={({ field, fieldState }) => {
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
                                                          <SelectValue placeholder={isFetchingUsers ? "Loading users..." : fetchUsersError ? "Error loading users" : "Select target user..."}>
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
                                              <FormDescription className={descriptionStyles}>
                                                  Select a specific user to send to, or leave empty to send to all users in the group.
                                              </FormDescription>
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
                                          </FormItem>
                                      );
                                  }}
                              />
                          </>
                      )}
                      
                      {/* === ARM ALARM ZONE FIELDS === */} 
                      {actionType === AutomationActionType.ARM_ALARM_ZONE && (
                          <>
                              <FormField
                                  control={form.control}
                                  name={`config.actions.${index}.params.scoping`}
                                  render={({ field }) => (
                                      <FormItem className="space-y-3">
                                          <FormLabel>Zone Scoping</FormLabel>
                                          <FormControl>
                                              <RadioGroup
                                                  onValueChange={field.onChange}
                                                  defaultValue={field.value}
                                                  className="flex flex-col space-y-1"
                                                  disabled={isLoading}
                                              >
                                                  {ZONE_SCOPING_OPTIONS.map(option => (
                                                      <FormItem key={option.value} className="flex items-center space-x-3 space-y-0">
                                                          <FormControl>
                                                              <RadioGroupItem value={option.value} />
                                                          </FormControl>
                                                          <FormLabel className="font-normal">
                                                              {option.label}
                                                          </FormLabel>
                                                      </FormItem>
                                                  ))}
                                              </RadioGroup>
                                          </FormControl>
                                      </FormItem>
                                  )}
                              />

                              {currentScoping === 'SPECIFIC_ZONES' && (
                                  <FormField
                                      control={form.control}
                                      name={`config.actions.${index}.params.targetZoneIds`}
                                      render={({ field, fieldState }) => (
                                          <FormItem>
                                              <FormLabel className="mr-2">Target Zones</FormLabel>
                                              <FormControl>
                                                <MultiSelectComboBox
                                                    options={zoneOptionsForSelect}
                                                    selected={field.value || []}
                                                    onChange={field.onChange}
                                                    placeholder="Select zones..."
                                                    className={cn("w-full max-w-md", fieldState.error && 'border-destructive')}
                                                    disabled={isLoading || zoneOptionsForSelect.length === 0}
                                                />
                                              </FormControl>
                                              {zoneOptionsForSelect.length === 0 && (
                                                <FormDescription className={descriptionStyles}>
                                                    No zones available to select.
                                                </FormDescription>
                                              )}
                                          </FormItem>
                                      )}
                                  />
                              )}
                          </>
                      )}

                      {/* === DISARM ALARM ZONE FIELDS === */} 
                      {actionType === AutomationActionType.DISARM_ALARM_ZONE && (
                          <>
                              <FormField
                                  control={form.control}
                                  name={`config.actions.${index}.params.scoping`}
                                  render={({ field }) => (
                                      <FormItem className="space-y-3">
                                          <FormLabel>Zone Scoping</FormLabel>
                                          <FormControl>
                                              <RadioGroup
                                                  onValueChange={field.onChange}
                                                  defaultValue={field.value}
                                                  className="flex flex-col space-y-1"
                                                  disabled={isLoading}
                                              >
                                                  {ZONE_SCOPING_OPTIONS.map(option => (
                                                      <FormItem key={option.value} className="flex items-center space-x-3 space-y-0">
                                                          <FormControl>
                                                              <RadioGroupItem value={option.value} />
                                                          </FormControl>
                                                          <FormLabel className="font-normal">
                                                              {option.label}
                                                          </FormLabel>
                                                      </FormItem>
                                                  ))}
                                              </RadioGroup>
                                          </FormControl>
                                      </FormItem>
                                  )}
                              />

                              {currentScoping === 'SPECIFIC_ZONES' && (
                                  <FormField
                                      control={form.control}
                                      name={`config.actions.${index}.params.targetZoneIds`}
                                      render={({ field, fieldState }) => (
                                          <FormItem>
                                              <FormLabel className="mr-2">Target Zones</FormLabel>
                                              <FormControl>
                                                  <MultiSelectComboBox
                                                      options={zoneOptionsForSelect}
                                                      selected={field.value || []}
                                                      onChange={field.onChange}
                                                      placeholder="Select zones..."
                                                      className={cn("w-full max-w-md", fieldState.error && 'border-destructive')}
                                                      disabled={isLoading || zoneOptionsForSelect.length === 0}
                                                  />
                                              </FormControl>
                                              {zoneOptionsForSelect.length === 0 && (
                                                <FormDescription className={descriptionStyles}>
                                                    No zones available to select.
                                                </FormDescription>
                                              )} 
                                          </FormItem>
                                      )}
                                  />
                              )}
                          </>
                      )}
                      
                  </div>
              </div>
          </AccordionContent>
      </AccordionItem>
  );
} 