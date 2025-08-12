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
import type { SavePushcutConfigFormState } from '@/components/features/settings/services/pushcut/pushcut-config-form';

// Import OpenWeather specific items
import { OpenWeatherConfigSchema } from '@/types/openweather-types';
import { upsertOpenWeatherConfiguration } from '@/data/repositories/service-configurations';

// Import OpenAI specific items
import { OpenAIConfigSchema, type SaveOpenAIConfigFormState } from '@/types/ai/openai-service-types';

// Import Linear specific items
import { LinearConfigSchema } from '@/services/drivers/linear';
import type { SaveLinearConfigFormState } from '@/components/features/settings/services/linear/linear-config-form';
import { upsertOpenAIConfiguration, upsertLinearConfiguration } from '@/data/repositories/service-configurations';
import { upsertResendConfiguration } from '@/data/repositories/service-configurations';
import { ResendConfigSchema, type SaveResendConfigFormState } from '@/types/email/resend-types';

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

// --- OpenWeather Configuration Action ---
export interface SaveOpenWeatherConfigFormState {
  success: boolean;
  message?: string;
  savedIsEnabled?: boolean;
  savedConfigId?: string;
  savedApiKey?: string;
  errors?: {
    apiKey?: string[];
    _form?: string[];
  };
}

export async function saveOpenWeatherConfigurationAction(
  prevState: SaveOpenWeatherConfigFormState,
  formData: FormData
): Promise<SaveOpenWeatherConfigFormState> {
  console.log('[Action saveOpenWeatherConfigurationAction] Received form data');
  const formState: SaveOpenWeatherConfigFormState = { success: false };

  const apiKey = formData.get('apiKey') as string;
  const isEnabledString = formData.get('isEnabled') as string;
  const isEnabled = isEnabledString === 'true';

  // Validate with Zod schema
  const validationResult = OpenWeatherConfigSchema.safeParse({ apiKey, isEnabled });

  if (!validationResult.success) {
    formState.message = 'Invalid API Key.';
    formState.errors = {
      apiKey: validationResult.error.flatten().fieldErrors.apiKey,
    };
    console.warn('[Action saveOpenWeatherConfigurationAction] Validation failed:', formState.errors);
    return formState;
  }

  const validatedApiKey = validationResult.data.apiKey;

  try {
    console.log(`[Action saveOpenWeatherConfigurationAction] Upserting OpenWeather config. Enabled: ${isEnabled}`);
    const result = await upsertOpenWeatherConfiguration(validatedApiKey, isEnabled);

    if (result.success) {
      formState.success = true;
      formState.message = 'OpenWeather configuration saved successfully.';
      formState.savedIsEnabled = isEnabled;
      formState.savedConfigId = result.id;
      formState.savedApiKey = validatedApiKey;
      console.log('[Action saveOpenWeatherConfigurationAction] OpenWeather config saved. ID:', result.id);
      revalidatePath('/settings/services');
    } else {
      formState.message = result.message || 'Failed to save OpenWeather configuration.';
      formState.errors = { _form: [formState.message] };
      console.error('[Action saveOpenWeatherConfigurationAction] Upsert failed:', result.message);
    }
  } catch (error) {
    console.error('[Action saveOpenWeatherConfigurationAction] Unexpected error:', error);
    formState.message = 'An unexpected error occurred while saving OpenWeather configuration.';
    if (error instanceof Error) {
        formState.message = error.message;
    }
    formState.errors = { _form: [formState.message] };
  }
  
  return formState;
}

// --- OpenAI Configuration Action ---
export async function saveOpenAIConfigurationAction(
  prevState: SaveOpenAIConfigFormState,
  formData: FormData
): Promise<SaveOpenAIConfigFormState> {
  console.log('[Action saveOpenAIConfigurationAction] Received form data');
  const formState: SaveOpenAIConfigFormState = { success: false };

  const rawFormData = {
    apiKey: formData.get('apiKey') as string,
    model: formData.get('model') as string,
    maxTokens: parseInt(formData.get('maxTokens') as string) || 2000,
    temperature: parseFloat(formData.get('temperature') as string) || 0.7,
    topP: parseFloat(formData.get('topP') as string) || 1.0,
    isEnabled: (formData.get('isEnabled') as string) === 'true',
  };

  // Validate with Zod schema
  const validationResult = OpenAIConfigSchema.safeParse(rawFormData);

  if (!validationResult.success) {
    const fieldErrors = validationResult.error.flatten().fieldErrors;
    formState.message = 'Validation failed. Please check your inputs.';
    formState.errors = {
      apiKey: fieldErrors.apiKey,
      model: fieldErrors.model,
      maxTokens: fieldErrors.maxTokens,
      temperature: fieldErrors.temperature,
      topP: fieldErrors.topP,

    };
    console.warn('[Action saveOpenAIConfigurationAction] Validation failed:', formState.errors);
    return formState;
  }

  const { apiKey, model, maxTokens, temperature, topP, isEnabled } = validationResult.data;

  try {
    console.log(`[Action saveOpenAIConfigurationAction] Upserting OpenAI config. Enabled: ${isEnabled}`);
    const result = await upsertOpenAIConfiguration(
      apiKey,
      model,
      maxTokens,
      temperature,
      topP,
      isEnabled
    );

    if (result.success) {
      formState.success = true;
      formState.message = 'OpenAI configuration saved successfully.';
      formState.savedIsEnabled = isEnabled;
      formState.savedConfigId = result.id;
      formState.savedApiKey = apiKey;
      formState.savedModel = model;
      console.log('[Action saveOpenAIConfigurationAction] OpenAI config saved. ID:', result.id);
      revalidatePath('/settings/services');
    } else {
      formState.message = result.message || 'Failed to save OpenAI configuration.';
      formState.errors = { _form: [formState.message] };
      console.error('[Action saveOpenAIConfigurationAction] Upsert failed:', result.message);
    }
  } catch (error) {
    console.error('[Action saveOpenAIConfigurationAction] Unexpected error:', error);
    formState.message = 'An unexpected error occurred while saving OpenAI configuration.';
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

// --- Linear Configuration Action (Placeholder) ---
export async function saveLinearConfigurationAction(
  prevState: SaveLinearConfigFormState,
  formData: FormData
): Promise<SaveLinearConfigFormState> {
  console.log('[Action saveLinearConfigurationAction] Received form data');
  const formState: SaveLinearConfigFormState = { success: false };

  const rawFormData = {
    apiKey: formData.get('apiKey') as string,
    teamId: formData.get('teamId') as string || undefined,
    teamName: formData.get('teamName') as string || undefined,
  };

  const isEnabled = (formData.get('isEnabled') as string) === 'true';

  // Validate with Zod schema
  const validationResult = LinearConfigSchema.safeParse({
    apiKey: rawFormData.apiKey,
    teamId: rawFormData.teamId,
    teamName: rawFormData.teamName,
  });

  if (!validationResult.success) {
    const fieldErrors = validationResult.error.flatten().fieldErrors;
    formState.message = 'Validation failed. Please check your inputs.';
    formState.errors = {
      apiKey: fieldErrors.apiKey,
      teamId: fieldErrors.teamId,
    };
    console.warn('[Action saveLinearConfigurationAction] Validation failed:', formState.errors);
    return formState;
  }

  // Additional validation: if service is enabled, team is required
  if (isEnabled && (!rawFormData.teamId || rawFormData.teamId === '')) {
    formState.message = 'Team selection is required when Linear service is enabled.';
    formState.errors = {
      teamId: ['Team is required when Linear service is enabled.'],
    };
    console.warn('[Action saveLinearConfigurationAction] Team required when enabled');
    return formState;
  }

  const { apiKey, teamId, teamName } = validationResult.data;

  try {
    console.log(`[Action saveLinearConfigurationAction] Upserting Linear config. Enabled: ${isEnabled}`);
    const result = await upsertLinearConfiguration(
      apiKey,
      teamId,
      teamName,
      isEnabled
    );

    if (result.success) {
      formState.success = true;
      formState.message = 'Linear configuration saved successfully.';
      formState.savedIsEnabled = isEnabled;
      formState.savedConfigId = result.id;
      formState.savedApiKey = apiKey;
      console.log('[Action saveLinearConfigurationAction] Linear config saved. ID:', result.id);
      revalidatePath('/settings/services');
    } else {
      formState.message = result.message || 'Failed to save Linear configuration.';
      formState.errors = { _form: [formState.message] };
      console.error('[Action saveLinearConfigurationAction] Upsert failed:', result.message);
    }
  } catch (error) {
    console.error('[Action saveLinearConfigurationAction] Unexpected error:', error);
    formState.message = 'An unexpected error occurred while saving Linear configuration.';
    if (error instanceof Error) {
      formState.message = error.message;
    }
    formState.errors = { _form: [formState.message] };
  }
  
  return formState;
} 

// --- Resend Configuration Action ---
export async function saveResendConfigurationAction(
  prevState: SaveResendConfigFormState,
  formData: FormData
): Promise<SaveResendConfigFormState> {
  const formState: SaveResendConfigFormState = { success: false };

  const raw = {
    apiKey: formData.get('apiKey') as string,
    fromEmail: formData.get('fromEmail') as string,
    fromName: (formData.get('fromName') as string) || undefined,
    replyToEmail: (formData.get('replyToEmail') as string) || undefined,
    isEnabled: formData.get('isEnabled') as string,
  };

  const validation = ResendConfigSchema.safeParse(raw);
  if (!validation.success) {
    const fieldErrors = validation.error.flatten().fieldErrors;
    formState.message = 'Validation failed. Please check your inputs.';
    formState.errors = {
      apiKey: fieldErrors.apiKey,
      fromEmail: fieldErrors.fromEmail,
      fromName: fieldErrors.fromName,
      replyToEmail: fieldErrors.replyToEmail,
    };
    return formState;
  }

  const { apiKey, fromEmail, fromName, replyToEmail, isEnabled } = validation.data as unknown as {
    apiKey: string; fromEmail: string; fromName?: string; replyToEmail?: string; isEnabled: boolean;
  };

  try {
    const result = await upsertResendConfiguration(apiKey, fromEmail, fromName, replyToEmail, isEnabled);
    if (result.success) {
      formState.success = true;
      formState.message = 'Resend configuration saved successfully.';
      formState.savedIsEnabled = isEnabled;
      formState.savedConfigId = result.id;
      formState.savedApiKey = apiKey;
      revalidatePath('/settings/services');
    } else {
      formState.message = result.message || 'Failed to save Resend configuration.';
      formState.errors = { _form: [formState.message] };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'An unexpected error occurred.';
    formState.message = msg;
    formState.errors = { _form: [msg] };
  }

  return formState;
}