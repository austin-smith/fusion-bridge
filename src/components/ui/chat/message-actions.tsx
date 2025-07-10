'use client';

import React, { useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ActionButton } from './action-button';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFusionStore } from '@/stores/store';
import { toast } from 'sonner';
import { ActionableState, ArmedState } from '@/lib/mappings/definitions';
import { ShieldCheck, ShieldOff, Power, PowerOff, Loader2 } from 'lucide-react';
import type { 
  ChatAction, 
  DeviceActionMetadata, 
  AreaActionMetadata,
  isDeviceAction,
  isAreaAction
} from '@/types/ai/chat-actions';

interface MessageActionsProps {
  actions: ChatAction[];
  className?: string;
  addMessage?: (content: string, role?: 'user' | 'assistant') => void;
}

/**
 * Container component for chat message actions
 * Features:
 * - Handles device and area action execution
 * - Integrates with existing store methods
 * - Provides proper spacing and layout
 * - Error handling with toast notifications
 * - Optimistic state updates
 */
export function MessageActions({ actions, className, addMessage }: MessageActionsProps) {
  const { 
    executeDeviceAction: storeExecuteDeviceAction, 
    updateAreaArmedState,
    batchUpdateAreasArmedState
  } = useFusionStore();

  const [bulkActionLoading, setBulkActionLoading] = useState<string | null>(null);

  // Helper function to create confirmation messages
  const createConfirmationMessage = (actionType: string, actions: ChatAction[], success: boolean, error?: string) => {
    if (!success && error) {
      return `❌ Failed to ${actionType}: ${error}`;
    }

    const actionDescription = actionType === 'arm' ? 'armed' : 
                            actionType === 'disarm' ? 'disarmed' :
                            actionType === 'device-on' ? 'turned on' : 'turned off';
    const itemType = actionType.startsWith('device') ? 'devices' : 'areas';
    
    const items = actions.map(action => {
      if (action.type === 'area') {
        const metadata = action.metadata as AreaActionMetadata;
        return metadata.areaName;
      } else if (action.type === 'device') {
        const metadata = action.metadata as DeviceActionMetadata;
        return metadata.deviceName;
      }
      return 'Unknown item';
    });

    const itemList = items.map(item => `• ${item}`).join('\n');
    
    return `✅ Successfully ${actionDescription} ${actions.length} ${itemType}:\n\n${itemList}`;
  };

  // Validate and filter actions
  const validActions = actions.filter((action) => {
    const isValid = isValidChatAction(action);
    if (!isValid) {
      console.warn('[MessageActions] Invalid action filtered out:', action);
    }
    return isValid;
  });

  if (validActions.length === 0) {
    return null;
  }

  // Analyze actions for bulk operations
  const areaActions = validActions.filter(action => action.type === 'area');
  const deviceActions = validActions.filter(action => action.type === 'device');
  
  // Check if we have multiple area actions of the same type (bulk operation)
  const armActions = areaActions.filter(action => {
    const metadata = action.metadata as AreaActionMetadata;
    return metadata.targetState === ArmedState.ARMED;
  });
  
  const disarmActions = areaActions.filter(action => {
    const metadata = action.metadata as AreaActionMetadata;
    return metadata.targetState === ArmedState.DISARMED;
  });

  // Check if we have multiple device actions of the same type
  const deviceOnActions = deviceActions.filter(action => {
    const metadata = action.metadata as DeviceActionMetadata;
    return metadata.action === ActionableState.SET_ON;
  });
  
  const deviceOffActions = deviceActions.filter(action => {
    const metadata = action.metadata as DeviceActionMetadata;
    return metadata.action === ActionableState.SET_OFF;
  });

  const hasBulkArmOperation = armActions.length > 1;
  const hasBulkDisarmOperation = disarmActions.length > 1;
  const hasBulkDeviceOnOperation = deviceOnActions.length > 1;
  const hasBulkDeviceOffOperation = deviceOffActions.length > 1;

  const executeAction = async (action: ChatAction): Promise<void> => {
    try {
      if (action.type === 'device') {
        const metadata = action.metadata as DeviceActionMetadata;
        
        await handleDeviceAction(action);
        
        // Only add success message for actual device control actions (not special actions)
        const isExternalLink = !!metadata.externalUrl;
        const isSettingsNavigation = !!metadata.settingsTab;
        const isAccountSettingsNavigation = !!(metadata as any).accountSettingsTab;
        
        if (addMessage && !isExternalLink && !isSettingsNavigation && !isAccountSettingsNavigation &&
            (metadata.action === ActionableState.SET_ON || metadata.action === ActionableState.SET_OFF)) {
          const actionWord = metadata.action === ActionableState.SET_ON ? 'turned on' : 'turned off';
          const confirmationMessage = `✅ Successfully ${actionWord} ${metadata.deviceName}`;
          addMessage(confirmationMessage);
        }
      } else if (action.type === 'area') {
        await handleAreaAction(action);
        
        // Add success message to chat for individual area actions
        if (addMessage) {
          const metadata = action.metadata as AreaActionMetadata;
          const actionWord = metadata.targetState === ArmedState.ARMED ? 'armed' : 'disarmed';
          const confirmationMessage = `✅ Successfully ${actionWord} ${metadata.areaName}`;
          addMessage(confirmationMessage);
        }
      } else {
        throw new Error(`Unsupported action type: ${action.type}`);
      }
    } catch (error) {
      console.error('[MessageActions] Action execution failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Add error message to chat
      if (addMessage) {
        const confirmationMessage = `❌ Action failed: ${errorMessage}`;
        addMessage(confirmationMessage);
      } else {
        // Fallback to toast if addMessage not available
        toast.error(`Action failed: ${errorMessage}`);
      }
      throw error; // Re-throw so ActionButton can handle loading state
    }
  };

  const handleDeviceAction = async (action: ChatAction): Promise<void> => {
    const metadata = action.metadata as DeviceActionMetadata;
    
    // Handle special external link actions
    if ((metadata as any).externalUrl) {
      window.open((metadata as any).externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    
    // Handle special navigation actions
    if ((metadata as any).settingsTab) {
      // Navigate to admin settings page
      window.location.href = '/settings';
      return;
    }
    
    // Handle account settings navigation
    if ((metadata as any).accountSettingsTab) {
      // Open account settings page with specific tab in new window/tab
      const tab = (metadata as any).accountSettingsTab;
      window.open(`/account/settings?tab=${tab}`, '_blank', 'noopener,noreferrer');
      return;
    }
    
    // Use existing store method for device actions
    await storeExecuteDeviceAction(metadata.internalDeviceId, metadata.action as ActionableState);
  };

  const handleAreaAction = async (action: ChatAction): Promise<void> => {
    const metadata = action.metadata as AreaActionMetadata;
    
    const success = await updateAreaArmedState(metadata.areaId, metadata.targetState);
    
    if (!success) {
      throw new Error(`Failed to ${metadata.targetState === ArmedState.ARMED ? 'arm' : 'disarm'} area`);
    }
  };

  const handleBulkAction = async (actionType: 'arm' | 'disarm' | 'device-on' | 'device-off') => {
    let targetActions: ChatAction[];
    
    switch (actionType) {
      case 'arm':
        targetActions = armActions;
        break;
      case 'disarm':
        targetActions = disarmActions;
        break;
      case 'device-on':
        targetActions = deviceOnActions;
        break;
      case 'device-off':
        targetActions = deviceOffActions;
        break;
      default:
        return;
    }
    
    setBulkActionLoading(actionType);
    
    try {
      // Execute all actions in parallel
      const promises = targetActions.map((action: ChatAction) => {
        if (action.type === 'area') {
          return handleAreaAction(action);
        } else if (action.type === 'device') {
          return handleDeviceAction(action);
        }
        throw new Error(`Unknown action type: ${action.type}`);
      });
      
      await Promise.all(promises);
      
      // Add success message to chat
      if (addMessage) {
        const confirmationMessage = createConfirmationMessage(actionType, targetActions, true);
        addMessage(confirmationMessage);
      } else {
        // Fallback to toast if addMessage not available
        const actionDescription = actionType === 'arm' ? 'armed' : 
                                actionType === 'disarm' ? 'disarmed' :
                                actionType === 'device-on' ? 'turned on' : 'turned off';
        const itemType = actionType.startsWith('device') ? 'devices' : 'areas';
        toast.success(`Successfully ${actionDescription} ${targetActions.length} ${itemType}`);
      }
    } catch (error) {
      console.error('[MessageActions] Bulk action failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Add error message to chat
      if (addMessage) {
        const confirmationMessage = createConfirmationMessage(actionType, targetActions, false, errorMessage);
        addMessage(confirmationMessage);
      } else {
        // Fallback to toast if addMessage not available
        toast.error(`Bulk ${actionType} failed: ${errorMessage}`);
      }
    } finally {
      setBulkActionLoading(null);
    }
  };

  return (
    <TooltipProvider>
      <div className={`flex flex-wrap gap-2 ${className || ''}`}>
        {/* Bulk action buttons */}
        {hasBulkArmOperation && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBulkAction('arm')}
            disabled={bulkActionLoading === 'arm'}
            className="flex items-center gap-2"
          >
            {bulkActionLoading === 'arm' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Arm All Areas
            <Badge variant="secondary" className="ml-1">
              {armActions.length}
            </Badge>
          </Button>
        )}
        
        {hasBulkDisarmOperation && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBulkAction('disarm')}
            disabled={bulkActionLoading === 'disarm'}
            className="flex items-center gap-2"
          >
            {bulkActionLoading === 'disarm' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldOff className="h-4 w-4" />
            )}
            Disarm All Areas
            <Badge variant="default" className="ml-1">
              {disarmActions.length}
            </Badge>
          </Button>
        )}

        {/* Bulk device action buttons */}
        {hasBulkDeviceOnOperation && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBulkAction('device-on')}
            disabled={bulkActionLoading === 'device-on'}
            className="flex items-center gap-2"
          >
            {bulkActionLoading === 'device-on' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Power className="h-4 w-4" />
            )}
            Turn On All Devices
            <Badge variant="secondary" className="ml-1">
              {deviceOnActions.length}
            </Badge>
          </Button>
        )}
        
        {hasBulkDeviceOffOperation && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBulkAction('device-off')}
            disabled={bulkActionLoading === 'device-off'}
            className="flex items-center gap-2"
          >
            {bulkActionLoading === 'device-off' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PowerOff className="h-4 w-4" />
            )}
            Turn Off All Devices
            <Badge variant="default" className="ml-1">
              {deviceOffActions.length}
            </Badge>
          </Button>
        )}

                 {/* Individual action buttons (exclude bulk operations) */}
         {validActions
           .filter(action => {
             if (action.type === 'area') {
               const metadata = action.metadata as AreaActionMetadata;
               const isArmAction = metadata.targetState === ArmedState.ARMED;
               const isDisarmAction = metadata.targetState === ArmedState.DISARMED;
               
               // Hide individual buttons if we're showing bulk buttons for this type
               if (isArmAction && hasBulkArmOperation) return false;
               if (isDisarmAction && hasBulkDisarmOperation) return false;
               
               return true;
             } else if (action.type === 'device') {
               const metadata = action.metadata as DeviceActionMetadata;
               const isOnAction = metadata.action === ActionableState.SET_ON;
               const isOffAction = metadata.action === ActionableState.SET_OFF;
               
               // Hide individual buttons if we're showing bulk buttons for this type
               if (isOnAction && hasBulkDeviceOnOperation) return false;
               if (isOffAction && hasBulkDeviceOffOperation) return false;
               
               return true;
             }
             
             return true; // Show unknown types
           })
           .map((action) => (
             <ActionButton
               key={action.id}
               action={action}
               onExecute={executeAction}
             />
           ))
         }
      </div>
    </TooltipProvider>
  );
}

/**
 * Helper to validate ChatAction objects at runtime
 */
function isValidChatAction(action: any): action is ChatAction {
  return action &&
    typeof action.id === 'string' &&
    typeof action.label === 'string' &&
    typeof action.icon === 'string' &&
    (action.type === 'device' || action.type === 'area') &&
    action.metadata &&
    typeof action.metadata === 'object';
} 