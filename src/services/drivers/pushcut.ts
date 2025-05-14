import { z } from 'zod';
import type { 
    PushcutSendParams, 
    PushcutNotificationParams, 
    PushcutApiResponse,
    PushcutDefinedNotification,
    PushcutDevice
} from '@/types/pushcut-types';
import { 
    PushcutNotificationParamsSchema, 
    PushcutApiResponseSchema,
    PushcutGetNotificationsApiResponseSchema,
    PushcutGetDevicesApiResponseSchema
} from '@/types/pushcut-types';

const PUSHCUT_API_BASE_URL = 'https://api.pushcut.io/v1';

/**
 * Sends a notification via the Pushcut API.
 * 
 * @param apiKey Your Pushcut application's API key.
 * @param notificationName The name of the Pushcut notification to trigger (path parameter).
 * @param params The notification parameters (request body).
 * @returns A promise resolving to an object indicating success or failure, along with API response details.
 */
export async function sendPushcutNotification(
  apiKey: string,
  notificationName: string,
  params: PushcutNotificationParams
): Promise<PushcutApiResponse> {
  if (!apiKey) {
    console.error('[Pushcut Driver] API key is missing.');
    return {
      status: 0, // Indicate internal error
      ok: false,
      message: 'API key is missing.',
    };
  }
  if (!notificationName) {
    console.error('[Pushcut Driver] Notification name is missing.');
    return {
      status: 0, // Indicate internal error
      ok: false,
      message: 'Notification name is missing.',
    };
  }

  // Validate parameters with Zod before sending
  const paramValidation = PushcutNotificationParamsSchema.safeParse(params);
  if (!paramValidation.success) {
    const errorMessages = paramValidation.error.errors.map((e: { message: string }) => e.message);
    console.error('[Pushcut Driver] Invalid notification parameters:', errorMessages);
    return {
      status: 400, // Bad Request due to invalid params
      ok: false,
      message: 'Invalid notification parameters.',
      errors: errorMessages,
    };
  }

  const validParams = paramValidation.data;
  const apiUrl = `${PUSHCUT_API_BASE_URL}/notifications/${encodeURIComponent(notificationName)}`;

  console.log(`[Pushcut Driver] Sending notification "${notificationName}" to Pushcut.`);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': apiKey,
      },
      body: JSON.stringify(validParams), // Send validated and potentially transformed params
    });

    // According to Pushcut docs, a successful response is 200 OK with an empty body.
    // Errors are returned as JSON with a non-200 status code.
    if (response.ok) {
        console.log(`[Pushcut Driver] Notification "${notificationName}" sent successfully to Pushcut (status ${response.status}).`);
        // Try to get request ID from headers if available (e.g., x-request-id or similar)
        const requestId = response.headers.get('x-request-id') || undefined;
        return {
            status: response.status,
            ok: true,
            message: 'Notification sent successfully.',
            requestId: requestId,
        };
    }

    // If not response.ok, attempt to parse error JSON
    let errorData: any = null;
    let errorMessage = `Pushcut API Error: ${response.status} - ${response.statusText}`;
    let apiErrors: string[] | undefined = undefined;

    try {
        errorData = await response.json();
        // Pushcut error format might be like: { "error": "Some error message", "message": "Detailed message" }
        // Or it could be a simple string, or an array of errors.
        if (errorData) {
            if (typeof errorData.error === 'string') errorMessage = errorData.error;
            if (typeof errorData.message === 'string') errorMessage = errorData.message; // Overwrite if more specific
            if (Array.isArray(errorData.errors)) {
                apiErrors = errorData.errors.map((e: any) => typeof e === 'string' ? e : JSON.stringify(e));
            } else if (typeof errorData.error === 'string') {
                apiErrors = [errorData.error];
            }
        }
    } catch (jsonError) {
        console.warn('[Pushcut Driver] Could not parse error response JSON from Pushcut:', jsonError);
        // Use the status text if JSON parsing fails
    }

    console.error(`[Pushcut Driver] Failed to send notification "${notificationName}":`, errorMessage, apiErrors || '');
    return {
        status: response.status,
        ok: false,
        message: errorMessage,
        errors: apiErrors,
        requestId: response.headers.get('x-request-id') || undefined,
    };

  } catch (error) {
    console.error('[Pushcut Driver] Network or unexpected error sending notification:', error);
    let message = 'Network or unexpected error.';
    if (error instanceof Error) {
      message = error.message;
    }
    return { 
        status: 0, // Indicate internal/network error
        ok: false, 
        message: `Failed to send Pushcut notification: ${message}` 
    };
  }
}

// --- NEW Function: Get Defined Pushcut Notifications ---
/**
 * Retrieves a list of all defined notifications from the Pushcut API.
 * 
 * @param apiKey Your Pushcut application's API key.
 * @returns A promise resolving to an object containing the list of notifications or error details.
 */
export async function getDefinedPushcutNotifications(
  apiKey: string
): Promise<{
  success: boolean;
  notifications?: PushcutDefinedNotification[];
  errorMessage?: string;
  errors?: string[]; // For potential structured errors from API
  status?: number; // HTTP status code
}> {
  if (!apiKey) {
    console.error('[Pushcut Driver] API key is missing for getDefinedPushcutNotifications.');
    return {
      success: false,
      status: 0, // Indicate internal error
      errorMessage: 'API key is missing.',
    };
  }

  const apiUrl = `${PUSHCUT_API_BASE_URL}/notifications`;
  console.log('[Pushcut Driver] Fetching defined notifications from Pushcut.');

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'API-Key': apiKey, // API key in header
        'Content-Type': 'application/json', // Though GET might not need Content-Type, it's good practice
      },
    });

    const responseData = await response.json();

    if (response.ok) {
      // Validate the response data with Zod
      const validationResult = PushcutGetNotificationsApiResponseSchema.safeParse(responseData);
      if (validationResult.success) {
        console.log(`[Pushcut Driver] Successfully fetched ${validationResult.data.length} defined notifications.`);
        return {
          success: true,
          status: response.status,
          notifications: validationResult.data,
        };
      } else {
        // Data format from API is not as expected
        console.error('[Pushcut Driver] Validation error fetching defined notifications:', validationResult.error.flatten().fieldErrors);
        return {
          success: false,
          status: response.status, // Still got a 2xx, but data is wrong
          errorMessage: 'Received unexpected data format from Pushcut API for defined notifications.',
          errors: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        };
      }
    } else {
      // Handle API errors (non-2xx responses)
      let errorMessage = `Pushcut API Error: ${response.status} - ${response.statusText}`;
      let apiErrors: string[] | undefined = undefined;

      if (responseData && typeof responseData.error === 'string') {
        errorMessage = responseData.error;
        apiErrors = [responseData.error];
      } else if (responseData && typeof responseData.message === 'string') {
        errorMessage = responseData.message;
        apiErrors = [responseData.message];
      }
      // Add more sophisticated error parsing if Pushcut has a specific error object structure

      console.error('[Pushcut Driver] Failed to fetch defined notifications:', errorMessage, apiErrors || '');
      return {
        success: false,
        status: response.status,
        errorMessage: errorMessage,
        errors: apiErrors,
      };
    }
  } catch (error) {
    console.error('[Pushcut Driver] Network or unexpected error fetching defined notifications:', error);
    let message = 'Network or unexpected error.';
    if (error instanceof Error) {
      message = error.message;
    }
    return {
      success: false,
      status: 0, // Indicate internal/network error
      errorMessage: `Failed to fetch Pushcut defined notifications: ${message}`,
    };
  }
}

// --- NEW Function: Get Active Pushcut Devices ---
/**
 * Retrieves a list of all active devices from the Pushcut API.
 * 
 * @param apiKey Your Pushcut application's API key.
 * @returns A promise resolving to an object containing the list of devices or error details.
 */
export async function getActivePushcutDevices(
  apiKey: string
): Promise<{
  success: boolean;
  devices?: PushcutDevice[];
  errorMessage?: string;
  errors?: string[];
  status?: number;
}> {
  if (!apiKey) {
    console.error('[Pushcut Driver] API key is missing for getActivePushcutDevices.');
    return {
      success: false,
      status: 0,
      errorMessage: 'API key is missing.',
    };
  }

  const apiUrl = `${PUSHCUT_API_BASE_URL}/devices`;
  console.log('[Pushcut Driver] Fetching active devices from Pushcut.');

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    const responseData = await response.json();

    if (response.ok) {
      const validationResult = PushcutGetDevicesApiResponseSchema.safeParse(responseData);
      if (validationResult.success) {
        console.log(`[Pushcut Driver] Successfully fetched ${validationResult.data.length} active devices.`);
        return {
          success: true,
          status: response.status,
          devices: validationResult.data,
        };
      } else {
        console.error('[Pushcut Driver] Validation error fetching active devices:', validationResult.error.flatten().fieldErrors);
        return {
          success: false,
          status: response.status,
          errorMessage: 'Received unexpected data format from Pushcut API for active devices.',
          errors: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        };
      }
    } else {
      let errorMessage = `Pushcut API Error: ${response.status} - ${response.statusText}`;
      let apiErrors: string[] | undefined = undefined;
      if (responseData && typeof responseData.error === 'string') {
        errorMessage = responseData.error;
        apiErrors = [responseData.error];
      } else if (responseData && typeof responseData.message === 'string') {
        errorMessage = responseData.message;
        apiErrors = [responseData.message];
      }
      console.error('[Pushcut Driver] Failed to fetch active devices:', errorMessage, apiErrors || '');
      return {
        success: false,
        status: response.status,
        errorMessage: errorMessage,
        errors: apiErrors,
      };
    }
  } catch (error) {
    console.error('[Pushcut Driver] Network or unexpected error fetching active devices:', error);
    let message = 'Network or unexpected error.';
    if (error instanceof Error) {
      message = error.message;
    }
    return {
      success: false,
      status: 0,
      errorMessage: `Failed to fetch Pushcut active devices: ${message}`,
    };
  }
} 