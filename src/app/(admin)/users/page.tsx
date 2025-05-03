import { Suspense } from 'react'; // Import Suspense
import { getUsers } from "@/lib/actions/user-actions";
import { PageHeader } from "@/components/layout/page-header";
import { Users } from 'lucide-react';
import { UsersTable, AddUserDialog, UsersTableSkeleton } from "./components"; // Import Skeleton
// TODO: Import Add User components later

export default async function UsersPage() {
  // Fetch users on the server - This will be awaited by Suspense
  // const users = await getUsers(); <-- Fetching happens inside the Suspense boundary now

  return (
    // Apply the layout structure from /devices page
    <main className="flex flex-1 flex-col gap-4 p-4 md:p-6 lg:gap-6">
      <div className="flex flex-col">
        <PageHeader
          title="User Management"
          description="Add, view, and remove system users."
          icon={<Users className="h-6 w-6" />}
          actions={<AddUserDialog />} // Keep AddUserDialog here, will style button inside it
        />
        {/* Wrap table in Suspense */}
        <Suspense fallback={<UsersTableSkeleton />}>
          <UsersTableLoader /> {/* Create a new component to handle data fetching */}
        </Suspense>
      </div>
    </main>
  );
}

// New async component to load data within the Suspense boundary
async function UsersTableLoader() {
  const users = await getUsers();
  return <UsersTable data={users} />;
} 