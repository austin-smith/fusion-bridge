'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { getPushoverConfiguration, type PushoverConfig } from "@/data/repositories/service-configurations";
import { ServiceConfigForm } from "@/components/settings/services/service-config-form";
import { PushoverTestModal } from "@/components/settings/services/pushover/pushover-test-modal";
import { PageHeader } from "@/components/layout/page-header"; 
import { Settings, AlertCircle, X } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { TbBrandPushover } from "react-icons/tb";

// Skeleton for the form area
const ServiceConfigSkeleton = () => {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center p-6 border-b">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-40 mt-1" />
          </div>
        </div>
      </div>
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex justify-between pt-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    </Card>
  );
};

export default function ServiceSettingsPage() {
  const [pushoverConfig, setPushoverConfig] = useState<PushoverConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // State for the Switch component
  const [isPushoverEnabled, setIsPushoverEnabled] = useState(true); // Default to true
  // State for test modal
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  useEffect(() => {
    document.title = 'Settings // Fusion';
  }, []);

  const fetchConfiguration = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const config = await getPushoverConfiguration();
      setPushoverConfig(config);
      // Set the switch state directly after fetching
      setIsPushoverEnabled(config?.isEnabled ?? true); // Default to true if no config found
    } catch (err) {
      console.error("Failed to fetch Pushover configuration:", err);
      setError("Failed to load Pushover configuration. Please try again.");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchConfiguration();
  }, [fetchConfiguration]);

  return (
    <div className="container py-6">
      <PageHeader 
        title="Settings"
        description="Configure application settings and third-party integrations."
        icon={<Settings className="h-6 w-6" />}
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error}
            <button 
              onClick={() => setError(null)}
              className="absolute top-2 right-2 p-1 rounded-md hover:bg-destructive/20"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </AlertDescription>
        </Alert>
      )}

      {/* Service configurations grid - each service has its own card */}
      <div className="grid gap-6">
        {/* Pushover Configuration */}
        {isLoading ? (
          <ServiceConfigSkeleton />
        ) : (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                  <TbBrandPushover className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">Pushover</CardTitle>
                  <CardDescription className="mt-1">
                    Mobile push notifications service
                  </CardDescription>
                </div>
              </div>
              <Switch
                checked={isPushoverEnabled}
                onCheckedChange={setIsPushoverEnabled}
                aria-label="Enable Pushover Service"
              />
            </div>
            <CardContent className="p-6">
              <ServiceConfigForm 
                initialConfig={pushoverConfig} 
                onTestClick={() => setIsTestModalOpen(true)}
                isEnabled={isPushoverEnabled}
                onEnabledChange={setIsPushoverEnabled}
                onSaveSuccess={(savedState) => {
                  console.log('[Page] Save successful, updating toggle state to:', savedState);
                  setIsPushoverEnabled(savedState);
                  // Optionally trigger a manual refetch here if needed, though revalidatePath should handle it eventually
                  // fetchConfiguration(); 
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* 
          Future service configurations would be added here as separate cards
          Example:
          <Card>
            <CardHeader>
              <CardTitle>SMTP Email</CardTitle>
              <CardDescription>Configure SMTP for sending email notifications.</CardDescription>
            </CardHeader>
            <CardContent>
              <EmailConfigForm initialConfig={emailConfig} />
            </CardContent>
          </Card>
        */}
      </div>

      {/* Test Modal */}
      <PushoverTestModal 
        isOpen={isTestModalOpen} 
        onOpenChange={setIsTestModalOpen} 
        pushoverConfig={pushoverConfig} 
      />
    </div>
  );
} 