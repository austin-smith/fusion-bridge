import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import { PikoConfig } from '@/services/drivers/piko';
import { YoLinkConfig } from '@/services/drivers/yolink';

export async function updateConnectorConfig(connectorId: string, newConfig: PikoConfig | YoLinkConfig): Promise<void> {
  const logPrefix = `[updateConnectorConfig][${connectorId}]`;
  console.log(`${logPrefix} Attempting to update connector configuration.`);
  
  let configString;
  try {
      configString = JSON.stringify(newConfig);
  } catch (stringifyError) {
      console.error(`${logPrefix} Failed to stringify newConfig:`, stringifyError);
      throw new Error(`Failed to stringify new connector configuration for DB update: ${stringifyError instanceof Error ? stringifyError.message : String(stringifyError)}`);
  }

  try {
    await db.update(connectors)
      .set({ cfg_enc: configString, updatedAt: new Date() })
      .where(eq(connectors.id, connectorId));
    console.log(`${logPrefix} Successfully updated config in DB.`);
  } catch (error) {
      console.error(`${logPrefix} Error during db.update:`, error);
      throw new Error(`Failed to update connector configuration in DB: ${error instanceof Error ? error.message : String(error)}`);
  }
} 