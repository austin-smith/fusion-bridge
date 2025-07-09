'use client';

import React, { useState, useEffect } from 'react';
import { withPageAuth } from '@/lib/auth/withPageAuth';
import { cn } from '@/lib/utils';
import { User, Shield, Palette, Building2 } from 'lucide-react';
import { ProfileSettings } from '@/components/features/account/ProfileSettings';
import { SecuritySettings } from '@/components/features/account/SecuritySettings';
import { AppearanceSettings } from '@/components/features/account/AppearanceSettings';
import { OrganizationSettings } from '@/components/features/account/OrganizationSettings';
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
    id: 'organization',
    label: 'Organization',
    icon: Building2,
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

  // Check for tab parameter in URL on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && settingsTabs.some(tab => tab.id === tabParam)) {
      setActiveTab(tabParam);
      // Clean up URL by removing the tab parameter
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('tab');
      window.history.replaceState({}, '', newUrl.pathname);
    }
  }, []);

  if (!session?.user) {
    return <div>Loading...</div>;
  }

  // Convert session user to UserData format
  const userData = {
    id: session.user.id,
    name: session.user.name || 'Unknown User',
    email: session.user.email || 'Unknown Email',
    image: session.user.image || null,
    twoFactorEnabled: session.user.twoFactorEnabled || false,
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return <ProfileSettings user={userData} />;
      case 'security':
        return <SecuritySettings user={userData} />;
      case 'organization':
        return <OrganizationSettings user={userData} />;
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