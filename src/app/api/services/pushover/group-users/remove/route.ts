import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPushoverConfiguration } from '@/data/repositories/service-configurations';
import { removePushoverGroupUser } from '@/services/drivers/pushover';
import { RemoveUserFromGroupParamsSchema } from '@/types/pushover-types';

export async function POST(request: Request) {
  try {
    const pushoverConfig = await getPushoverConfiguration();
    if (!pushoverConfig || !pushoverConfig.isEnabled) {
      return NextResponse.json(
        { success: false, error: 'Pushover service is not configured or not enabled.' },
        { status: 400 }
      );
    }

    const { apiToken, groupKey } = pushoverConfig;

    if (!apiToken || !groupKey) {
      return NextResponse.json(
        { success: false, error: 'Pushover API token or Group key is missing in configuration.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validationResult = RemoveUserFromGroupParamsSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request parameters.', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { user, device } = validationResult.data;

    const result = await removePushoverGroupUser(apiToken, groupKey, { user, device });

    if (result.success) {
      return NextResponse.json({ success: true, message: 'User removed successfully from group.', details: result.rawResponse });
    } else {
      return NextResponse.json(
        { success: false, error: result.errorMessage || 'Failed to remove user from group.', details: result.errors },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[API /pushover/group-users/remove] Error:', error);
    let errorMessage = 'An unexpected error occurred.';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
} 