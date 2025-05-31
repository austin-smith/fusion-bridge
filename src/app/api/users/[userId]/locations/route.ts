import { NextResponse, NextRequest } from 'next/server';
import { withApiRouteAuth } from '@/lib/auth/withApiRouteAuth';
import { db } from '@/data/db';
import { user, locations } from '@/data/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

// Schema for updating user locations
const updateUserLocationsSchema = z.object({
  locationIds: z.array(z.string().uuid()).min(0, "Location IDs must be valid UUIDs"),
});

// Type for user with Better Auth additional fields
type UserWithLocationIds = typeof user.$inferSelect & {
  locationIds?: string;
};

// GET /api/users/[userId]/locations - Get user's assigned locations
export const GET = withApiRouteAuth(async (request: NextRequest, authContext: any, { params }: { params: Promise<{ userId: string }> }) => {
  try {
    const { userId } = await params;

    // Check if user exists and get their locationIds
    const userData = await db.select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (userData.length === 0) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const userRecord = userData[0] as UserWithLocationIds;
    const userLocationIds = userRecord.locationIds;
    
    // Parse the JSON string to get location IDs array
    let locationIdsArray: string[];
    try {
      locationIdsArray = typeof userLocationIds === 'string' 
        ? JSON.parse(userLocationIds) 
        : (userLocationIds || []);
    } catch (error) {
      console.warn(`[API] Invalid locationIds JSON for user ${userId}:`, userLocationIds);
      locationIdsArray = [];
    }

    // If no locations assigned, return empty array
    if (locationIdsArray.length === 0) {
      return NextResponse.json({ 
        success: true, 
        data: { 
          userId, 
          locations: [] 
        } 
      });
    }

    // Fetch the actual location data for assigned locations
    const userLocations = await db.select()
      .from(locations)
      .where(inArray(locations.id, locationIdsArray))
      .orderBy(locations.path);

    return NextResponse.json({ 
      success: true, 
      data: { 
        userId,
        locations: userLocations 
      } 
    });

  } catch (error) {
    console.error("Error fetching user locations:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      success: false, 
      error: `Failed to fetch user locations: ${errorMessage}` 
    }, { status: 500 });
  }
});

// PUT /api/users/[userId]/locations - Update user's location assignments
export const PUT = withApiRouteAuth(async (request: NextRequest, authContext: any, { params }: { params: Promise<{ userId: string }> }) => {
  try {
    const { userId } = await params;
    const body = await request.json();
    
    const validation = updateUserLocationsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ 
        success: false, 
        error: "Invalid input", 
        details: validation.error.flatten() 
      }, { status: 400 });
    }

    const { locationIds } = validation.data;

    // Verify user exists
    const existingUser = await db.select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (existingUser.length === 0) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Verify all location IDs exist (optional validation)
    if (locationIds.length > 0) {
      const existingLocations = await db.select({ id: locations.id })
        .from(locations)
        .where(inArray(locations.id, locationIds));

      if (existingLocations.length !== locationIds.length) {
        const foundIds = existingLocations.map(loc => loc.id);
        const missingIds = locationIds.filter(id => !foundIds.includes(id));
        return NextResponse.json({ 
          success: false, 
          error: `Location(s) not found: ${missingIds.join(', ')}` 
        }, { status: 400 });
      }
    }

    // Update user's locationIds field using direct database update with type assertion
    // Better Auth additionalFields are stored in the database but may not be in TypeScript types
    const locationIdsJson = JSON.stringify(locationIds);
    await db.update(user)
      .set({
        updatedAt: new Date(),
        // Type assertion for Better Auth additional field
        locationIds: locationIdsJson
      } as any)
      .where(eq(user.id, userId));

    // Fetch and return updated location data
    const updatedLocations: (typeof locations.$inferSelect)[] = [];
    if (locationIds.length > 0) {
      const fetchedLocations = await db.select()
        .from(locations)
        .where(inArray(locations.id, locationIds))
        .orderBy(locations.path);
      updatedLocations.push(...fetchedLocations);
    }

    return NextResponse.json({ 
      success: true, 
      data: { 
        userId,
        locations: updatedLocations 
      },
      message: `User locations updated successfully`
    });

  } catch (error) {
    console.error("Error updating user locations:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      success: false, 
      error: `Failed to update user locations: ${errorMessage}` 
    }, { status: 500 });
  }
}); 