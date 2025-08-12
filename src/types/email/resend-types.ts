import { z } from 'zod';

// Public config surfaced to the UI layer
export interface ResendConfig {
  id: string;
  type: 'resend';
  isEnabled: boolean;
  apiKey: string;
  fromEmail: string;
  fromName?: string;
  replyToEmail?: string;
}

// Stored inside service_configurations.configEnc
export interface ResendStoredConfig {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
  replyToEmail?: string;
}

export const ResendConfigSchema = z.object({
  apiKey: z
    .string()
    .min(10, 'API key is required')
    .refine((v) => v.startsWith('re_'), 'API key should start with "re_"'),
  fromEmail: z.string().email('Valid from email is required'),
  fromName: z.string().max(100).optional(),
  replyToEmail: z.string().email().optional(),
  isEnabled: z.preprocess((val) => val === 'true' || val === true, z.boolean()),
});

export type ResendConfigFormData = z.infer<typeof ResendConfigSchema>;

export interface SaveResendConfigFormState {
  success: boolean;
  message?: string;
  savedIsEnabled?: boolean;
  savedConfigId?: string;
  savedApiKey?: string;
  errors?: {
    apiKey?: string[];
    fromEmail?: string[];
    fromName?: string[];
    replyToEmail?: string[];
    _form?: string[];
  };
}


