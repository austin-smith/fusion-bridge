import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/data/db';
import { user } from '@/data/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import crypto from 'crypto';
import { withApiRouteAuth, type ApiRouteAuthContext } from '@/lib/auth/withApiRouteAuth';

// Helper function to hash PIN using Node.js crypto (same as user management)
function hashPin(pin: string): string {
  return crypto.pbkdf2Sync(pin, 'pin-salt', 100000, 64, 'sha512').toString('hex');
}

// POST /api/alarm/keypad/validate-pin - Validate a PIN for keypad access
async function validatePinHandler(req: NextRequest, authContext: ApiRouteAuthContext) {
  try {
    const { pin } = await req.json();

    // Validate PIN format (6 digits)
    if (!pin || !/^\d{6}$/.test(pin)) {
      return NextResponse.json({
        success: true,
        data: { valid: false }
      });
    }

    // Hash the provided PIN
    const hashedPin = hashPin(pin);

    // Find user with matching PIN
    const foundUser = await db.select({
      id: user.id,
      name: user.name,
      email: user.email,
    }).from(user)
      .where(
        and(
          eq(user.keypadPin, hashedPin),
          isNotNull(user.keypadPin) // Only consider users who have a PIN set
        )
      )
      .limit(1);

    if (foundUser.length === 0) {
      // No matching user found
      return NextResponse.json({
        success: true,
        data: { valid: false }
      });
    }

    // Valid PIN found
    const matchedUser = foundUser[0];
    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        userId: matchedUser.id,
        userName: matchedUser.name,
      }
    });

  } catch (error) {
    console.error('Error validating PIN:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to validate PIN' },
      { status: 500 }
    );
  }
}

export const POST = withApiRouteAuth(validatePinHandler); 