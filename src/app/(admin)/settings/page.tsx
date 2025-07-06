import { getPushoverConfiguration } from "@/data/repositories/service-configurations";
import { getPushcutConfiguration } from "@/data/repositories/service-configurations";
import { getOpenWeatherConfiguration } from "@/data/repositories/service-configurations";
import { getOpenAIConfiguration } from "@/data/repositories/service-configurations";
import { PageHeader } from "@/components/layout/page-header"; 
import { Settings } from 'lucide-react';
import { SystemSettingsContent } from '../../../components/features/settings/services/system-settings-content'; // New unified client component
import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function SystemSettingsPage() {
  // Get server-side session using better-auth
  const session = await auth.api.getSession({ headers: await headers() });

  // Server-side authorization check
  if (!session?.user || (session.user as any)?.role !== 'admin') {
    redirect('/'); // Redirect non-admin users
    return null;
  }

  // Fetch configurations on the server
  const pushoverConfig = await getPushoverConfiguration();
  const pushcutConfig = await getPushcutConfiguration();
  const openWeatherConfig = await getOpenWeatherConfiguration();
  const openAIConfig = await getOpenAIConfiguration();

  return (
    <div className="container py-6">
      <PageHeader 
        title="System Settings"
        description="Configure application settings, integrations, and system-wide features."
        icon={<Settings className="h-6 w-6" />}
      />
      {/* Render the unified client component with all system settings */}
      <SystemSettingsContent
        initialPushoverConfig={pushoverConfig}
        initialPushcutConfig={pushcutConfig}
        initialOpenWeatherConfig={openWeatherConfig}
        initialOpenAIConfig={openAIConfig}
      />
    </div>
  );
} 