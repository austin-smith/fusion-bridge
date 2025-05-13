'use server';

import { z } from 'zod';
import { upsertPushoverConfiguration } from '@/data/repositories/service-configurations';
import { revalidatePath } from 'next/cache';

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