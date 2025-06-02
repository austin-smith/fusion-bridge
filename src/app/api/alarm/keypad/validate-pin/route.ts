import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';

// Helper function to hash PIN using Node.js crypto (same as user management)
function hashPin(pin: string): string {
  return crypto.pbkdf2Sync(pin, 'pin-salt', 100000, 64, 'sha512').toString('hex');
}

// POST /api/alarm/keypad/validate-pin - Validate a PIN for keypad access (organization-scoped)
async function validatePinHandler(req: NextRequest, authContext: OrganizationAuthContext) {
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

    // Create organization-scoped database client
    const orgDb = createOrgScopedDb(authContext.organizationId);

    // Find user with matching PIN in this organization
    const foundUserPin = await orgDb.keypadPins.findByPin(hashedPin);

    if (foundUserPin.length === 0) {
      // No matching PIN found in this organization
      return NextResponse.json({
        success: true,
        data: { valid: false }
      });
    }

    // Valid PIN found
    const matchedRecord = foundUserPin[0];
    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        userId: matchedRecord.user.id,
        userName: matchedRecord.user.name,
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

export const POST = withOrganizationAuth(validatePinHandler); 