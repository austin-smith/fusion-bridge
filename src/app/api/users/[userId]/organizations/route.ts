import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth } from '@/lib/auth/withApiRouteAuth';
import { db } from '@/data/db';
import { member, organization, user } from '@/data/db/schema';
import { eq, and } from 'drizzle-orm';

async function handler(
  request: NextRequest,
  authContext: any,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  try {
    // Verify that the requesting user is an admin
    const userRole = (authContext.user as any)?.role;
    if (userRole !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Check if the target user exists
    const [targetUser] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Get all organizations the user is a member of
    const userOrganizations = await db
      .select({
        membership: {
          id: member.id,
          role: member.role,
          createdAt: member.createdAt,
        },
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          logo: organization.logo,
          createdAt: organization.createdAt,
        },
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, userId))
      .orderBy(organization.name);

    return NextResponse.json({
      success: true,
      data: {
        user: targetUser,
        organizations: userOrganizations,
      },
    });
  } catch (error) {
    console.error('Error fetching user organizations:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user organizations' },
      { status: 500 }
    );
  }
}

export const GET = withApiRouteAuth(handler); 