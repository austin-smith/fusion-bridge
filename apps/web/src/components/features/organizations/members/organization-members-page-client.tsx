'use client';

import {
  OrganizationMembersTable,
  type OrganizationMemberWithUser,
} from '@/components/features/organizations/members/organization-members-table';
import { AddMemberDialog } from '@/components/features/organizations/members/add-member-dialog';
import { useRouter } from 'next/navigation';

interface OrganizationMembersPageClientProps {
  organization: {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
  };
  initialMembers: OrganizationMemberWithUser[];
}

export function OrganizationMembersPageClient({
  organization,
  initialMembers,
}: OrganizationMembersPageClientProps) {
  const router = useRouter();
  const existingMemberIds = new Set<string>(initialMembers.map((m) => m.userId));

  const handleMemberAdded = () => {
    // Refresh the entire page to get updated data
    router.refresh();
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground">
            {initialMembers.length} member{initialMembers.length !== 1 ? 's' : ''} in this organization
          </p>
        </div>
        <AddMemberDialog
          organizationId={organization.id}
          organizationSlug={organization.slug}
          existingMemberIds={existingMemberIds}
          onMemberAdded={handleMemberAdded}
        />
      </div>

      <OrganizationMembersTable data={initialMembers} />
    </>
  );
} 