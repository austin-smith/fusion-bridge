import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth } from '@/lib/auth/withApiRouteAuth';
import { authClient } from '@/lib/auth/client';
import { auth } from '@/lib/auth/server';
import { db } from '@/data/db';
import { organization, member, user } from '@/data/db/schema';
import { eq, and } from 'drizzle-orm';

async function handler(
  request: NextRequest,
  authContext: any,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    // Find organization by slug
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.slug, slug))
      .limit(1);

    if (!org) {
      return NextResponse.json(
        { success: false, error: 'Organization not found' },
        { status: 404 }
      );
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

    return NextResponse.json({
      success: true,
      data: {
        organization: org,
        members,
      },
    });
  } catch (error) {
    console.error('Error fetching organization members:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch organization members' },
      { status: 500 }
    );
  }
}

export const GET = withApiRouteAuth(handler); 