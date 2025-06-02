import { Suspense } from 'react';
import { PageHeader } from "@/components/layout/page-header";
import { Building2 } from 'lucide-react';
import { OrganizationsTableLoader } from "@/components/features/organizations/organizations-table-loader";
import { CreateOrganizationDialog } from "@/components/features/organizations/create-organization-dialog";
import { auth } from '@/lib/auth/server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

// Skeleton component for Suspense fallback
function OrganizationsTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4 p-4 font-medium border-b bg-muted/50 rounded-t-md border">
        <div className="h-4 bg-muted animate-pulse rounded" />
        <div className="h-4 bg-muted animate-pulse rounded" />
        <div className="h-4 bg-muted animate-pulse rounded" />
        <div className="h-4 bg-muted animate-pulse rounded" />
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="grid grid-cols-4 gap-4 p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-muted animate-pulse rounded" />
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-4 w-24 bg-muted animate-pulse rounded" />
          <div className="h-4 w-20 bg-muted animate-pulse rounded" />
          <div className="h-4 w-16 bg-muted animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}

export default async function OrganizationsPage() {
  const resolvedHeaders = await headers();
  // Try constructing a plain object for headers
  const plainHeaders: Record<string, string> = {};
  for (const [key, value] of resolvedHeaders.entries()) {
    plainHeaders[key] = value;
  }
  
  const session = await auth.api.getSession({ headers: plainHeaders as any });

  if (!session?.user) {
    redirect('/login');
    return null;
  }

  const userRole = (session.user as any)?.role;

  if (userRole !== 'admin') {
    redirect('/');
    return null;
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:p-6 lg:gap-6">
      <div className="flex flex-col">
        <PageHeader
          title="Organization Management"
          description="Create and manage organizations for multi-tenant access."
          icon={<Building2 className="h-6 w-6" />}
          actions={<CreateOrganizationDialog />}
        />
        <Suspense fallback={<OrganizationsTableSkeleton />}>
          <OrganizationsTableLoader />
        </Suspense>
      </div>
    </main>
  );
} 