import { db } from '@/data/db';
import { connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import { PikoConfig } from '@/services/drivers/piko'; // Assuming PikoConfig is exported

export async function updateConnectorConfig(connectorId: string, newConfig: PikoConfig): Promise<void> {
  const logPrefix = `[updateConnectorConfig][${connectorId}]`;
  console.log(`${logPrefix} Attempting to update Piko connector configuration.`);
  
  let configString;
  try {
    configString = JSON.stringify(newConfig);
    // REMOVED: Detailed token snippet logging
    // const tokenSnippet = newConfig.token?.accessToken ? 
    //   `New AT: ${newConfig.token.accessToken.substring(0, 10)}...${newConfig.token.accessToken.substring(newConfig.token.accessToken.length - 5)}` : 
    //   'No access token in new config';
    // const expiresAtInfo = newConfig.token?.expiresAt ? `ExpiresAt: ${new Date(newConfig.token.expiresAt).toISOString()}` : 'No expiresAt';
    // console.log(`${logPrefix} Data to save - ${tokenSnippet}, ${expiresAtInfo}`);

  } catch (stringifyError) {
    console.error(`${logPrefix} Failed to stringify newConfig:`, stringifyError);
    throw new Error(`Failed to stringify new Piko configuration for DB update: ${stringifyError instanceof Error ? stringifyError.message : String(stringifyError)}`);
  }

  try {
    await db.update(connectors)
      .set({ cfg_enc: configString, updatedAt: new Date() })
      .where(eq(connectors.id, connectorId));
    console.log(`${logPrefix} Successfully updated config in DB.`);
  } catch (error) {
    console.error(`${logPrefix} Error during db.update:`, error);
    throw new Error(`Failed to update Piko connector configuration in DB: ${error instanceof Error ? error.message : String(error)}`);
  }
} 