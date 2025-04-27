import { z } from 'zod';

// Define the expected config structure for Genea
const GeneaConfigSchema = z.object({
  apiKey: z.string().min(1, 'API Key is required'),
  webhookId: z.string().uuid().optional(), // webhookId might not be present during test
});

type GeneaConfig = z.infer<typeof GeneaConfigSchema>;

const GENEA_API_BASE_URL = 'https://api.sequr.io';

interface GeneaTestResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Tests the connection to Genea by verifying the API key.
 * @param config - The Genea connector configuration containing the API key.
 * @returns An object indicating success or failure.
 */
export async function testGeneaConnection(config: unknown): Promise<GeneaTestResult> {
  // Validate the input config
  const parseResult = GeneaConfigSchema.safeParse(config);
  if (!parseResult.success) {
    console.error("Invalid Genea config provided for test:", parseResult.error);
    return { 
      success: false, 
      error: 'Invalid configuration provided for Genea test. API Key is missing or invalid.' 
    };
  }

  const { apiKey } = parseResult.data;

  try {
    console.log('Testing Genea API Key...');
    const response = await fetch(`${GENEA_API_BASE_URL}/v2/api_key/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ api_key: apiKey }),
    });

    // Check if the response status indicates success (e.g., 200 OK)
    if (response.ok) {
        // We can optionally parse the response body if we need details from it
        // const data = await response.json(); 
        // console.log("Genea API Key verified successfully:", data);
        console.log("Genea API Key verified successfully.");
        return { success: true, message: 'Genea API Key is valid.' };
    } else {
        // Handle API errors (e.g., 401 Unauthorized, 404 Not Found, etc.)
        let errorMessage = `Genea API returned status: ${response.status}`;
        try {
            const errorBody = await response.json();
            errorMessage = errorBody?.meta?.message || errorBody?.error || errorMessage;
        } catch (e) { /* Ignore JSON parsing error */ }
        
        console.error(`Genea API Key verification failed: ${errorMessage}`);
        return { success: false, error: `API Key verification failed: ${errorMessage}` };
    }
  } catch (error: unknown) {
    console.error('Network or other error during Genea connection test:', error);
    const message = error instanceof Error ? error.message : 'Unknown error during connection test';
    return { success: false, error: `Connection test failed: ${message}` };
  }
} 