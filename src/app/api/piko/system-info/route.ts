import { NextResponse } from 'next/server';
import { PikoConfig, getSystemInfo, PikoApiError } from '@/services/drivers/piko';

interface RequestBody {
    config: PikoConfig & { type: 'local' }; // Ensure type is local
    token: {
        accessToken: string;
        sessionId?: string; // Include session ID if available/needed for logging/context
    };
}

export async function POST(request: Request) {
    console.log("Received POST request on /api/piko/system-info");
    try {
        const body: RequestBody = await request.json();
        const { config, token } = body;

        // --- Input Validation ---
        if (!config || config.type !== 'local') {
            console.error("System Info API: Invalid or missing config (must be type 'local').");
            return NextResponse.json({ success: false, error: 'Invalid configuration: Type must be local.' }, { status: 400 });
        }
        if (!token || !token.accessToken) {
            console.error("System Info API: Missing access token.");
            return NextResponse.json({ success: false, error: 'Missing access token.' }, { status: 400 });
        }
        // Validate required local config fields (belt and suspenders)
        if (!config.host || !config.port || !config.username || !config.password) {
             console.error("System Info API: Missing required local config fields (host, port, username, password).");
             return NextResponse.json({ success: false, error: 'Missing required local configuration parameters.' }, { status: 400 });
        }

        console.log(`System Info API: Attempting to fetch info for local Piko at ${config.host}:${config.port}`);

        // --- Call Piko Driver ---
        const systemInfo = await getSystemInfo(config, token.accessToken);

        // --- Success Response ---
        if (systemInfo && systemInfo.name) {
            console.log(`System Info API: Successfully fetched system name: ${systemInfo.name}`);
            return NextResponse.json({ success: true, name: systemInfo.name });
        } else {
            // Should ideally be caught by getSystemInfo throwing, but handle unexpected case
            console.error("System Info API: getSystemInfo returned successfully but without a name.");
            return NextResponse.json({ success: false, error: 'Failed to retrieve system name from Piko API response.' }, { status: 500 });
        }

    } catch (error) {
        // --- Error Handling ---
        console.error("Error in /api/piko/system-info:", error);

        if (error instanceof PikoApiError) {
            // Use details from the Piko specific error
            const message = error.errorString || error.message || 'Failed to fetch system info from Piko';
            return NextResponse.json({ success: false, error: message }, { status: error.statusCode || 500 });
        } else if (error instanceof Error) {
            // Generic error
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        } else {
            // Unknown error type
            return NextResponse.json({ success: false, error: 'An unknown error occurred while fetching Piko system info.' }, { status: 500 });
        }
    }
} 