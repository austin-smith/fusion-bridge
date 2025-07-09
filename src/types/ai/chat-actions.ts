/**
 * Types for AI chat actions - actionable buttons that appear in chat responses
 */

import { ActionableState, ArmedState, DisplayState } from '@/lib/mappings/definitions';

/**
 * Base interface for all chat actions
 */
export interface ChatAction {
  id: string;
  type: 'device' | 'area';
  label: string;
  icon: string; // Lucide icon name (e.g., 'Power', 'ShieldCheck')
  disabled?: boolean;
  disabledReason?: string;
  metadata: DeviceActionMetadata | AreaActionMetadata;
}

/**
 * Metadata for device actions (turn on/off) and special actions
 */
export interface DeviceActionMetadata {
  internalDeviceId: string;
  deviceName: string;
  action: ActionableState | string; // Allow string for special actions
  currentState?: DisplayState;
  connectorCategory: string;
  deviceType: string;
  // Special action properties
  externalUrl?: string; // For opening external links
  settingsTab?: string; // For navigating to specific admin settings tabs
  accountSettingsTab?: string; // For navigating to specific account settings tabs
}

/**
 * Metadata for area actions (arm/disarm)
 */
export interface AreaActionMetadata {
  areaId: string;
  areaName: string;
  targetState: ArmedState;
  currentState: ArmedState;
}

/**
 * Helper type guards
 */
export function isDeviceAction(action: ChatAction): action is ChatAction & { metadata: DeviceActionMetadata } {
  return action.type === 'device';
}

export function isAreaAction(action: ChatAction): action is ChatAction & { metadata: AreaActionMetadata } {
  return action.type === 'area';
}

/**
 * Validation helper - checks if action has required fields
 */
export function isValidChatAction(action: any): action is ChatAction {
  return action &&
    typeof action.id === 'string' &&
    typeof action.label === 'string' &&
    typeof action.icon === 'string' &&
    (action.type === 'device' || action.type === 'area') &&
    action.metadata &&
    typeof action.metadata === 'object';
}

/**
 * Validation helper - checks if device action metadata is complete
 */
export function isValidDeviceActionMetadata(metadata: any): metadata is DeviceActionMetadata {
  return metadata &&
    typeof metadata.internalDeviceId === 'string' &&
    typeof metadata.deviceName === 'string' &&
    typeof metadata.action === 'string' &&
    typeof metadata.connectorCategory === 'string' &&
    typeof metadata.deviceType === 'string';
}

/**
 * Validation helper - checks if area action metadata is complete
 */
export function isValidAreaActionMetadata(metadata: any): metadata is AreaActionMetadata {
  return metadata &&
    typeof metadata.areaId === 'string' &&
    typeof metadata.areaName === 'string' &&
    typeof metadata.targetState === 'string' &&
    typeof metadata.currentState === 'string';
} 