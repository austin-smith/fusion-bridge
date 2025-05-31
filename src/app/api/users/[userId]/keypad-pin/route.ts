import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/data/db';
import { user } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { withApiRouteAuth, type ApiRouteAuthContext, type RouteContext } from '@/lib/auth/withApiRouteAuth';

// Helper function to hash PIN using Node.js crypto
function hashPin(pin: string): string {
  return crypto.pbkdf2Sync(pin, 'pin-salt', 100000, 64, 'sha512').toString('hex');
}

// POST /api/users/[userId]/keypad-pin - Set user PIN
async function setPinHandler(req: NextRequest, authContext: ApiRouteAuthContext, context: RouteContext<{ userId: string }>) {
  try {
    const { pin } = await req.json();
    const { userId } = await context.params;

    // Validate PIN format (6 digits)
    if (!pin || !/^\d{6}$/.test(pin)) {
      return NextResponse.json(
        { success: false, error: 'PIN must be exactly 6 digits' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await db.select().from(user).where(eq(user.id, userId)).limit(1);
    if (!existingUser.length) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Hash the PIN
    const hashedPin = hashPin(pin);

    // Update user with hashed PIN and timestamp
    await db.update(user)
      .set({ 
        keypadPin: hashedPin,
        keypadPinSetAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(user.id, userId));

    return NextResponse.json({
      success: true,
      data: { userId, message: 'PIN set successfully' }
    });

  } catch (error) {
    console.error('Error setting user PIN:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to set PIN' },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[userId]/keypad-pin - Remove user PIN
async function removePinHandler(req: NextRequest, authContext: ApiRouteAuthContext, context: RouteContext<{ userId: string }>) {
  try {
    const { userId } = await context.params;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await db.select().from(user).where(eq(user.id, userId)).limit(1);
    if (!existingUser.length) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Remove PIN by setting to null
    await db.update(user)
      .set({ 
        keypadPin: null,
        keypadPinSetAt: null,
        updatedAt: new Date()
      })
      .where(eq(user.id, userId));

    return NextResponse.json({
      success: true,
      data: { userId, message: 'PIN removed successfully' }
    });

  } catch (error) {
    console.error('Error removing user PIN:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove PIN' },
      { status: 500 }
    );
  }
}

export const POST = withApiRouteAuth(setPinHandler);
export const DELETE = withApiRouteAuth(removePinHandler); 