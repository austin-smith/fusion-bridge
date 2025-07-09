import { z } from 'zod';

// OpenAI Models enum - latest current models only
export enum OpenAIModel {
  GPT_4O = 'gpt-4o',
  GPT_4O_MINI = 'gpt-4o-mini',
}

// OpenAI Model Display Names
export const OPENAI_MODEL_DISPLAY_NAMES: Record<OpenAIModel, string> = {
  [OpenAIModel.GPT_4O]: 'GPT-4o',
  [OpenAIModel.GPT_4O_MINI]: 'GPT-4o mini',
};

// OpenAI Configuration Schema for validation
export const OpenAIConfigSchema = z.object({
  apiKey: z.string()
    .min(1, 'API Key is required')
    .regex(/^sk-[a-zA-Z0-9\-_]{20,}$/, 'Invalid OpenAI API Key format - must start with "sk-"'),
  model: z.nativeEnum(OpenAIModel, {
    errorMap: () => ({ message: 'Please select a valid model' })
  }),
  maxTokens: z.number()
    .int('Max tokens must be a whole number')
    .min(100, 'Max tokens must be at least 100')
    .max(4000, 'Max tokens cannot exceed 4000'),
  temperature: z.number()
    .min(0, 'Temperature must be at least 0')
    .max(2, 'Temperature cannot exceed 2'),
  topP: z.number()
    .min(0.01, 'Top-p must be at least 0.01')
    .max(1, 'Top-p cannot exceed 1'),
  isEnabled: z.boolean(),
});

// Types derived from schema
export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema> & {
  id: string;
  type: 'openai';
};

export type OpenAIStoredConfig = Omit<OpenAIConfig, 'id' | 'type'>;

// Additional optional fields for database records
export interface OpenAIConfigWithTimestamps extends OpenAIConfig {
  createdAt?: Date;
  updatedAt?: Date;
}

// OpenAI API Request/Response Types
export interface OpenAIGenerationRequest {
  prompt: string;
  context: {
    availableDevices?: Array<{ id: string; name: string; type: string }>;
    availableAreas?: Array<{ id: string; name: string }>;
    availableConnectors?: Array<{ id: string; name: string; category: string }>;
    organizationId: string;
  };
}

export interface OpenAIGenerationResponse {
  success: boolean;
  generatedContent?: any; // Will vary based on use case
  explanation?: string;
  suggestions?: string[];
  errorMessage?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// OpenAI Test Response interface
export interface OpenAITestResponse {
  success: boolean;
  errorMessage?: string;
  responseTime?: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Configuration Form State
export interface SaveOpenAIConfigFormState {
  success: boolean;
  message?: string;
  savedIsEnabled?: boolean;
  savedConfigId?: string;
  savedApiKey?: string;
  savedModel?: string;
  errors?: {
    apiKey?: string[];
    model?: string[];
    maxTokens?: string[];
    temperature?: string[];
    topP?: string[];
    _form?: string[];
  };
}

// Export the schema type for use in forms
export type OpenAIConfigFormData = z.infer<typeof OpenAIConfigSchema>; 