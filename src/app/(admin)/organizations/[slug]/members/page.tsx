import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import {
  OrganizationMembersTable,
  OrganizationMembersTableSkeleton,
  type OrganizationMemberWithUser,
} from '@/components/features/organizations/members/organization-members-table';
import { AddMemberDialog } from '@/components/features/organizations/members/add-member-dialog';
import { OrganizationMembersPageClient } from '@/components/features/organizations/members/organization-members-page-client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building2 } from 'lucide-react';
import Link from 'next/link';
import { OrganizationLogoDisplay } from '@/components/features/organizations/organization-logo-selector';
import { db } from '@/data/db';
import { organization, member, user } from '@/data/db/schema';
import { eq } from 'drizzle-orm';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

async function getOrganizationWithMembers(slug: string) {
  try {
    // Get headers for auth
    const headersList = await headers();
    
    // Use server-side auth to get organization data
    const session = await auth.api.getSession({ headers: headersList });
    if (!session) {
      return null;
    }

    // Query database directly instead of making HTTP request
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.slug, slug))
      .limit(1);

    if (!org) {
      return null;
    }

    // Get all members with user details
    const members = await db
      .select({
        id: member.id,
        userId: member.userId,
        organizationId: member.organizationId,
        role: member.role,
        createdAt: member.createdAt,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, org.id));

    return {
      organization: org,
      members,
    };
  } catch (error) {
    console.error('Error fetching organization:', error);
    return null;
  }
}

export default async function OrganizationMembersPage({ params }: PageProps) {
  const { slug } = await params;
  const orgData = await getOrganizationWithMembers(slug);

  if (!orgData || !orgData.organization) {
    notFound();
  }

  const { organization, members } = orgData;

  return (
    <div className="flex flex-col space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/organizations">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
              <OrganizationLogoDisplay 
                logo={organization.logo} 
                className="h-8 w-8 rounded-md" 
                size="default"
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{organization.name}</h1>
              <p className="text-sm text-muted-foreground">Manage organization members</p>
            </div>
          </div>
        </div>
      </div>

      {/* Members Section */}
      <div className="space-y-4">
        <Suspense fallback={<OrganizationMembersTableSkeleton />}>
          <OrganizationMembersPageClient
            organization={organization}
            initialMembers={members}
          />
        </Suspense>
      </div>
    </div>
  );
} 