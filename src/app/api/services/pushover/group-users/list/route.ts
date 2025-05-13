import { NextResponse } from 'next/server';
import { getPushoverConfiguration } from '@/data/repositories/service-configurations';
import { getGroupInfo } from '@/services/drivers/pushover';
import type { PushoverGroupUser } from '@/types/pushover-types';

// Ensure this route is treated as dynamic and not cached unintentionally
export const dynamic = 'force-dynamic';

export async function GET() {
    console.log('[API GET /api/services/pushover/group-users/list] Received request');
    try {
        const config = await getPushoverConfiguration();

        if (!config) {
            console.log('[API GET /api/services/pushover/group-users/list] Pushover configuration not found.');
            return NextResponse.json({ error: 'Pushover service is not configured.' }, { status: 400 });
        }
        if (!config.isEnabled) {
            console.log('[API GET /api/services/pushover/group-users/list] Pushover service is disabled.');
            return NextResponse.json({ error: 'Pushover service is disabled.' }, { status: 400 });
        }
        if (!config.apiToken || !config.groupKey) {
            console.log('[API GET /api/services/pushover/group-users/list] Pushover configuration is incomplete (missing API Token or Group Key).');
            return NextResponse.json({ error: 'Pushover configuration is incomplete.' }, { status: 400 });
        }

        console.log(`[API GET /api/services/pushover/group-users/list] Fetching group info for group key: ${config.groupKey.substring(0,5)}...`);
        const groupInfoResult = await getGroupInfo(config.apiToken, config.groupKey);

        if (!groupInfoResult.success || !groupInfoResult.groupInfo) {
            console.error('[API GET /api/services/pushover/group-users/list] Failed to get group info:', groupInfoResult.errorMessage || groupInfoResult.errors?.join(', '));
            return NextResponse.json({ 
                error: 'Failed to retrieve Pushover group users.', 
                details: groupInfoResult.errorMessage || groupInfoResult.errors 
            }, { status: 502 }); // Bad Gateway - error from upstream service
        }

        // Extract only the relevant fields for the frontend dropdown
        const usersForDropdown = groupInfoResult.groupInfo.users.map((user: PushoverGroupUser) => ({
            user: user.user,    // The user key (required for sending)
            memo: user.memo,    // The user-defined memo (ideal for display)
            device: user.device // Optional specific device target
        }));

        console.log(`[API GET /api/services/pushover/group-users/list] Successfully retrieved ${usersForDropdown.length} users.`);
        return NextResponse.json(usersForDropdown, { status: 200 });

    } catch (error) {
        console.error('[API GET /api/services/pushover/group-users/list] Internal server error:', error);
        return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
    }
} 