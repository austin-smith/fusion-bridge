'use server';

import { db } from '@/data/db';
import { serviceConfigurations } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import type { PushcutConfig, PushcutStoredConfig } from '@/types/pushcut-types';
import type { OpenWeatherConfig } from '@/types/openweather-types';
import type { OpenAIConfig, OpenAIModel } from '@/types/ai/openai-service-types';

export interface BaseServiceConfig {
  id: string;
  type: string;
  isEnabled: boolean;
}

export interface PushoverConfig extends BaseServiceConfig {
  type: 'pushover';
  apiToken: string;
  groupKey: string;
}

// Union type for all possible service configurations
export type AnyServiceConfig = PushoverConfig | PushcutConfig | OpenWeatherConfig | OpenAIConfig;

// Interface for the data stored *inside* the configEnc blob for Pushover
interface PushoverStoredConfig {
  apiToken: string;
  groupKey: string;
}

// Interface for the data stored *inside* the configEnc blob for OpenAI
interface OpenAIStoredConfig {
  apiKey: string;
  model: OpenAIModel;
  maxTokens: number;
  temperature: number;
  topP: number;
}

/**
 * Fetches the Pushover service configuration.
 * For now, we assume there's only one configuration with type 'PUSHOVER'.
 * @returns The Pushover configuration object or null if not found.
 */
export async function getPushoverConfiguration(): Promise<PushoverConfig | null> {
  try {
    const configRecord = await db
      .select({
        id: serviceConfigurations.id,
        configEnc: serviceConfigurations.configEnc,
        isEnabled: serviceConfigurations.isEnabled,
      })
      .from(serviceConfigurations)
      .where(eq(serviceConfigurations.type, 'PUSHOVER'))
      .limit(1)
      .then(res => res[0]);

    // Return the config regardless of isEnabled, but handle if no record found
    if (configRecord) {
      // Parse the stored config part
      const storedConfig = JSON.parse(configRecord.configEnc) as PushoverStoredConfig;
      
      // Combine with base fields to create the full PushoverConfig object
      const fullConfig: PushoverConfig = {
        id: configRecord.id,
        type: 'pushover', // Set the type explicitly
        isEnabled: configRecord.isEnabled,
        apiToken: storedConfig.apiToken,
        groupKey: storedConfig.groupKey,
      };
      return fullConfig;
    }
    
    // No configuration found in the database
    return null;
  } catch (error) {
    console.error("[ServiceConfigRepo] Error fetching Pushover configuration:", error);
    return null;
  }
}

/**
 * Creates or updates the Pushover service configuration.
 * @param apiToken The Pushover API Token.
 * @param groupKey The Pushover Group Key.
 * @returns An object indicating success or failure.
 */
export async function upsertPushoverConfiguration(
  apiToken: string,
  groupKey: string,
  isEnabled: boolean
): Promise<{ success: boolean; message?: string; id?: string }> {
  if (!apiToken || !groupKey) {
    return { success: false, message: 'API Token and Group Key are required.' };
  }

  // Use the simpler type for the data to be stored/encrypted
  const configToStore: PushoverStoredConfig = {
    apiToken,
    groupKey,
  };

  // No encryption for now
  const configEnc = JSON.stringify(configToStore);

  try {
    const existingConfig = await db
      .select({ id: serviceConfigurations.id })
      .from(serviceConfigurations)
      .where(eq(serviceConfigurations.type, 'PUSHOVER'))
      .limit(1)
      .then(res => res[0]);

    if (existingConfig) {
      // Update existing configuration
      await db
        .update(serviceConfigurations)
        .set({
          configEnc: configEnc,
          isEnabled: isEnabled,
          updatedAt: new Date(),
        })
        .where(eq(serviceConfigurations.id, existingConfig.id));
      console.log("[ServiceConfigRepo] Updated Pushover configuration:", existingConfig.id);
      return { success: true, id: existingConfig.id };
    } else {
      // Insert new configuration
      const newConfig = await db
        .insert(serviceConfigurations)
        .values({
          type: 'PUSHOVER',
          configEnc: configEnc,
          isEnabled: isEnabled,
          // createdAt and updatedAt have default values in schema
        })
        .returning({ id: serviceConfigurations.id });
      const newId = newConfig[0]?.id;
      console.log("[ServiceConfigRepo] Created new Pushover configuration:", newId);
      return { success: true, id: newId };
    }
  } catch (error) {
    console.error("[ServiceConfigRepo] Error upserting Pushover configuration:", error);
    return { success: false, message: 'Database operation failed.' };
  }
}

/**
 * Fetches the Pushcut service configuration.
 * @returns The Pushcut configuration object or null if not found.
 */
export async function getPushcutConfiguration(): Promise<PushcutConfig | null> {
  try {
    const configRecord = await db
      .select({
        id: serviceConfigurations.id,
        configEnc: serviceConfigurations.configEnc,
        isEnabled: serviceConfigurations.isEnabled,
      })
      .from(serviceConfigurations)
      .where(eq(serviceConfigurations.type, 'PUSHCUT')) // Filter by PUSHCUT type
      .limit(1)
      .then(res => res[0]);

    if (configRecord) {
      const storedConfig = JSON.parse(configRecord.configEnc) as PushcutStoredConfig;
      
      const fullConfig: PushcutConfig = {
        id: configRecord.id,
        type: 'pushcut', // Set the type explicitly
        isEnabled: configRecord.isEnabled,
        apiKey: storedConfig.apiKey,
      };
      return fullConfig;
    }
    return null;
  } catch (error) {
    console.error("[ServiceConfigRepo] Error fetching Pushcut configuration:", error);
    return null;
  }
}

/**
 * Creates or updates the Pushcut service configuration.
 * @param apiKey The Pushcut API Key.
 * @param isEnabled Whether the service is enabled.
 * @returns An object indicating success or failure.
 */
export async function upsertPushcutConfiguration(
  apiKey: string,
  isEnabled: boolean
): Promise<{ success: boolean; message?: string; id?: string }> {
  if (!apiKey) {
    return { success: false, message: 'API Key is required.' };
  }

  const configToStore: PushcutStoredConfig = {
    apiKey,
  };

  const configEnc = JSON.stringify(configToStore);

  try {
    const existingConfig = await db
      .select({ id: serviceConfigurations.id })
      .from(serviceConfigurations)
      .where(eq(serviceConfigurations.type, 'PUSHCUT')) // Filter by PUSHCUT type
      .limit(1)
      .then(res => res[0]);

    if (existingConfig) {
      // Update existing configuration
      await db
        .update(serviceConfigurations)
        .set({
          configEnc: configEnc,
          isEnabled: isEnabled,
          updatedAt: new Date(),
        })
        .where(eq(serviceConfigurations.id, existingConfig.id));
      console.log("[ServiceConfigRepo] Updated Pushcut configuration:", existingConfig.id);
      return { success: true, id: existingConfig.id };
    } else {
      // Insert new configuration
      const newConfig = await db
        .insert(serviceConfigurations)
        .values({
          type: 'PUSHCUT', // Set the type to PUSHCUT
          configEnc: configEnc,
          isEnabled: isEnabled,
        })
        .returning({ id: serviceConfigurations.id });
      const newId = newConfig[0]?.id;
      console.log("[ServiceConfigRepo] Created new Pushcut configuration:", newId);
      return { success: true, id: newId };
    }
  } catch (error) {
    console.error("[ServiceConfigRepo] Error upserting Pushcut configuration:", error);
    return { success: false, message: 'Database operation failed.' };
  }
}

// Interface for the data stored *inside* the configEnc blob for OpenWeather
interface OpenWeatherStoredConfig {
  apiKey: string;
}

/**
 * Fetches the OpenWeather service configuration.
 * @returns The OpenWeather configuration object or null if not found.
 */
export async function getOpenWeatherConfiguration(): Promise<OpenWeatherConfig | null> {
  try {
    const configRecord = await db
      .select({
        id: serviceConfigurations.id,
        configEnc: serviceConfigurations.configEnc,
        isEnabled: serviceConfigurations.isEnabled,
      })
      .from(serviceConfigurations)
      .where(eq(serviceConfigurations.type, 'OPENWEATHER'))
      .limit(1)
      .then(res => res[0]);

    if (configRecord) {
      const storedConfig = JSON.parse(configRecord.configEnc) as OpenWeatherStoredConfig;
      
      const fullConfig: OpenWeatherConfig = {
        id: configRecord.id,
        type: 'openweather',
        isEnabled: configRecord.isEnabled,
        apiKey: storedConfig.apiKey,
      };
      return fullConfig;
    }
    return null;
  } catch (error) {
    console.error("[ServiceConfigRepo] Error fetching OpenWeather configuration:", error);
    return null;
  }
}

/**
 * Creates or updates the OpenWeather service configuration.
 * @param apiKey The OpenWeather API Key.
 * @param isEnabled Whether the service is enabled.
 * @returns An object indicating success or failure.
 */
export async function upsertOpenWeatherConfiguration(
  apiKey: string,
  isEnabled: boolean
): Promise<{ success: boolean; message?: string; id?: string }> {
  if (!apiKey) {
    return { success: false, message: 'API Key is required.' };
  }

  const configToStore: OpenWeatherStoredConfig = {
    apiKey,
  };

  const configEnc = JSON.stringify(configToStore);

  try {
    const existingConfig = await db
      .select({ id: serviceConfigurations.id })
      .from(serviceConfigurations)
      .where(eq(serviceConfigurations.type, 'OPENWEATHER'))
      .limit(1)
      .then(res => res[0]);

    if (existingConfig) {
      // Update existing configuration
      await db
        .update(serviceConfigurations)
        .set({
          configEnc: configEnc,
          isEnabled: isEnabled,
          updatedAt: new Date(),
        })
        .where(eq(serviceConfigurations.id, existingConfig.id));
      console.log("[ServiceConfigRepo] Updated OpenWeather configuration:", existingConfig.id);
      return { success: true, id: existingConfig.id };
    } else {
      // Insert new configuration
      const newConfig = await db
        .insert(serviceConfigurations)
        .values({
          type: 'OPENWEATHER',
          configEnc: configEnc,
          isEnabled: isEnabled,
        })
        .returning({ id: serviceConfigurations.id });
      const newId = newConfig[0]?.id;
      console.log("[ServiceConfigRepo] Created new OpenWeather configuration:", newId);
      return { success: true, id: newId };
    }
  } catch (error) {
    console.error("[ServiceConfigRepo] Error upserting OpenWeather configuration:", error);
    return { success: false, message: 'Database operation failed.' };
  }
}

/**
 * Fetches the OpenAI service configuration.
 * @returns The OpenAI configuration object or null if not found.
 */
export async function getOpenAIConfiguration(): Promise<OpenAIConfig | null> {
  try {
    const configRecord = await db
      .select({
        id: serviceConfigurations.id,
        configEnc: serviceConfigurations.configEnc,
        isEnabled: serviceConfigurations.isEnabled,
      })
      .from(serviceConfigurations)
      .where(eq(serviceConfigurations.type, 'OPENAI'))
      .limit(1)
      .then(res => res[0]);

    if (configRecord) {
      const storedConfig = JSON.parse(configRecord.configEnc) as OpenAIStoredConfig;
      
      const fullConfig: OpenAIConfig = {
        id: configRecord.id,
        type: 'openai',
        isEnabled: configRecord.isEnabled,
        apiKey: storedConfig.apiKey,
        model: storedConfig.model,
        maxTokens: storedConfig.maxTokens,
        temperature: storedConfig.temperature,
        topP: storedConfig.topP,
      };
      return fullConfig;
    }
    return null;
  } catch (error) {
    console.error("[ServiceConfigRepo] Error fetching OpenAI configuration:", error);
    return null;
  }
}

/**
 * Creates or updates the OpenAI service configuration.
 * @param apiKey The OpenAI API Key.
 * @param model The OpenAI model to use.
 * @param maxTokens Maximum tokens per request.
 * @param temperature The creativity/randomness setting (0-1).
 * @param rateLimitPerHour Rate limit for requests per hour.
 * @param isEnabled Whether the service is enabled.
 * @returns An object indicating success or failure.
 */
export async function upsertOpenAIConfiguration(
  apiKey: string,
  model: OpenAIModel,
  maxTokens: number,
  temperature: number,
  topP: number,
  isEnabled: boolean
): Promise<{ success: boolean; message?: string; id?: string }> {
  if (!apiKey) {
    return { success: false, message: 'API Key is required.' };
  }

  if (!model) {
    return { success: false, message: 'Model selection is required.' };
  }

  // Validate parameters
  if (maxTokens < 100 || maxTokens > 4000) {
    return { success: false, message: 'Max tokens must be between 100 and 4000.' };
  }

  if (temperature < 0 || temperature > 2) {
    return { success: false, message: 'Temperature must be between 0 and 2.' };
  }

  if (topP < 0.01 || topP > 1) {
    return { success: false, message: 'Top-p must be between 0.01 and 1.' };
  }

  const configToStore: OpenAIStoredConfig = {
    apiKey,
    model,
    maxTokens,
    temperature,
    topP,
  };

  const configEnc = JSON.stringify(configToStore);

  try {
    const existingConfig = await db
      .select({ id: serviceConfigurations.id })
      .from(serviceConfigurations)
      .where(eq(serviceConfigurations.type, 'OPENAI'))
      .limit(1)
      .then(res => res[0]);

    if (existingConfig) {
      // Update existing configuration
      await db
        .update(serviceConfigurations)
        .set({
          configEnc: configEnc,
          isEnabled: isEnabled,
          updatedAt: new Date(),
        })
        .where(eq(serviceConfigurations.id, existingConfig.id));
      console.log("[ServiceConfigRepo] Updated OpenAI configuration:", existingConfig.id);
      return { success: true, id: existingConfig.id };
    } else {
      // Insert new configuration
      const newConfig = await db
        .insert(serviceConfigurations)
        .values({
          type: 'OPENAI',
          configEnc: configEnc,
          isEnabled: isEnabled,
        })
        .returning({ id: serviceConfigurations.id });
      const newId = newConfig[0]?.id;
      console.log("[ServiceConfigRepo] Created new OpenAI configuration:", newId);
      return { success: true, id: newId };
    }
  } catch (error) {
    console.error("[ServiceConfigRepo] Error upserting OpenAI configuration:", error);
    return { success: false, message: 'Database operation failed.' };
  }
} 