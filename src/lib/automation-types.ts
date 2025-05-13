import { Power, Bookmark, Globe, TriangleAlert, HelpCircle, Bell } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Enum for automation action types
export enum AutomationActionType {
  CREATE_EVENT = 'createEvent',
  CREATE_BOOKMARK = 'createBookmark',
  SEND_HTTP_REQUEST = 'sendHttpRequest',
  SET_DEVICE_STATE = 'setDeviceState',
  SEND_PUSH_NOTIFICATION = 'sendPushNotification',
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
}

// Complete action information map - single source of truth
export const ACTION_TYPE_INFO: Record<AutomationActionType, ActionTypeInfo> = {
  [AutomationActionType.CREATE_EVENT]: {
    displayName: 'Create Event',
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
    displayName: 'Create Bookmark',
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
    formatter: () => '→ via Pushover Service'
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