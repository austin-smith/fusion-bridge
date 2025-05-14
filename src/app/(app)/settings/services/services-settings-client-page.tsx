'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { PushoverConfig } from "@/data/repositories/service-configurations";
import type { PushcutConfig } from "@/types/pushcut-types";
import { ServiceConfigForm } from "@/components/settings/services/service-config-form";
import { PushoverTestModal } from "@/components/settings/services/pushover/pushover-test-modal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { PushcutConfigForm } from "@/components/settings/services/pushcut/pushcut-config-form";
import { PushcutTestModal } from "@/components/settings/services/pushcut/pushcut-test-modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from 'sonner';
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TbBrandPushover } from "react-icons/tb";
import { Layers2 } from 'lucide-react';
import { updateServiceEnabledStateAction } from './actions';

interface ServicesSettingsClientPageContentProps {
  initialPushoverConfig: PushoverConfig | null;
  initialPushcutConfig: PushcutConfig | null;
}

// ClientServiceTab component definition (kept within this file for now)
function ClientServiceTab({
  serviceName,
  initialConfigData,
  initialIsEnabledState,
  TestModalComponent,
  ConfigFormComponent,
  updateServiceEnabledAction
}: {
  serviceName: string;
  initialConfigData: any; // PushoverConfig | PushcutConfig | null
  initialIsEnabledState: boolean;
  TestModalComponent?: React.FC<any>;
  ConfigFormComponent: React.FC<any>;
  updateServiceEnabledAction: (configId: string, newIsEnabled: boolean) => Promise<{ success: boolean, message?: string }>;
}) {
  const [isEnabled, setIsEnabled] = useState(initialIsEnabledState);
  const [config, setConfig] = useState(initialConfigData);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  const handleEnableToggle = async (newIsEnabled: boolean) => {
    if (!config?.id) {
      toast.error(`${serviceName} must be configured first before enabling/disabling.`);
      return;
    }
    const originalState = isEnabled;
    setIsEnabled(newIsEnabled); // Optimistic update
    try {
      const result = await updateServiceEnabledAction(config.id, newIsEnabled);
      if (result.success) {
        toast.success(`${serviceName} ${newIsEnabled ? 'enabled' : 'disabled'}.`);
        setConfig((prev: any) => prev ? { ...prev, isEnabled: newIsEnabled } : null);
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

  // Memoized callback for when the config form successfully saves
  const handleConfigFormSaveSuccess = useCallback((savedIsEnabled: boolean, savedConfigId?: string, savedApiKey?: string) => {
    setIsEnabled(savedIsEnabled);
    setConfig((prevConfig: PushoverConfig | PushcutConfig | null | undefined): PushoverConfig | PushcutConfig | null => {
      const serviceType = serviceName.toLowerCase();

      if (!savedConfigId && !prevConfig?.id) {
        // This case should ideally not happen if a save was successful for a new item, 
        // as the action should return an ID.
        // If it does, we can't form a valid config.
        return null; 
      }

      const baseConfig = {
        id: savedConfigId || prevConfig!.id, // We assert prevConfig is not null if savedConfigId is null by the check above
        isEnabled: savedIsEnabled,
      };

      if (serviceType === 'pushover') {
        // For Pushover, `savedApiKey` from the generic form callback would be its `apiToken`.
        // The `groupKey` would need to be handled similarly if the form/action supports changing it.
        // For now, assuming only apiToken might change or be set initially.
        const currentGroupKey = (prevConfig as PushoverConfig)?.groupKey || ''; // Get existing or default
        return {
          ...baseConfig,
          type: 'pushover',
          apiToken: savedApiKey || (prevConfig as PushoverConfig)?.apiToken || '',
          groupKey: currentGroupKey, // Preserve groupKey if not being changed by this form action
        } as PushoverConfig;
      } else if (serviceType === 'pushcut') {
        return {
          ...baseConfig,
          type: 'pushcut',
          apiKey: savedApiKey || (prevConfig as PushcutConfig)?.apiKey || '',
        } as PushcutConfig;
      }
      return null; // Should be unreachable if serviceName is always pushover or pushcut
    });
  }, [serviceName]);

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Switch
            id={`${serviceName.toLowerCase()}-enable-switch`}
            checked={isEnabled}
            onCheckedChange={handleEnableToggle}
            disabled={!config} 
          />
          <Label htmlFor={`${serviceName.toLowerCase()}-enable-switch`}>
            Enable {serviceName} Service
          </Label>
        </div>
        {TestModalComponent && (
          <Button 
            variant="outline" 
            onClick={() => setIsTestModalOpen(true)} 
            disabled={!config || !config.id || (serviceName === 'Pushover' && !config.apiToken) || (serviceName === 'Pushcut' && !config.apiKey) }>
            Send Test Notification
          </Button>
        )}
      </div>
      <Separator className="my-6" />
      <ConfigFormComponent
        initialConfig={config} 
        isEnabled={isEnabled}
        onSaveSuccess={handleConfigFormSaveSuccess} // Pass the memoized callback
      />
      {TestModalComponent && (
        <TestModalComponent
          isOpen={isTestModalOpen}
          onOpenChange={setIsTestModalOpen}
          // Pass the correct config prop based on serviceName
          {...(serviceName === 'Pushover' ? { pushoverConfig: config } : {})}
          {...(serviceName === 'Pushcut' ? { pushcutConfig: config } : {})}
        />
      )}
    </>
  );
}

export function ServicesSettingsClientPageContent({
  initialPushoverConfig,
  initialPushcutConfig,
}: ServicesSettingsClientPageContentProps) {

  useEffect(() => {
    document.title = 'Settings // Fusion';
  }, []);

  return (
    <div className="grid gap-6 mt-6"> {/* Added mt-6 for spacing from PageHeader in parent */}
      <Tabs defaultValue="pushover" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pushover">Pushover</TabsTrigger>
          <TabsTrigger value="pushcut">Pushcut</TabsTrigger>
        </TabsList>

        <TabsContent value="pushover">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                  <TbBrandPushover className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                </div>
                <CardTitle>Pushover Configuration</CardTitle>
              </div>
              <CardDescription>
                Configure <a href="http://pushover.net" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Pushover</a> to send notifications.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClientServiceTab
                serviceName="Pushover"
                initialConfigData={initialPushoverConfig}
                initialIsEnabledState={initialPushoverConfig?.isEnabled ?? false}
                TestModalComponent={PushoverTestModal}
                ConfigFormComponent={ServiceConfigForm}
                updateServiceEnabledAction={updateServiceEnabledStateAction}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pushcut">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                 <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">

                  <Layers2 className="h-5 w-5 text-slate-600 dark:text-slate-400" /> 
                </div>
                <CardTitle>Pushcut Configuration</CardTitle>
              </div>
              <CardDescription>
                Configure <a href="https://www.pushcut.io" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Pushcut</a> to send rich notifications.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClientServiceTab
                serviceName="Pushcut"
                initialConfigData={initialPushcutConfig}
                initialIsEnabledState={initialPushcutConfig?.isEnabled ?? false}
                TestModalComponent={PushcutTestModal}
                ConfigFormComponent={PushcutConfigForm}
                updateServiceEnabledAction={updateServiceEnabledStateAction}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 