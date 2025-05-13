'use server'; // Or 'server-only' depending on project conventions

import { z } from 'zod';
import {
  ResolvedPushoverMessageParams,
  ResolvedPushoverMessageParamsSchema,
  PushoverApiResponseSchema,
  PushoverGroupInfo,
  PushoverGroupInfoSchema,
  AddUserToGroupParams,
  AddUserToGroupParamsSchema,
  ValidateUserParams,
  ValidateUserParamsSchema,
  PushoverValidationResponse,
  PushoverValidationResponseSchema,
  RemoveUserFromGroupParams,
  RemoveUserFromGroupParamsSchema
} from '../../types/pushover-types';

// Define ONLY the base URL as a constant
const PUSHOVER_API_BASE_URL = 'https://api.pushover.net/1';

/**
 * Retrieves information about a Pushover group, including its users.
 * 
 * @param apiToken Your Pushover application's API token.
 * @param groupKey The Pushover group key.
 * @returns A promise resolving to an object containing group info or error details.
 */
export async function getGroupInfo(
  apiToken: string,
  groupKey: string
): Promise<{
  success: boolean;
  groupInfo?: PushoverGroupInfo;
  errorMessage?: string;
  errors?: string[];
}> {
  if (!apiToken || !groupKey) {
    return { 
      success: false, 
      errorMessage: 'API token or Group key is missing.'
    };
  }

  try {
    // Construct URL using base constant and path
    const url = `${PUSHOVER_API_BASE_URL}/groups/${groupKey}.json?token=${encodeURIComponent(apiToken)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const responseData = await response.json();
    
    // Validate the response with Zod
    const validationResult = PushoverGroupInfoSchema.safeParse(responseData);
    
    if (validationResult.success) {
      return {
        success: true,
        groupInfo: validationResult.data
      };
    }
    
    // If validation fails but the API returned status 1, it's a data format issue
    if (response.ok && responseData.status === 1) {
      console.error('[Pushover Driver] Group info validation error:', validationResult.error);
      return {
        success: false,
        errorMessage: 'Received unexpected data format from Pushover API',
        errors: validationResult.error.errors.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    
    // If the API returned an error
    const errorMessages = responseData.errors || [`HTTP Error: ${response.status} - ${response.statusText}`];
    return {
      success: false,
      errors: errorMessages,
      errorMessage: `Pushover API Error: ${errorMessages.join(', ')}`
    };
  } catch (error) {
    let errorMessage = 'Network or unexpected error.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return {
      success: false,
      errorMessage: `Failed to retrieve group info: ${errorMessage}`
    };
  }
}

/**
 * Sends a notification via the Pushover API.
 * 
 * @param apiToken Your Pushover application's API token.
 * @param groupKey The Pushover user or group key to send the message to.
 * @param params The resolved message parameters.
 * @returns A promise resolving to an object indicating success or failure, along with API response details.
 */
export async function sendPushoverNotification(
  apiToken: string,
  groupKey: string,
  params: ResolvedPushoverMessageParams
): Promise<{
  success: boolean;
  pushoverRequestId?: string;
  receipt?: string;
  errors?: string[];
  errorMessage?: string; // General error message for network issues or unexpected errors
  rawResponse?: any; // The raw response body for debugging
}> {
  if (!apiToken || !groupKey) {
    console.error('[Pushover Driver] API token or Group key is missing.');
    return { success: false, errorMessage: 'API token or Group key is missing.' };
  }
  
  // Validate parameters with Zod
  const paramValidation = ResolvedPushoverMessageParamsSchema.safeParse(params);
  if (!paramValidation.success) {
    return {
      success: false,
      errorMessage: `Invalid parameters: ${paramValidation.error.errors.map((e: { message: string }) => e.message).join(', ')}`,
    };
  }
  
  const validParams = paramValidation.data;
  if (!validParams.message) {
    console.error('[Pushover Driver] Message parameter is missing.');
    return { success: false, errorMessage: 'Message parameter is missing.' };
  }

  const payload: any = {
    token: apiToken,
    user: groupKey,
    message: validParams.message,
  };

  // Add optional parameters to the payload if they are provided
  if (validParams.title !== undefined) payload.title = validParams.title;
  if (validParams.device !== undefined) payload.device = validParams.device;
  if (validParams.sound !== undefined) payload.sound = validParams.sound;
  if (validParams.timestamp !== undefined) payload.timestamp = validParams.timestamp;
  if (validParams.url !== undefined) payload.url = validParams.url;
  if (validParams.urlTitle !== undefined) payload.url_title = validParams.urlTitle;
  if (validParams.ttl !== undefined) payload.ttl = validParams.ttl;
  if (validParams.html !== undefined) payload.html = validParams.html;
  if (validParams.monospace !== undefined) payload.monospace = validParams.monospace;
  if (validParams.priority !== undefined) payload.priority = validParams.priority;

  // Add attachment parameters if provided
  if (validParams.attachment_base64 && validParams.attachment_type) {
    payload.attachment_base64 = validParams.attachment_base64;
    payload.attachment_type = validParams.attachment_type;
  }

  if (validParams.priority === 2) {
    if (validParams.retry === undefined || validParams.expire === undefined) {
      console.error('[Pushover Driver] Retry and Expire parameters are required for emergency priority.');
      return {
        success: false,
        errorMessage: 'Retry and Expire parameters are required for emergency priority.',
      };
    }
    // Pushover API expects retry and expire for priority 2
    payload.retry = validParams.retry;
    payload.expire = validParams.expire;
  }

  console.log(`[Pushover Driver] Sending notification to group ${groupKey.substring(0,5)}... with title: ${validParams.title || '(App Name)'}`);

  try {
    // Construct URL using base constant and path
    const response = await fetch(`${PUSHOVER_API_BASE_URL}/messages.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();
    
    // Validate response with Zod
    const responseValidation = PushoverApiResponseSchema.safeParse(responseData);
    
    if (response.ok && responseData.status === 1) {
      console.log(`[Pushover Driver] Notification sent successfully. Request ID: ${responseData.request}`);
      return {
        success: true,
        pushoverRequestId: responseData.request,
        receipt: responseData.receipt,
        rawResponse: responseData,
      };
    } else {
      const errorMessages = responseData.errors || [`HTTP Error: ${response.status} - ${response.statusText}`];
      console.error('[Pushover Driver] Failed to send notification:', errorMessages, 'Request ID:', responseData.request);
      return {
        success: false,
        pushoverRequestId: responseData.request,
        errors: errorMessages,
        errorMessage: `Pushover API Error: ${errorMessages.join(', ')}`,
        rawResponse: responseData,
      };
    }
  } catch (error) {
    console.error('[Pushover Driver] Network or unexpected error sending notification:', error);
    let errorMessage = 'Network or unexpected error.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return { 
        success: false, 
        errorMessage: `Failed to send Pushover notification: ${errorMessage}` 
    };
  }
}

/**
 * Adds a user to a Pushover group.
 * 
 * @param apiToken Your Pushover application's API token.
 * @param groupKey The Pushover group key.
 * @param params Object containing the user key, optional device, and optional memo.
 * @returns A promise resolving to an object indicating success or failure.
 */
export async function addPushoverGroupUser(
  apiToken: string,
  groupKey: string,
  params: AddUserToGroupParams
): Promise<{
  success: boolean;
  errorMessage?: string;
  errors?: string[];
  rawResponse?: any;
}> {
  if (!apiToken || !groupKey) {
    return { success: false, errorMessage: 'API token or Group key is missing.' };
  }

  // Validate parameters with Zod
  const paramValidation = AddUserToGroupParamsSchema.safeParse(params);
  if (!paramValidation.success) {
    return {
      success: false,
      errorMessage: `Invalid parameters: ${paramValidation.error.errors.map((e: { message: string }) => e.message).join(', ')}`,
    };
  }
  
  const validParams = paramValidation.data;

  const payload: any = {
    token: apiToken,
    user: validParams.user,
  };
  if (validParams.device) payload.device = validParams.device;
  if (validParams.memo) payload.memo = validParams.memo;

  try {
    // Construct URL using base constant and path
    const url = `${PUSHOVER_API_BASE_URL}/groups/${groupKey}/add_user.json`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();
    
    // Validate response with Zod
    const responseValidation = PushoverApiResponseSchema.safeParse(responseData);
    
    if (response.ok && responseData.status === 1) {
      console.log(`[Pushover Driver] Successfully added user ${validParams.user.substring(0,5)}... to group ${groupKey.substring(0,5)}... Request ID: ${responseData.request}`);
      return { success: true, rawResponse: responseData };
    } else {
      const errorMessages = responseData.errors || [`HTTP Error: ${response.status} - ${response.statusText}`];
      console.error(`[Pushover Driver] Failed to add user to group:`, errorMessages, 'Request ID:', responseData.request);
      return {
        success: false,
        errors: errorMessages,
        errorMessage: `Pushover API Error: ${errorMessages.join(', ')}`,
        rawResponse: responseData,
      };
    }
  } catch (error) {
    console.error('[Pushover Driver] Network or unexpected error adding user to group:', error);
    let errorMessage = 'Network or unexpected error.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return { 
        success: false, 
        errorMessage: `Failed to add user to group: ${errorMessage}` 
    };
  }
}

/**
 * Removes a user from a Pushover group.
 * 
 * @param apiToken Your Pushover application's API token.
 * @param groupKey The Pushover group key.
 * @param params Object containing the user key and optional device name.
 * @returns A promise resolving to an object indicating success or failure.
 */
export async function removePushoverGroupUser(
  apiToken: string,
  groupKey: string,
  params: RemoveUserFromGroupParams
): Promise<{
  success: boolean;
  errorMessage?: string;
  errors?: string[];
  rawResponse?: any;
}> {
  if (!apiToken || !groupKey) {
    return { success: false, errorMessage: 'API token or Group key is missing.' };
  }

  // Validate parameters with Zod
  const paramValidation = RemoveUserFromGroupParamsSchema.safeParse(params);
  if (!paramValidation.success) {
    return {
      success: false,
      errorMessage: `Invalid parameters: ${paramValidation.error.errors.map((e: { message: string }) => e.message).join(', ')}`,
    };
  }
  
  const validParams = paramValidation.data;

  const payload: any = {
    token: apiToken,
    user: validParams.user,
  };
  if (validParams.device) payload.device = validParams.device;

  try {
    // Construct URL using base constant and path
    const url = `${PUSHOVER_API_BASE_URL}/groups/${groupKey}/remove_user.json`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();
    
    // Validate response with Zod (using the generic API response schema)
    const responseValidation = PushoverApiResponseSchema.safeParse(responseData);
    
    if (response.ok && responseData.status === 1) {
      console.log(`[Pushover Driver] Successfully removed user ${validParams.user.substring(0,5)}... (device: ${validParams.device || 'all'}) from group ${groupKey.substring(0,5)}... Request ID: ${responseData.request}`);
      return { success: true, rawResponse: responseData };
    } else {
      const errorMessages = responseData.errors || [`HTTP Error: ${response.status} - ${response.statusText}`];
      console.error(`[Pushover Driver] Failed to remove user from group:`, errorMessages, 'Request ID:', responseData.request);
      return {
        success: false,
        errors: errorMessages,
        errorMessage: `Pushover API Error: ${errorMessages.join(', ')}`,
        rawResponse: responseData,
      };
    }
  } catch (error) {
    console.error('[Pushover Driver] Network or unexpected error removing user from group:', error);
    let errorMessage = 'Network or unexpected error.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return { 
        success: false, 
        errorMessage: `Failed to remove user from group: ${errorMessage}` 
    };
  }
}

/**
 * Validates a Pushover user/group key.
 * 
 * @param apiToken Your Pushover application's API token.
 * @param params Object containing the user key and optional device name.
 * @returns A promise resolving to the validation response from Pushover.
 */
export async function validatePushoverUser(
  apiToken: string,
  params: ValidateUserParams
): Promise<PushoverValidationResponse & { success: boolean; errorMessage?: string }> {
  if (!apiToken) {
    return { success: false, status: 0, request: '', errorMessage: 'API token is missing.' };
  }

  // Validate parameters with Zod
  const paramValidation = ValidateUserParamsSchema.safeParse(params);
  if (!paramValidation.success) {
    return {
      success: false,
      status: 0,
      request: '',
      errorMessage: `Invalid parameters: ${paramValidation.error.errors.map((e: { message: string }) => e.message).join(', ')}`,
    };
  }
  
  const validParams = paramValidation.data;

  const payload: any = {
    token: apiToken,
    user: validParams.user,
  };
  if (validParams.device) payload.device = validParams.device;

  try {
    // Construct URL using base constant and path
    const response = await fetch(`${PUSHOVER_API_BASE_URL}/users/validate.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();
    
    // Validate response format with Zod
    const validationResult = PushoverValidationResponseSchema.safeParse(responseData);
    if (!validationResult.success) {
      console.error('[Pushover Driver] Validation API response validation error:', validationResult.error);
      return {
        success: false,
        status: 0,
        request: responseData?.request || '',
        errorMessage: 'Received unexpected data format from Pushover Validation API'
      };
    }

    const validatedData = validationResult.data;
    const isValid = validatedData.status === 1;

    console.log(`[Pushover Driver] Validation for user ${validParams.user.substring(0,5)}... ${isValid ? 'succeeded' : 'failed'}. Request ID: ${validatedData.request}`);
    
    return {
      success: isValid,
      ...validatedData,
      errorMessage: !isValid ? (validatedData.errors?.join(', ') || 'User/Device validation failed') : undefined,
    };

  } catch (error) {
    console.error('[Pushover Driver] Network or unexpected error validating user:', error);
    let errorMessage = 'Network or unexpected error.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return { 
        success: false, 
        status: 0,
        request: '',
        errorMessage: `Failed to validate user: ${errorMessage}` 
    };
  }
} 