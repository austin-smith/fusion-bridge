'use client';

import React, { useEffect, useState } from 'react';
import type { PushoverConfig } from "@/data/repositories/service-configurations";
import type { PushcutConfig } from "@/types/pushcut-types";
import type { OpenWeatherConfig } from "@/types/openweather-types";
import type { OpenAIConfig } from "@/types/openai-service-types";
import { ServiceConfigForm } from "@/components/features/settings/services/service-config-form";
import { PushoverTestModal } from "@/components/features/settings/services/pushover/pushover-test-modal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PushcutConfigForm } from "@/components/features/settings/services/pushcut/pushcut-config-form";
import { PushcutTestModal } from "@/components/features/settings/services/pushcut/pushcut-test-modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TbBrandPushover, TbBrandOpenai } from "react-icons/tb";
import { Layers2, CloudSun } from 'lucide-react';
import { OpenWeatherConfigForm } from './openweather/openweather-config-form';
import { OpenWeatherTestModal } from './openweather/openweather-test-modal';
import { OpenAIConfigForm } from './openai/openai-config-form';
import { OpenAITestModal } from './openai/openai-test-modal';
import { SunTimesUpdateTrigger } from './SunTimesUpdateTrigger';

interface ServicesSettingsClientPageContentProps {
  initialPushoverConfig: PushoverConfig | null;
  initialPushcutConfig: PushcutConfig | null;
  initialOpenWeatherConfig: OpenWeatherConfig | null;
  initialOpenAIConfig: OpenAIConfig | null;
}

export function ServicesSettingsClientPageContent({
  initialPushoverConfig,
  initialPushcutConfig,
  initialOpenWeatherConfig,
  initialOpenAIConfig,
}: ServicesSettingsClientPageContentProps) {

  // Add state for all test modals
  const [isPushoverTestModalOpen, setIsPushoverTestModalOpen] = useState(false);
  const [isPushcutTestModalOpen, setIsPushcutTestModalOpen] = useState(false);
  const [isOpenWeatherTestModalOpen, setIsOpenWeatherTestModalOpen] = useState(false);
  const [isOpenAITestModalOpen, setIsOpenAITestModalOpen] = useState(false);

  useEffect(() => {
    document.title = 'Settings // Fusion';
  }, []);

  return (
    <div className="grid gap-6 mt-6"> {/* Added mt-6 for spacing from PageHeader in parent */}
      <Tabs defaultValue="pushover" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pushover">Pushover</TabsTrigger>
          <TabsTrigger value="pushcut">Pushcut</TabsTrigger>
          <TabsTrigger value="openweather">OpenWeather</TabsTrigger>
          <TabsTrigger value="openai">OpenAI</TabsTrigger>
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
                onSaveSuccess={(savedIsEnabled: boolean, savedConfigId?: string, savedApiKey?: string) => {
                  // Handle success but no longer need to manage separate toggle state
                }} 
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
      </Tabs>
    </div>
  );
} 