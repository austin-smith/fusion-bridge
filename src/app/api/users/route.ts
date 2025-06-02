import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth } from '@/lib/auth/withApiRouteAuth';
import { db } from '@/data/db';
import { user } from '@/data/db/schema';
import { desc } from 'drizzle-orm';

async function handler(request: NextRequest, authContext: any) {
  try {
    // Fetch all users with basic info
    const users = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        createdAt: user.createdAt,
        twoFactorEnabled: user.twoFactorEnabled,
      })
      .from(user)
      .orderBy(desc(user.createdAt));

    return NextResponse.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

export const GET = withApiRouteAuth(handler); 