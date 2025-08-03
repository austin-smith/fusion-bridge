'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Settings, Key, BookOpen, ExternalLink, Award, Database } from 'lucide-react';
import { ServicesSettingsClientPageContent } from './services-settings-client-page';
import { AdminApiKeysContent } from '../../../../components/api-keys/admin-api-keys-content';
import { AttributionContent } from './attribution-content';
import { EventRetentionSettings } from './event-retention-settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFusionStore } from '@/stores/store';

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
  {
    id: 'event-retention',
    label: 'Event Retention',
    icon: Database,
  },
  {
    id: 'api-docs',
    label: 'API Documentation',
    icon: BookOpen,
  },
  {
    id: 'attribution',
    label: 'Attribution',
    icon: Award,
  },
];

function ApiDocumentationContent() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">API Documentation</h3>
        <p className="text-sm text-muted-foreground">
          Access comprehensive documentation for the Fusion API including endpoints, authentication, and examples.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Interactive API Reference
          </CardTitle>
          <CardDescription>
            Browse and test API endpoints directly in your browser with our interactive documentation powered by Scalar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="inline-flex items-center gap-2">
            <a href="/api/docs/reference" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open API Documentation
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
          <CardDescription>
            Quick guide to using the Fusion API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Authentication</h4>
            <p className="text-sm text-muted-foreground">
              All API requests require authentication using API keys sent in the <code className="text-xs bg-muted px-1 py-0.5 rounded">x-api-key</code> header. Manage your API keys in <strong>Account Settings → Organization</strong> tab or via the <strong>API Keys</strong> tab above.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-2">Base URL</h4>
            <code className="text-sm bg-muted px-2 py-1 rounded">
              {typeof window !== 'undefined' ? window.location.origin : ''}/api
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}



interface SystemSettingsContentProps {
  initialPushoverConfig: any;
  initialPushcutConfig: any;
  initialOpenWeatherConfig: any;
  initialOpenAIConfig: any;
  initialLinearConfig: any;
}

export function SystemSettingsContent({ 
  initialPushoverConfig, 
  initialPushcutConfig,
  initialOpenWeatherConfig,
  initialOpenAIConfig,
  initialLinearConfig 
}: SystemSettingsContentProps) {
  const [activeTab, setActiveTab] = useState('services');
  const activeOrganizationId = useFusionStore(state => state.activeOrganizationId);

  const renderContent = () => {
    switch (activeTab) {
      case 'services':
        return (
          <ServicesSettingsClientPageContent
            initialPushoverConfig={initialPushoverConfig}
            initialPushcutConfig={initialPushcutConfig}
            initialOpenWeatherConfig={initialOpenWeatherConfig}
            initialOpenAIConfig={initialOpenAIConfig}
            initialLinearConfig={initialLinearConfig}
          />
        );
      case 'api-keys':
        return <AdminApiKeysContent />;
      case 'event-retention':
        return <EventRetentionSettings organizationId={activeOrganizationId!} />;
      case 'api-docs':
        return <ApiDocumentationContent />;
      case 'attribution':
        return <AttributionContent />;
      default:
        return (
          <ServicesSettingsClientPageContent
            initialPushoverConfig={initialPushoverConfig}
            initialPushcutConfig={initialPushcutConfig}
            initialOpenWeatherConfig={initialOpenWeatherConfig}
            initialOpenAIConfig={initialOpenAIConfig}
            initialLinearConfig={initialLinearConfig}
          />
        );
    }
  };

  return (
    <div className="flex flex-col space-y-8 xl:flex-row xl:space-x-12 xl:space-y-0">
      {/* Sidebar Navigation */}
      <aside className="xl:w-1/5">
        <nav className="flex flex-col space-y-1 sm:flex-row sm:space-y-0 sm:space-x-2 xl:flex-col xl:space-x-0 xl:space-y-1">
          {systemSettingsTabs.map((tab) => {
            const Icon = tab.icon;
            const buttonClasses = cn(
              'flex items-center justify-start rounded-md px-3 py-2 text-sm font-medium transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              'sm:justify-center xl:justify-start',
              'whitespace-nowrap',
              activeTab === tab.id
                ? 'bg-accent text-accent-foreground'
                : 'transparent'
            );

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={buttonClasses}
              >
                <Icon className="mr-2 h-4 w-4 flex-shrink-0" />
                <span className="truncate">{tab.label}</span>
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