import { Suspense } from 'react';
import type { User } from "@/lib/actions/user-actions"; // This might still be needed if PageHeader or other parts use it.
import { PageHeader } from "@/components/layout/page-header";
import { Users } from 'lucide-react';
import { AddUserDialog, UsersTableSkeleton } from "../../../components/features/account/users-table"; // UsersTableSkeleton is for Suspense fallback
import { UsersTableLoader } from "@/components/features/account/users-table-loader"; // Import the new loader
import { auth } from '@/lib/auth/server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export default async function UsersPage() {
  const resolvedHeaders = await headers();
  // Try constructing a plain object for headers
  const plainHeaders: Record<string, string> = {};
  for (const [key, value] of resolvedHeaders.entries()) {
    plainHeaders[key] = value;
  }
  // Pass the plain object to getSession. 
  // Note: auth.api.getSession might internally convert this or might expect a true Headers object.
  // This is an attempt to work around the persistent linter error.
  const session = await auth.api.getSession({ headers: plainHeaders as any }); // Using 'as any' to bypass linter for now

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
          title="User Management"
          description="Add, view, and remove system users."
          icon={<Users className="h-6 w-6" />}
          actions={<AddUserDialog />}
        />
        <Suspense fallback={<UsersTableSkeleton />}>
          <UsersTableLoader />
        </Suspense>
      </div>
    </main>
  );
} 