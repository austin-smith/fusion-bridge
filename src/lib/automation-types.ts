import { Power, Bookmark, Globe, TriangleAlert, HelpCircle, Bell, ShieldCheck, ShieldOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Enum for automation action types
export enum AutomationActionType {
  CREATE_EVENT = 'createEvent',
  CREATE_BOOKMARK = 'createBookmark',
  SEND_HTTP_REQUEST = 'sendHttpRequest',
  SET_DEVICE_STATE = 'setDeviceState',
  SEND_PUSH_NOTIFICATION = 'sendPushNotification',
  ARM_AREA = 'armArea',
  DISARM_AREA = 'disarmArea',
  // Add other action types here
}

export enum AutomationTriggerType {
  EVENT = 'event',
  SCHEDULED = 'scheduled'
}

// Define all styling and information in a single map
export interface ActionTypeInfo {
  displayName: string;
  icon: LucideIcon;
  iconColorClass: string;
  bgColorClass: string;
  borderColorClass: string;
  formatter: (params: any, contextData?: ActionContextData) => string;
}

// Context data for formatting descriptive text
export interface ActionContextData {
  connectors?: Array<{ id: string; name: string; category?: string }>;
  devices?: Array<{ id: string; name: string; [key: string]: any }>;
  areas?: Array<{ id: string; name: string }>;
  ruleLocationScope?: { id: string; name: string } | null;
}

// Complete action information map - single source of truth
export const ACTION_TYPE_INFO: Record<AutomationActionType, ActionTypeInfo> = {
  [AutomationActionType.CREATE_EVENT]: {
    displayName: 'Create Piko Event',
    icon: TriangleAlert,
    iconColorClass: 'text-blue-600 dark:text-blue-400',
    bgColorClass: 'bg-blue-50/40 dark:bg-blue-950/20',
    borderColorClass: 'border-blue-200 dark:border-blue-800',
    formatter: (params, contextData) => {
      if (!params) return '→ (No parameters)';
      
      const connectorId = params.targetConnectorId;
      const connectors = contextData?.connectors || [];
      const connector = connectors.find(c => c.id === connectorId);
      const connectorName = connector?.name || '(No connector)';
      
      return `→ ${connectorName}`;
    }
  },
  
  [AutomationActionType.CREATE_BOOKMARK]: {
    displayName: 'Create Piko Bookmark',
    icon: Bookmark,
    iconColorClass: 'text-green-600 dark:text-green-400',
    bgColorClass: 'bg-green-50/40 dark:bg-green-950/20',
    borderColorClass: 'border-green-200 dark:border-green-800',
    formatter: (params, contextData) => {
      if (!params) return '→ (No parameters)';
      
      const connectorId = params.targetConnectorId;
      const connectors = contextData?.connectors || [];
      const connector = connectors.find(c => c.id === connectorId);
      const connectorName = connector?.name || '(No connector)';
      
      return `→ ${connectorName}`;
    }
  },
  
  [AutomationActionType.SEND_HTTP_REQUEST]: {
    displayName: 'Send HTTP Request',
    icon: Globe,
    iconColorClass: 'text-purple-600 dark:text-purple-400',
    bgColorClass: 'bg-purple-50/40 dark:bg-purple-950/20',
    borderColorClass: 'border-purple-200 dark:border-purple-800',
    formatter: (params) => {
      if (!params) return '→ (No parameters)';
      
      const method = params.method || 'GET';
      const url = params.urlTemplate || '(URL not set)';
      
      return `→ ${method} ${url}`;
    }
  },
  
  [AutomationActionType.SET_DEVICE_STATE]: {
    displayName: 'Set Device State',
    icon: Power,
    iconColorClass: 'text-amber-600 dark:text-amber-400',
    bgColorClass: 'bg-amber-50/40 dark:bg-amber-950/20',
    borderColorClass: 'border-amber-200 dark:border-amber-800',
    formatter: (params, contextData) => {
      if (!params) return '→ (No parameters)';
      
      const deviceId = params.targetDeviceInternalId;
      const state = params.targetState;
      const devices = contextData?.devices || [];
      const device = devices.find(d => d.id === deviceId);
      const deviceName = device?.name || 'Unknown device';
      
      const stateDisplay = state === 'SET_ON' ? 'Turn On' : 
                          state === 'SET_OFF' ? 'Turn Off' : 
                          state || '';
                          
      return `→ ${stateDisplay} ${deviceName}`;
    }
  },
  
  [AutomationActionType.SEND_PUSH_NOTIFICATION]: {
    displayName: 'Send Push Notification',
    icon: Bell,
    iconColorClass: 'text-orange-600 dark:text-orange-400',
    bgColorClass: 'bg-orange-50/40 dark:bg-orange-950/20',
    borderColorClass: 'border-orange-200 dark:border-orange-800',
    formatter: (params) => {
      if (!params) return '→ via Pushover Service';
      
      // Check if a specific user is targeted
      const targetUserKey = params.targetUserKeyTemplate;
      
      if (targetUserKey) {
        // If a specific user key is set, display it (trimmed for UI clarity)
        const displayKey = typeof targetUserKey === 'string' && targetUserKey.length > 10 
          ? `${targetUserKey.substring(0, 7)}...` 
          : targetUserKey;
        return `→ to user ${displayKey} via Pushover`;
      }
      
      // Default case - sending to all users in the group
      return '→ to all users via Pushover';
    }
  },

  [AutomationActionType.ARM_AREA]: {
    displayName: 'Arm Area',
    icon: ShieldCheck,
    iconColorClass: 'text-sky-600 dark:text-sky-400',
    bgColorClass: 'bg-sky-50/40 dark:bg-sky-950/20',
    borderColorClass: 'border-sky-200 dark:border-sky-800',
    formatter: (params, contextData) => {
      if (!params) return '→ (No parameters)';
      const scoping = params.scoping === 'ALL_AREAS_IN_SCOPE' ? 'all areas in scope' : `${params.targetAreaIds?.length || 0} specific areas`;
      return `Arm ${scoping}`;
    }
  },

  [AutomationActionType.DISARM_AREA]: {
    displayName: 'Disarm Area',
    icon: ShieldOff,
    iconColorClass: 'text-slate-600 dark:text-slate-400',
    bgColorClass: 'bg-slate-50/40 dark:bg-slate-950/20',
    borderColorClass: 'border-slate-200 dark:border-slate-800',
    formatter: (params, contextData) => {
      if (!params) return '→ (No parameters)';
      const scoping = params.scoping;
      const areaIds = params.targetAreaIds || [];
      const areas = contextData?.areas || [];
      const ruleLocationScopeName = contextData?.ruleLocationScope?.name;

      if (scoping === 'SPECIFIC_AREAS') {
        if (areaIds.length === 0) return '→ Disarm: No specific areas selected';
        if (areaIds.length === 1) {
          const area = areas.find(a => a.id === areaIds[0]);
          return `→ Disarm '${area?.name || areaIds[0].substring(0,6) + '...'}'`;
        }
        return `→ Disarm ${areaIds.length} selected areas`;
      }
      if (scoping === 'ALL_AREAS_IN_SCOPE') {
        if (ruleLocationScopeName) {
          return `→ Disarm all areas in '${ruleLocationScopeName}'`;
        } else {
          return `→ Disarm all areas in system`;
        }
      }
      return `→ Disarm Area(s): Config pending`;
    }
  }
};

// Helper functions that use the central map
export function getActionInfo(actionType: string): ActionTypeInfo {
  const type = actionType as AutomationActionType;
  return ACTION_TYPE_INFO[type] || {
    displayName: 'Unknown Action',
    icon: HelpCircle,
    iconColorClass: 'text-muted-foreground',
    bgColorClass: 'bg-background',
    borderColorClass: 'border-border',
    formatter: () => '→ Unknown action parameters'
  };
}

export function getActionTitle(actionType: string): string {
  return getActionInfo(actionType).displayName;
}

export function getActionIcon(actionType: string): LucideIcon {
  return getActionInfo(actionType).icon;
}

// Return icon props instead of JSX Element to avoid React dependency in this file
export function getActionIconProps(actionType: string): { icon: LucideIcon, className: string } {
  const info = getActionInfo(actionType);
  return {
    icon: info.icon,
    className: `h-4 w-4 ${info.iconColorClass}`
  };
}

export function getActionStyling(actionType: string): { bgColor: string, borderColor: string } {
  const info = getActionInfo(actionType);
  return {
    bgColor: info.bgColorClass,
    borderColor: info.borderColorClass
  };
}

export function formatActionDetail(
  actionType: string,
  params: any,
  contextData?: ActionContextData,
  options?: { includeType?: boolean }
): string {
  const info = getActionInfo(actionType);
  const details = info.formatter(params, contextData);
  
  // By default, include the type unless explicitly set to false
  if (options?.includeType === false) {
    return details;
  }
  
  return `${info.displayName} ${details}`;
} 