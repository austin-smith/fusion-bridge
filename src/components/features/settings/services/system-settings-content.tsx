'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Settings, Key } from 'lucide-react';
import { ServicesSettingsClientPageContent } from './services-settings-client-page';
import { AdminApiKeysContent } from '../../../../components/api-keys/admin-api-keys-content'; // New client component

const systemSettingsTabs = [
  {
    id: 'services',
    label: 'Services',
    icon: Settings,
  },
  {
    id: 'api-keys',
    label: 'API Keys',
    icon: Key,
  },
];

interface SystemSettingsContentProps {
  initialPushoverConfig: any;
  initialPushcutConfig: any;
  initialOpenWeatherConfig: any;
  initialOpenAIConfig: any;
}

export function SystemSettingsContent({ 
  initialPushoverConfig, 
  initialPushcutConfig,
  initialOpenWeatherConfig,
  initialOpenAIConfig 
}: SystemSettingsContentProps) {
  const [activeTab, setActiveTab] = useState('services');

  const renderContent = () => {
    switch (activeTab) {
      case 'services':
        return (
          <ServicesSettingsClientPageContent
            initialPushoverConfig={initialPushoverConfig}
            initialPushcutConfig={initialPushcutConfig}
            initialOpenWeatherConfig={initialOpenWeatherConfig}
            initialOpenAIConfig={initialOpenAIConfig}
          />
        );
      case 'api-keys':
        return <AdminApiKeysContent />;
      default:
        return (
          <ServicesSettingsClientPageContent
            initialPushoverConfig={initialPushoverConfig}
            initialPushcutConfig={initialPushcutConfig}
            initialOpenWeatherConfig={initialOpenWeatherConfig}
            initialOpenAIConfig={initialOpenAIConfig}
          />
        );
    }
  };

  return (
    <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
      {/* Sidebar Navigation */}
      <aside className="lg:w-1/5">
        <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1">
          {systemSettingsTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  activeTab === tab.id
                    ? 'bg-accent text-accent-foreground'
                    : 'transparent'
                )}
              >
                <Icon className="mr-2 h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1">
        <div className="space-y-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
} 