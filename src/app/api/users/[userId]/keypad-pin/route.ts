import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { type RouteContext } from '@/lib/auth/withApiRouteAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';

// Helper function to hash PIN using Node.js crypto
function hashPin(pin: string): string {
  return crypto.pbkdf2Sync(pin, 'pin-salt', 100000, 64, 'sha512').toString('hex');
}

// GET /api/users/[userId]/keypad-pin - Check if user has PIN set (organization-scoped)
async function getPinStatusHandler(req: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ userId: string }>) {
  try {
    const { userId } = await context.params;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Create organization-scoped database client
    const orgDb = createOrgScopedDb(authContext.organizationId);

    // Check if user has a PIN set in this organization
    const userPin = await orgDb.keypadPins.getUserPin(userId);

    if (userPin.length > 0) {
      return NextResponse.json({
        hasPin: true,
        setAt: userPin[0].createdAt.toISOString()
      });
    } else {
      return NextResponse.json({
        hasPin: false,
        setAt: null
      });
    }

  } catch (error) {
    console.error('Error checking PIN status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check PIN status' },
      { status: 500 }
    );
  }
}

// POST /api/users/[userId]/keypad-pin - Set user PIN (organization-scoped)
async function setPinHandler(req: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ userId: string }>) {
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

    // Hash the PIN
    const hashedPin = hashPin(pin);

    // Create organization-scoped database client
    const orgDb = createOrgScopedDb(authContext.organizationId);

    try {
      // Set user PIN (includes uniqueness validation within organization)
      await orgDb.keypadPins.setUserPin(userId, hashedPin);

      return NextResponse.json({
        success: true,
        data: { userId, message: 'PIN set successfully' }
      });

    } catch (dbError: any) {
      if (dbError.message === 'PIN already exists in this organization') {
        return NextResponse.json(
          { success: false, error: 'PIN already exists in this organization. Please choose a different PIN.' },
          { status: 400 }
        );
      }
      throw dbError; // Re-throw other database errors
    }

  } catch (error) {
    console.error('Error setting user PIN:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to set PIN' },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[userId]/keypad-pin - Remove user PIN (organization-scoped)
async function removePinHandler(req: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ userId: string }>) {
  try {
    const { userId } = await context.params;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Create organization-scoped database client
    const orgDb = createOrgScopedDb(authContext.organizationId);

    // Remove user PIN from organization
    await orgDb.keypadPins.removeUserPin(userId);

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

export const GET = withOrganizationAuth(getPinStatusHandler);
export const POST = withOrganizationAuth(setPinHandler);
export const DELETE = withOrganizationAuth(removePinHandler); 