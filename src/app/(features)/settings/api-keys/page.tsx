import { PageHeader } from "@/components/layout/page-header"; 
import { Key } from 'lucide-react';
import { AdminApiKeysContent } from '../../../../components/api-keys/admin-api-keys-content'; // New client component
import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AdminApiKeysPage() {
  // Get server-side session using better-auth
  const session = await auth.api.getSession({ headers: await headers() });

  // Server-side authorization check
  if (!session?.user || (session.user as any)?.role !== 'admin') {
    redirect('/'); // Redirect non-admin users
    return null;
  }

  return (
    <div className="container py-6">
      <PageHeader 
        title="API Key Management"
        description="Manage API keys for all users in the system."
        icon={<Key className="h-6 w-6" />}
      />
      {/* Render the client component for API key management */}
      <AdminApiKeysContent />
    </div>
  );
} 