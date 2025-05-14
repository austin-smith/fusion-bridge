'use server';

import { z } from 'zod';
import { getPushoverConfiguration, upsertPushoverConfiguration } from '@/data/repositories/service-configurations';
import { revalidatePath } from 'next/cache';
import { db } from '@/data/db';
import { serviceConfigurations } from '@/data/db/schema';
import { eq } from 'drizzle-orm';

// Import Pushcut specific items
import { PushcutApiKeySchema } from '@/types/pushcut-types';
import { upsertPushcutConfiguration } from '@/data/repositories/service-configurations';
import type { SavePushcutConfigFormState } from '@/components/settings/services/pushcut/pushcut-config-form';

// Schema for form validation
const PushoverConfigSchema = z.object({
  apiToken: z.string().min(1, 'API Token is required.').length(30, 'Pushover API tokens are 30 characters long.'),
  groupKey: z.string().min(1, 'Group Key is required.').length(30, 'Pushover group keys are 30 characters long.'),
  isEnabled: z.preprocess((val) => val === 'true', z.boolean()),
});

export interface SavePushoverConfigFormState {
  success: boolean;
  message?: string;
  savedIsEnabled?: boolean;
  errors?: {
    apiToken?: string[];
    groupKey?: string[];
    _form?: string[]; // For general form errors
  };
}

export async function savePushoverConfigurationAction(
  prevState: SavePushoverConfigFormState,
  formData: FormData
): Promise<SavePushoverConfigFormState> {
  const rawFormData = {
    apiToken: formData.get('apiToken') as string,
    groupKey: formData.get('groupKey') as string,
    isEnabled: formData.get('isEnabled') as string,
  };

  const validationResult = PushoverConfigSchema.safeParse(rawFormData);

  if (!validationResult.success) {
    const fieldErrors = validationResult.error.flatten().fieldErrors;
    return {
      success: false,
      message: 'Validation failed. Please check your inputs.',
      errors: {
        apiToken: fieldErrors.apiToken,
        groupKey: fieldErrors.groupKey,
      },
    };
  }

  const { apiToken, groupKey, isEnabled } = validationResult.data;

  try {
    const result = await upsertPushoverConfiguration(apiToken, groupKey, isEnabled);
    if (result.success) {
      revalidatePath('/settings/services'); // Or whatever the path to your settings page is
      return {
        success: true,
        message: 'Pushover configuration saved successfully.',
        savedIsEnabled: isEnabled,
      };
    } else {
      return {
        success: false,
        message: result.message || 'Failed to save configuration.',
        errors: { _form: [result.message || 'An unknown error occurred.'] },
      };
    }
  } catch (error) {
    console.error("[Action] Error saving Pushover configuration:", error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return {
      success: false,
      message: 'An unexpected error occurred while saving.',
      errors: { _form: [errorMessage] },
    };
  }
}

// --- Pushcut Configuration Action ---
export async function savePushcutConfigurationAction(
  prevState: SavePushcutConfigFormState,
  formData: FormData
): Promise<SavePushcutConfigFormState> {
  console.log('[Action savePushcutConfigurationAction] Received form data');
  const formState: SavePushcutConfigFormState = { success: false }; // Initialize

  const apiKey = formData.get('apiKey') as string;
  const isEnabledString = formData.get('isEnabled') as string;
  const isEnabled = isEnabledString === 'true'; // Convert string from hidden input to boolean

  // Validate with Zod schema for API Key
  const validationResult = PushcutApiKeySchema.safeParse({ apiKey });

  if (!validationResult.success) {
    formState.message = 'Invalid API Key.';
    formState.errors = {
      apiKey: validationResult.error.flatten().fieldErrors.apiKey,
    };
    console.warn('[Action savePushcutConfigurationAction] Validation failed:', formState.errors);
    return formState;
  }

  const validatedApiKey = validationResult.data.apiKey;

  try {
    console.log(`[Action savePushcutConfigurationAction] Upserting Pushcut config. Enabled: ${isEnabled}`);
    const result = await upsertPushcutConfiguration(validatedApiKey, isEnabled);

    if (result.success) {
      formState.success = true;
      formState.message = 'Pushcut configuration saved successfully.';
      formState.savedIsEnabled = isEnabled;
      formState.savedConfigId = result.id;
      formState.savedApiKey = validatedApiKey;
      console.log('[Action savePushcutConfigurationAction] Pushcut config saved. ID:', result.id);
      revalidatePath('/settings/services');
    } else {
      formState.message = result.message || 'Failed to save Pushcut configuration.';
      formState.errors = { _form: [formState.message] };
      console.error('[Action savePushcutConfigurationAction] Upsert failed:', result.message);
    }
  } catch (error) {
    console.error('[Action savePushcutConfigurationAction] Unexpected error:', error);
    formState.message = 'An unexpected error occurred while saving Pushcut configuration.';
    if (error instanceof Error) {
        formState.message = error.message;
    }
    formState.errors = { _form: [formState.message] };
  }
  
  return formState;
}

// --- Server Action to update the isEnabled state of a service configuration ---
export async function updateServiceEnabledStateAction(
  configId: string,
  newIsEnabled: boolean
): Promise<{ success: boolean; message?: string }> {
  if (!configId) {
    console.error('[Action updateServiceEnabledStateAction] Configuration ID is missing.');
    return { success: false, message: 'Configuration ID is missing.' };
  }

  console.log(`[Action updateServiceEnabledStateAction] Updating config ${configId} to isEnabled: ${newIsEnabled}`);

  try {
    const result = await db
      .update(serviceConfigurations)
      .set({ isEnabled: newIsEnabled, updatedAt: new Date() })
      .where(eq(serviceConfigurations.id, configId))
      .returning({ updatedId: serviceConfigurations.id });

    if (result.length === 0) {
      console.warn(`[Action updateServiceEnabledStateAction] No configuration found with ID: ${configId} to update.`);
      return { success: false, message: 'Configuration not found or already updated.' };
    }

    console.log(`[Action updateServiceEnabledStateAction] Successfully updated isEnabled for config ${configId}.`);
    revalidatePath('/settings/services'); // Revalidate to reflect changes
    return { success: true, message: 'Service status updated successfully.' };

  } catch (error) {
    console.error('[Action updateServiceEnabledStateAction] Error updating service enabled state:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { success: false, message: `Failed to update service status: ${errorMessage}` };
  }
} 