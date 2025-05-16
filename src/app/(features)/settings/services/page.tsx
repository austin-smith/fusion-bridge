import { getPushoverConfiguration } from "@/data/repositories/service-configurations";
import { getPushcutConfiguration } from "@/data/repositories/service-configurations";
import { PageHeader } from "@/components/layout/page-header"; 
import { Settings } from 'lucide-react';
import { ServicesSettingsClientPageContent } from './services-settings-client-page'; // New client component

// Import server-side auth utilities (ensure this path is correct for your project)
// Assuming you have a way to get session on the server, e.g., next-auth getServerSession or a custom helper
// For this example, let's assume a helper `getServerSession` or similar exists.
// import { getServerSession } from 'next-auth/next'; 
// import { authOptions } from '@/app/api/auth/[...nextauth]/route'; // Adjust to your auth options path

// A placeholder for actual server-side session fetching. 
// Replace with your actual auth mechanism (e.g., next-auth, lucia-auth, etc.)
async function getServerSideSession() {
  // This is a mock. In a real app, you would use your auth library's methods.
  // For example, with next-auth:
  // const session = await getServerSession(authOptions);
  // return session;
  // For now, returning a mock session that implies admin for demonstration.
  return {
    user: { role: 'admin' } // Ensure your actual session has a comparable structure
  };
}

export default async function ServicesSettingsPage() {
  // Fetch session data on the server
  const session = await getServerSideSession(); 

  // Server-side authorization check
  // Type assertion for role might be needed depending on your session type
  if (!session?.user || (session.user as any)?.role !== 'admin') {
    // In Next.js 13+ App Router, redirect is a function from 'next/navigation'
    const { redirect } = await import('next/navigation');
    redirect('/'); // Or to an unauthorized page
    return null; // Important to return null after redirect to stop further rendering
  }

  // Fetch configurations on the server
  const pushoverConfig = await getPushoverConfiguration();
  const pushcutConfig = await getPushcutConfiguration();

  return (
    <div className="container py-6">
      <PageHeader 
        title="Settings"
        description="Configure application settings and third-party integrations."
        icon={<Settings className="h-6 w-6" />}
      />
      {/* Render the new client component, passing fetched data as props */}
      <ServicesSettingsClientPageContent
        initialPushoverConfig={pushoverConfig}
        initialPushcutConfig={pushcutConfig}
      />
    </div>
  );
} 