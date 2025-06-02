import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth } from '@/lib/auth/withApiRouteAuth';
import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { db } from '@/data/db';
import { user as userTable, member as memberTable } from '@/data/db/schema';
import { eq, and } from 'drizzle-orm';

const AddMemberSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  role: z.enum(['member', 'admin']),
});

async function handler(request: NextRequest, authContext: any) {
  try {
    const body = await request.json();
    const validatedData = AddMemberSchema.parse(body);
    
    // Check if user exists
    const [targetUser] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, validatedData.userId))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user is already a member
    const existingMember = await db
      .select()
      .from(memberTable)
      .where(
        and(
          eq(memberTable.userId, validatedData.userId),
          eq(memberTable.organizationId, validatedData.organizationId)
        )
      )
      .limit(1);

    if (existingMember.length > 0) {
      return NextResponse.json(
        { success: false, error: 'User is already a member of this organization' },
        { status: 400 }
      );
    }

    // Use Better Auth's server API to add member
    const headersList = await headers();
    const result = await auth.api.addMember({
      body: {
        userId: validatedData.userId,
        organizationId: validatedData.organizationId,
        role: validatedData.role,
      },
      headers: headersList,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error adding member:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to add member' },
      { status: 500 }
    );
  }
}

export const POST = withApiRouteAuth(handler); 