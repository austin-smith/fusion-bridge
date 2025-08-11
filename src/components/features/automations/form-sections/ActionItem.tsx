'use client';

import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { 
  AccordionItem,
  AccordionTrigger,
  AccordionContent
} from "@/components/ui/accordion";
import { FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Trash2 } from 'lucide-react';
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
    PlayAudioActionParamsSchema,
    LockDeviceActionParamsSchema,
    UnlockDeviceActionParamsSchema,
} from '@/lib/automation-schemas';
import { AutomationActionType, getActionTitle, getActionIconProps, getActionStyling, formatActionDetail, AutomationTriggerType } from '@/lib/automation-types';
import { ActionableState } from '@/lib/mappings/definitions';
import { isOnOffCapableOption, isAccessControlCapableOption } from '@/lib/device-actions/capabilities';
import { SendHttpRequestActionFields } from '../actions/SendHttpRequestActionFields';
import { SendPushNotificationActionFields } from '@/components/features/automations/actions/SendPushNotificationActionFields';
import type { connectors, alarmZones } from '@/data/db/schema';
import type { z } from 'zod';
import type { AutomationFormValues } from '../AutomationForm';
import { CreateEventActionFields } from '@/components/features/automations/actions/CreateEventActionFields';
import { CreateBookmarkActionFields } from '@/components/features/automations/actions/CreateBookmarkActionFields';
import { SetDeviceStateActionFields } from '@/components/features/automations/actions/SetDeviceStateActionFields';
import { PlayAudioActionFields } from '@/components/features/automations/actions/PlayAudioActionFields';
import { AlarmZoneActionFields } from '@/components/features/automations/actions/AlarmZoneActionFields';
import { LockDeviceActionFields } from '@/components/features/automations/actions/LockDeviceActionFields';
import { UnlockDeviceActionFields } from '@/components/features/automations/actions/UnlockDeviceActionFields';
import { QuickGrantDeviceActionFields } from '@/components/features/automations/actions/QuickGrantDeviceActionFields';

const ALL_USERS_PUSHOVER_VALUE = '__all__';

// Zone scoping options moved into dedicated component

// Action type groups for better organization
const ACTION_GROUPS = [
    {
        id: 'video-camera',
        label: 'Video',
        actions: [AutomationActionType.CREATE_EVENT, AutomationActionType.CREATE_BOOKMARK]
    },
    {
        id: 'access-control',
        label: 'Access Control',
      actions: [AutomationActionType.LOCK_DEVICE, AutomationActionType.UNLOCK_DEVICE, AutomationActionType.QUICK_GRANT_DEVICE]
    },
    {
        id: 'alarm',
        label: 'Alarm',
        actions: [AutomationActionType.ARM_ALARM_ZONE, AutomationActionType.DISARM_ALARM_ZONE]
    },
    {
        id: 'device-control',
        label: 'Device Control',
        actions: [AutomationActionType.SET_DEVICE_STATE, AutomationActionType.PLAY_AUDIO]
    },
    {
        id: 'other',
        label: 'Other',
        actions: [AutomationActionType.SEND_PUSH_NOTIFICATION, AutomationActionType.SEND_HTTP_REQUEST]
    }
] as const;

// Device display helpers removed (unused)

type ConnectorSelect = typeof connectors.$inferSelect;
type TargetDeviceOption = {
    id: string;
    name: string;
    displayType: string;
    iconName: string;
    spaceId?: string | null;
    locationId?: string | null;
    rawType?: string; // Add raw device type for proper command filtering
    supportsAudio?: boolean; // Server-side computed flag for audio capability
    connectorCategory?: string; // Connector category for capability detection
    standardDeviceType?: import('@/lib/mappings/definitions').DeviceType;
};

type ZoneOption = Pick<typeof alarmZones.$inferSelect, 'id' | 'name' | 'locationId'>;

const descriptionStyles = "text-xs text-muted-foreground mt-1";

// Tone options moved into dedicated component

// DeviceSelectorCombo extracted to controls/DeviceSelectorCombo

// Lock device selection extracted to controls/LockDeviceSelection



export type InsertableFieldNames = 
    | keyof z.infer<typeof CreateEventActionParamsSchema>
    | keyof z.infer<typeof CreateBookmarkParamsSchema>
    | Exclude<keyof z.infer<typeof SendHttpRequestActionParamsSchema>, 'headers'>
    | keyof z.infer<typeof SetDeviceStateActionParamsSchema>
    | keyof z.infer<typeof SendPushNotificationActionParamsSchema>
    | keyof z.infer<typeof PlayAudioActionParamsSchema>
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
  allLocations: any[]; // Location data for hierarchy display
  allSpaces: any[]; // Space data for hierarchy display
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
  allLocations,
  allSpaces,
}: ActionItemProps) {
  const actionType = form.watch(`config.actions.${index}.type`);
  const actionParams = form.watch(`config.actions.${index}.params`);
  // Scoping handled in AlarmZoneActionFields

  // Pushover kept simple — no dynamic user fetching
  // Centralized, memoized device eligibility lists
  const onOffCapableDevices = React.useMemo(() => {
    return (sortedAvailableTargetDevices || []).filter(d => isOnOffCapableOption(d));
  }, [sortedAvailableTargetDevices]);

  const accessControlCapableDevices = React.useMemo(() => {
    return (sortedAvailableTargetDevices || []).filter(d => isAccessControlCapableOption(d));
  }, [sortedAvailableTargetDevices]);


  // (intentionally no effect)

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
        // Only include devices that support both SET_ON and SET_OFF
        newActionParams = {
            targetDeviceInternalId: onOffCapableDevices.length > 0 ? onOffCapableDevices[0].id : '',
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
    } else if (newType === AutomationActionType.PLAY_AUDIO) {
        // Filter to only devices that support audio (server-side computed flag)
        const audioCapableDevices = sortedAvailableTargetDevices.filter(device => device.supportsAudio);
        newActionParams = {
            targetDeviceInternalId: audioCapableDevices.length > 0 ? audioCapableDevices[0].id : '',
            toneTemplate: '',
            messageTemplate: '',
            volumeTemplate: '',
            repeatTemplate: ''
        } as z.infer<typeof PlayAudioActionParamsSchema>;
    } else if (newType === AutomationActionType.LOCK_DEVICE) {
        newActionParams = {
            targetDeviceInternalId: ''
        } as z.infer<typeof LockDeviceActionParamsSchema>;
    } else if (newType === AutomationActionType.UNLOCK_DEVICE) {
        newActionParams = {
            targetDeviceInternalId: ''
        } as z.infer<typeof UnlockDeviceActionParamsSchema>;
    } else if (newType === AutomationActionType.QUICK_GRANT_DEVICE) {
        newActionParams = {
            targetDeviceInternalId: ''
        } as z.infer<typeof UnlockDeviceActionParamsSchema>;
    } else { 
        console.warn(`Unexpected action type: ${value}. Defaulting to minimal params.`); 
        newActionParams = {} as any;
    }

    // Avoid triggering validation on type change; let the user configure fields first
    form.setValue(`config.actions.${index}.type`, newType, { shouldDirty: true });
    form.setValue(`config.actions.${index}.params`, newActionParams, { shouldDirty: true });
  };

  const availableActionTypes = React.useMemo(() => {
    const allTypes = Object.values(AutomationActionType);
    if (triggerType === AutomationTriggerType.SCHEDULED) {
        return allTypes.filter(type => 
            type === AutomationActionType.ARM_ALARM_ZONE || 
            type === AutomationActionType.DISARM_ALARM_ZONE ||
            type === AutomationActionType.PLAY_AUDIO
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
                      <div className="flex items-center shrink-0">
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
                                                              <IconComponent className="h-4 w-4 text-muted-foreground shrink-0" />
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
                  {/* Create Event / Bookmark dedicated components */}
                  
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
                          {actionType === AutomationActionType.PLAY_AUDIO && "Plays an audio message on a compatible hub device."}
                          {actionType === AutomationActionType.LOCK_DEVICE && "Locks a compatible door or access control device."}
                          {actionType === AutomationActionType.UNLOCK_DEVICE && "Unlocks a compatible door or access control device."}
                          {!Object.values(AutomationActionType).includes(actionType as any) && "Select an action type to see parameters."}
                      </p>
                      
                      {actionType === AutomationActionType.CREATE_EVENT && (
                        <CreateEventActionFields
                          form={form}
                          actionIndex={index}
                          connectors={sortedPikoConnectors}
                          isLoading={isLoading}
                          onInsertToken={(fieldName, actIndex, token) =>
                            handleInsertToken(fieldName as any, actIndex, token, 'action')
                          }
                        />
                      )}
                      
                      {actionType === AutomationActionType.CREATE_BOOKMARK && (
                        <CreateBookmarkActionFields
                          form={form}
                          actionIndex={index}
                          connectors={sortedPikoConnectors}
                          isLoading={isLoading}
                          onInsertToken={(fieldName, actIndex, token) =>
                            handleInsertToken(fieldName as any, actIndex, token, 'action')
                          }
                        />
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
                        <SetDeviceStateActionFields
                          form={form}
                          actionIndex={index}
                          devices={onOffCapableDevices}
                          allLocations={allLocations}
                          allSpaces={allSpaces}
                          isLoading={isLoading}
                        />
                      )}
                      
                      {actionType === AutomationActionType.PLAY_AUDIO && (
                        <PlayAudioActionFields
                          form={form}
                          actionIndex={index}
                          devices={sortedAvailableTargetDevices}
                          isLoading={isLoading}
                          onInsertToken={(fieldName, actIndex, token) =>
                            handleInsertToken(fieldName as any, actIndex, token, 'action')
                          }
                        />
                      )}
                      
                      {actionType === AutomationActionType.SEND_PUSH_NOTIFICATION && (
                        <SendPushNotificationActionFields
                          form={form}
                          actionIndex={index}
                          isLoading={isLoading}
                          onInsertToken={(fieldName, actIndex, token) =>
                            handleInsertToken(fieldName as any, actIndex, token, 'action')
                          }
                        />
                      )}
                      
                      {actionType === AutomationActionType.ARM_ALARM_ZONE && (
                        <AlarmZoneActionFields
                          form={form}
                          actionIndex={index}
                          zones={zoneOptionsForSelect}
                          isLoading={isLoading}
                          mode="arm"
                        />
                      )}

                      {actionType === AutomationActionType.DISARM_ALARM_ZONE && (
                        <AlarmZoneActionFields
                          form={form}
                          actionIndex={index}
                          zones={zoneOptionsForSelect}
                          isLoading={isLoading}
                          mode="disarm"
                        />
                      )}

                      {/* === LOCK DEVICE FIELDS === */}
                      {actionType === AutomationActionType.LOCK_DEVICE && (
                        <LockDeviceActionFields
                          form={form}
                          actionIndex={index}
                          devices={accessControlCapableDevices}
                          allLocations={allLocations}
                          allSpaces={allSpaces}
                          isLoading={isLoading}
                        />
                      )}

                      {/* === UNLOCK DEVICE FIELDS === */}
                      {actionType === AutomationActionType.UNLOCK_DEVICE && (
                        <UnlockDeviceActionFields
                          form={form}
                          actionIndex={index}
                          devices={accessControlCapableDevices}
                          allLocations={allLocations}
                          allSpaces={allSpaces}
                          isLoading={isLoading}
                        />
                      )}

                      {actionType === AutomationActionType.QUICK_GRANT_DEVICE && (
                        <QuickGrantDeviceActionFields
                          form={form}
                          actionIndex={index}
                          devices={accessControlCapableDevices}
                          allLocations={allLocations}
                          allSpaces={allSpaces}
                          isLoading={isLoading}
                        />
                      )}
                      
                  </div>
              </div>
          </AccordionContent>
      </AccordionItem>
  );
} 