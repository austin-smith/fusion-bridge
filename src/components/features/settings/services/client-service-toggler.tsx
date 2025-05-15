'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner'; // Using sonner for toasts

interface ClientServiceTogglerProps {
  serviceName: string;
  initialIsEnabled: boolean;
  configId: string | undefined; // ID of the service configuration
  // The action to call when the toggle state changes
  updateServiceEnabledAction: (configId: string, newIsEnabled: boolean) => Promise<{success: boolean, message?: string}>;
}

export function ClientServiceToggler({
  serviceName,
  initialIsEnabled,
  configId,
  updateServiceEnabledAction,
}: ClientServiceTogglerProps) {
  const [isEnabled, setIsEnabled] = useState(initialIsEnabled);

  const handleToggle = async (newIsEnabled: boolean) => {
    if (!configId) {
      toast.error(`${serviceName} must be configured first before enabling/disabling.`);
      // Note: The Switch component often handles its own visual state unless controlled explicitly
      // If it were purely controlled, we might need to revert isEnabled here.
      return;
    }

    const originalState = isEnabled;
    setIsEnabled(newIsEnabled); // Optimistic update

    try {
      const result = await updateServiceEnabledAction(configId, newIsEnabled);
      if (result.success) {
        toast.success(`${serviceName} ${newIsEnabled ? 'enabled' : 'disabled'}.`);
        // State is already updated optimistically
      } else {
        setIsEnabled(originalState); // Revert on failure
        toast.error(result.message || `Failed to update ${serviceName} status.`);
      }
    } catch (err) {
      setIsEnabled(originalState); // Revert on error
      toast.error(`Error updating ${serviceName} status.`);
      console.error(`Error toggling ${serviceName}:`, err);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <Switch
        id={`${serviceName.toLowerCase()}-enable-switch`}
        checked={isEnabled}
        onCheckedChange={handleToggle}
        disabled={!configId} // Disable toggle if not configured (i.e., no configId)
      />
      <Label htmlFor={`${serviceName.toLowerCase()}-enable-switch`}>
        Enable {serviceName} Service
      </Label>
    </div>
  );
} 