'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { PushoverConfig } from "@/data/repositories/service-configurations";
import type { PushcutConfig } from "@/types/pushcut-types";
import type { OpenWeatherConfig } from "@/types/openweather-types";
import type { OpenAIConfig } from "@/types/ai/openai-service-types";
// LinearConfig type will be imported from the form component
import { ServiceConfigForm } from "@/components/features/settings/services/service-config-form";
import { PushoverTestModal } from "@/components/features/settings/services/pushover/pushover-test-modal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PushcutConfigForm } from "@/components/features/settings/services/pushcut/pushcut-config-form";
import { PushcutTestModal } from "@/components/features/settings/services/pushcut/pushcut-test-modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TbBrandPushover, TbBrandOpenai } from "react-icons/tb";
import { SiLinear } from "react-icons/si";
import { Layers2, CloudSun, Mail } from 'lucide-react';
import { OpenWeatherConfigForm } from './openweather/openweather-config-form';
import { OpenWeatherTestModal } from './openweather/openweather-test-modal';
import { OpenAIConfigForm } from './openai/openai-config-form';
import { OpenAITestModal } from './openai/openai-test-modal';
import { LinearConfigForm } from './linear/linear-config-form';
import { ResendConfigForm } from './resend/ResendConfigForm';
import { ResendTestModal } from './resend/ResendTestModal';
import type { ResendConfig } from '@/types/email/resend-types';

import { SunTimesUpdateTrigger } from './SunTimesUpdateTrigger';
import { useFusionStore } from '@/stores/store';
import { toast } from 'sonner';
import { useSession } from '@/lib/auth/client';

interface ServicesSettingsClientPageContentProps {
  initialPushoverConfig: PushoverConfig | null;
  initialPushcutConfig: PushcutConfig | null;
  initialOpenWeatherConfig: OpenWeatherConfig | null;
  initialOpenAIConfig: OpenAIConfig | null;
  initialLinearConfig: { id?: string; apiKey: string; teamId?: string; teamName?: string; isEnabled?: boolean } | null;
  initialResendConfig?: ResendConfig | null;
}

export function ServicesSettingsClientPageContent({
  initialPushoverConfig,
  initialPushcutConfig,
  initialOpenWeatherConfig,
  initialOpenAIConfig,
  initialLinearConfig,
  initialResendConfig,
}: ServicesSettingsClientPageContentProps) {

  // Get store functions for updating OpenAI status - use selector to prevent re-renders
  const fetchOpenAiStatus = useFusionStore((state) => state.fetchOpenAiStatus);
  const router = useRouter();

  // Add state for all test modals
  const [isPushoverTestModalOpen, setIsPushoverTestModalOpen] = useState(false);
  const [isPushcutTestModalOpen, setIsPushcutTestModalOpen] = useState(false);
  const [isOpenWeatherTestModalOpen, setIsOpenWeatherTestModalOpen] = useState(false);
  const [isOpenAITestModalOpen, setIsOpenAITestModalOpen] = useState(false);
  const [isTestingLinear, setIsTestingLinear] = useState(false);
  const [isResendTestModalOpen, setIsResendTestModalOpen] = useState(false);
  const { data: session } = useSession();
  const currentUserEmail = (session?.user as any)?.email as string | undefined;


  // Stabilize the callback to prevent re-render loops
  const handleOpenAiSaveSuccess = useCallback((savedIsEnabled: boolean, savedConfigId?: string, savedApiKey?: string) => {
    // Update the store's OpenAI status when settings are saved
    console.log('[Settings] OpenAI config saved, refreshing store status...');
    fetchOpenAiStatus();
  }, [fetchOpenAiStatus]);

  useEffect(() => {
    document.title = 'Settings // Fusion';
  }, []);

  // Handle Linear test
  const handleTestLinear = async () => {
    if (!initialLinearConfig?.apiKey) {
      toast.error('Please enter an API key first');
      return;
    }
    
    setIsTestingLinear(true);

    try {
      const response = await fetch('/api/services/linear/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: initialLinearConfig.apiKey }),
      });

      const results = await response.json();
      
      if (results.success) {
        toast.success(`Connected successfully as ${results.user?.displayName || results.user?.name}! Found ${results.teams?.length || 0} teams.`);
      } else {
        toast.error(`Connection failed: ${results.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error testing Linear connection:', error);
      toast.error('Network error while testing connection');
    } finally {
      setIsTestingLinear(false);
    }
  };

  return (
    <div className="grid gap-6 mt-6"> {/* Added mt-6 for spacing from PageHeader in parent */}
      <Tabs defaultValue="pushover" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pushover">
            <span className="flex items-center gap-2">
              <TbBrandPushover className="h-4 w-4" />
              Pushover
            </span>
          </TabsTrigger>
          <TabsTrigger value="pushcut">
            <span className="flex items-center gap-2">
              <Layers2 className="h-4 w-4" />
              Pushcut
            </span>
          </TabsTrigger>
          <TabsTrigger value="openweather">
            <span className="flex items-center gap-2">
              <CloudSun className="h-4 w-4" />
              OpenWeather
            </span>
          </TabsTrigger>
          <TabsTrigger value="openai">
            <span className="flex items-center gap-2">
              <TbBrandOpenai className="h-4 w-4" />
              OpenAI
            </span>
          </TabsTrigger>
          <TabsTrigger value="linear">
            <span className="flex items-center gap-2">
              <SiLinear className="h-4 w-4" />
              Linear
            </span>
          </TabsTrigger>
          <TabsTrigger value="resend">
            <span className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Resend
            </span>
          </TabsTrigger>
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
              {/* Test button and Pushover form without the separate toggle */}
              <div className="flex items-center justify-end mb-6">
                <Button 
                  variant="outline" 
                  onClick={() => setIsPushoverTestModalOpen(true)} 
                  disabled={!initialPushoverConfig || !initialPushoverConfig.id || !initialPushoverConfig.apiToken}>
                  Send Test Notification
                </Button>
              </div>
              <ServiceConfigForm
                initialConfig={initialPushoverConfig} 
                isEnabled={initialPushoverConfig?.isEnabled ?? false}
                onSaveSuccess={(savedIsEnabled: boolean) => {
                  // Handle success but no longer need to manage separate toggle state
                }} 
              />
            </CardContent>
          </Card>
          
          {/* Pushover Test Modal */}
          <PushoverTestModal
            isOpen={isPushoverTestModalOpen}
            onOpenChange={setIsPushoverTestModalOpen}
            pushoverConfig={initialPushoverConfig}
          />
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
              {/* Test button and Pushcut form without the separate toggle */}
              <div className="flex items-center justify-end mb-6">
                <Button 
                  variant="outline" 
                  onClick={() => setIsPushcutTestModalOpen(true)} 
                  disabled={!initialPushcutConfig || !initialPushcutConfig.id || !initialPushcutConfig.apiKey}>
                  Send Test Notification
                </Button>
              </div>
              <PushcutConfigForm
                initialConfig={initialPushcutConfig} 
                isEnabled={initialPushcutConfig?.isEnabled ?? false}
                onSaveSuccess={(savedIsEnabled: boolean, savedConfigId?: string, savedApiKey?: string) => {
                  // Handle success but no longer need to manage separate toggle state
                }} 
              />
            </CardContent>
          </Card>
          
          {/* Pushcut Test Modal */}
          <PushcutTestModal
            isOpen={isPushcutTestModalOpen}
            onOpenChange={setIsPushcutTestModalOpen}
            pushcutConfig={initialPushcutConfig}
          />
        </TabsContent>

        <TabsContent value="openweather">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                  <CloudSun className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                </div>
                <CardTitle>OpenWeather Configuration</CardTitle>
              </div>
              <CardDescription>
                Configure <a href="https://openweathermap.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">OpenWeather</a> for sunrise/sunset data and weather information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Test button and OpenWeather form without the separate toggle */}
              <div className="flex items-center justify-end mb-6">
                <Button 
                  variant="outline" 
                  onClick={() => setIsOpenWeatherTestModalOpen(true)} 
                  disabled={!initialOpenWeatherConfig || !initialOpenWeatherConfig.id || !initialOpenWeatherConfig.apiKey}>
                  Test Weather API
                </Button>
              </div>
              <OpenWeatherConfigForm
                initialConfig={initialOpenWeatherConfig} 
                isEnabled={initialOpenWeatherConfig?.isEnabled ?? false}
                onSaveSuccess={(savedIsEnabled: boolean, savedConfigId?: string, savedApiKey?: string) => {
                  // Handle success but no longer need to manage separate toggle state
                }} 
              />
            </CardContent>
          </Card>
          
          {/* OpenWeather Test Modal */}
          <OpenWeatherTestModal
            isOpen={isOpenWeatherTestModalOpen}
            onOpenChange={setIsOpenWeatherTestModalOpen}
            openWeatherConfig={initialOpenWeatherConfig}
          />
          
          {/* Sun Times Update Trigger - only show if OpenWeather is configured */}
          {initialOpenWeatherConfig?.apiKey && (
            <SunTimesUpdateTrigger />
          )}
        </TabsContent>

        <TabsContent value="openai">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                  <TbBrandOpenai className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                </div>
                <CardTitle>OpenAI Configuration</CardTitle>
              </div>
              <CardDescription>
                Configure <a href="https://openai.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">OpenAI</a> for AI-powered features and intelligent analysis.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Test button and OpenAI form without the separate toggle */}
              <div className="flex items-center justify-end mb-6">
                <Button 
                  variant="outline" 
                  onClick={() => setIsOpenAITestModalOpen(true)} 
                  disabled={!initialOpenAIConfig || !initialOpenAIConfig.id || !initialOpenAIConfig.apiKey}>
                  Test OpenAI API
                </Button>
              </div>
              <OpenAIConfigForm
                initialConfig={initialOpenAIConfig} 
                isEnabled={initialOpenAIConfig?.isEnabled ?? false}
                onSaveSuccess={handleOpenAiSaveSuccess}
              />
            </CardContent>
          </Card>
          
          {/* OpenAI Test Modal */}
          <OpenAITestModal
            isOpen={isOpenAITestModalOpen}
            onOpenChange={setIsOpenAITestModalOpen}
            openAIConfig={initialOpenAIConfig}
          />
        </TabsContent>

        <TabsContent value="linear">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                  <SiLinear className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                </div>
                <CardTitle>Linear Configuration</CardTitle>
              </div>
              <CardDescription>
                Configure <a href="https://linear.app" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Linear</a> to sync and manage project tasks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Test button and Linear form */}
              <div className="flex items-center justify-end mb-6">
                <Button 
                  variant="outline" 
                  onClick={handleTestLinear} 
                  disabled={!initialLinearConfig || !initialLinearConfig.apiKey || isTestingLinear}>
                  {isTestingLinear ? 'Testing...' : 'Test Linear API'}
                </Button>
              </div>
              <LinearConfigForm
                initialConfig={initialLinearConfig} 
                isEnabled={initialLinearConfig?.isEnabled ?? false}
                onSaveSuccess={(savedIsEnabled: boolean, savedConfigId?: string, savedApiKey?: string) => {
                  // Handle success
                }} 
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resend">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                  <Mail className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                </div>
                <CardTitle>Resend Configuration</CardTitle>
              </div>
              <CardDescription>
                Configure <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Resend</a> to send transactional emails using React Email.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-end mb-6 gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsResendTestModalOpen(true)}
                  disabled={!initialResendConfig || !initialResendConfig.id || !initialResendConfig.apiKey || !initialResendConfig.fromEmail || !initialResendConfig.isEnabled}
                >
                  Send Test Email
                </Button>
              </div>
              <ResendConfigForm
                initialConfig={initialResendConfig || null}
                isEnabled={initialResendConfig?.isEnabled ?? false}
                onSaveSuccess={() => {
                  // Ensure the latest server state is reflected immediately
                  router.refresh();
                }}
              />
            </CardContent>
          </Card>

          <ResendTestModal
            isOpen={isResendTestModalOpen}
            onOpenChange={setIsResendTestModalOpen}
            resendConfig={initialResendConfig || null}
            defaultRecipientEmail={currentUserEmail}
          />
          {/* Preview removed */}
        </TabsContent>
      </Tabs>
    </div>
  );
} 