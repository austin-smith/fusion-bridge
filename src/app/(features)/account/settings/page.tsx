'use client';

import React, { useState } from 'react';
import { withPageAuth } from '@/lib/auth/withPageAuth';
import { cn } from '@/lib/utils';
import { User, Shield, Key, Palette } from 'lucide-react';
import { ProfileSettings } from '@/components/features/account/ProfileSettings';
import { SecuritySettings } from '@/components/features/account/SecuritySettings';
import { ApiKeysSettings } from '@/components/api-keys/ApiKeysSettings';
import { AppearanceSettings } from '@/components/features/account/AppearanceSettings';
import { useSession } from '@/lib/auth/client';

const settingsTabs = [
  {
    id: 'profile',
    label: 'Profile',
    icon: User,
  },
  {
    id: 'security',
    label: 'Security',
    icon: Shield,
  },
  {
    id: 'api-keys',
    label: 'API Keys',
    icon: Key,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
  },
];

function SettingsPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState('profile');

  if (!session?.user) {
    return <div>Loading...</div>;
  }

  // Convert session user to UserData format
  const userData = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image || null,
    twoFactorEnabled: session.user.twoFactorEnabled || false,
    keypadPin: (session.user as any).keypadPin || null,
    keypadPinSetAt: (session.user as any).keypadPinSetAt || null,
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return <ProfileSettings user={userData} />;
      case 'security':
        return <SecuritySettings user={userData} />;
      case 'api-keys':
        return <ApiKeysSettings user={userData} />;
      case 'appearance':
        return <AppearanceSettings />;
      default:
        return <ProfileSettings user={userData} />;
    }
  };

  return (
    <div className="container mx-auto py-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences.
        </p>
      </div>

      {/* Settings Layout */}
      <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
        {/* Sidebar Navigation */}
        <aside className="lg:w-1/5">
          <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1">
            {settingsTabs.map((tab) => {
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
        <div className="flex-1 lg:max-w-2xl">
          <div className="space-y-6">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default withPageAuth(SettingsPage); 