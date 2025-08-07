import { z } from 'zod';

// Define the expected config structure for Genea
const GeneaConfigSchema = z.object({
  apiKey: z.string().min(1, 'API Key is required'),
  webhookId: z.string().uuid().optional(), // webhookId might not be present during test
  // customerUuid is retrieved during test, not provided initially
  customerUuid: z.string().uuid().optional(), 
});

// Export the type
export type GeneaConfig = z.infer<typeof GeneaConfigSchema>;

const GENEA_API_BASE_URL = 'https://api.sequr.io';

// Add customerUuid to the result type
interface GeneaTestResult {
  success: boolean;
  message?: string;
  error?: string;
  customerUuid?: string; // Added field
}

// Define a schema for the expected success response structure
const GeneaVerifySuccessResponseSchema = z.object({
  data: z.object({
    customer_uuid: z.string().uuid(),
    // Include other fields if needed, but customer_uuid is the target
  }),
  meta: z.object({
    message: z.string(),
  }).optional(), // Meta might not always be present or needed
});

// --- UPDATED: Schemas for fetching doors ---

// Nested object schemas
const GeneaControllerSchema = z.object({
    uuid: z.string().uuid(),
    scp_number: z.number().nullable(),
    name: z.string().nullable(),
    mac: z.string().nullable(),
    model: z.string().nullable(),
    timezone: z.string().nullable(),
    is_online: z.boolean().nullable(),
}).nullable();

const GeneaInterfacePanelSchema = z.object({
    uuid: z.string().uuid(),
    name: z.string().nullable(),
    sio_number: z.number().nullable(),
}).nullable();

const GeneaOutputPointSchema = z.object({
    uuid: z.string().uuid(),
    name: z.string().nullable(),
    output_point_number: z.number().nullable(),
}).nullable();

const GeneaReaderPortSchema = z.object({
    uuid: z.string().uuid(),
    name: z.string().nullable(),
    reader_port_number: z.number().nullable(),
}).nullable();

// Main Door Schema (Updated based on new sample)
const GeneaDoorSchema = z.object({
    uuid: z.string().uuid(),
    customer_uuid: z.string().uuid(),
    location_uuid: z.string().uuid().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    is_locked: z.boolean().nullable(),
    is_door_unlock_on_rex_enabled: z.boolean().nullable(), // Added from new sample
    is_door_unlock_schedule_enabled: z.boolean().nullable(),
    door_unlock_schedule_uuid: z.string().uuid().nullable(),
    is_door_force_masked: z.boolean().nullable(),
    is_door_force_seen: z.boolean().nullable(),
    last_door_force_seen_at: z.string().datetime({ offset: true }).nullable(), // Assuming ISO 8601 format
    is_door_held_masked: z.boolean().nullable(),
    is_door_held_seen: z.boolean().nullable(),
    last_door_held_seen_at: z.string().datetime({ offset: true }).nullable(), // Assuming ISO 8601 format
    created_at: z.string().datetime({ offset: true }), // Assuming ISO 8601 format
    updated_at: z.string().datetime({ offset: true }), // Assuming ISO 8601 format
    is_lockdown: z.boolean().nullable(),
    is_elevator_door: z.boolean().nullable(),
    elevator_door_type: z.string().nullable(), // Added from new sample
    is_temperature_screening: z.boolean().nullable(),
    is_first_person_in_enabled: z.boolean().nullable(),
    id: z.string(), // Keep as string, might be numeric string
    is_online: z.boolean().nullable(), // Updated nullability
    last_online_at: z.string().datetime({ offset: true }).nullable(), // Added from new sample
    last_offline_at: z.string().datetime({ offset: true }).nullable(), // Added from new sample
    acr_number: z.number().nullable(), // Changed type to number based on new sample
    controller_uuid: z.string().uuid().nullable(),
    reader_model: z.string().nullable(), // Correctly included
    reader_port_uuid: z.string().uuid().nullable(),
    door_strike_output_point_uuid: z.string().uuid().nullable(),
    door_position_input_point_uuid: z.string().uuid().nullable(),
    door_access_mode: z.string().nullable(),
    reader_access_type: z.string().nullable(),
    door_access_time: z.number().nullable(),
    door_strike_mode: z.string().nullable(),
    door_led_mode: z.string().nullable(),
    door_held_open_alarm_delay: z.number().nullable(),
    door_held_open_pre_alarm_delay: z.number().nullable(),
    door_offline_mode: z.string().nullable(),
    extended_feature_type: z.string().nullable(),
    rex1_input_point_uuid: z.string().uuid().nullable(),
    rex2_input_point_uuid: z.string().uuid().nullable(),
    alternate_reader_port_uuid: z.string().uuid().nullable(),
    alternate_reader_access_type: z.string().nullable(),
    door_unlock_schedule_rule_uuid: z.string().uuid().nullable(),
    anti_passback_type: z.string().nullable(), // Added from new sample
    door_anti_passback_mode: z.string().nullable(), // Changed name from sample
    anti_passback_delay: z.number().nullable(), // Added from new sample
    from_area_uuid: z.string().uuid().nullable(), // Added from new sample
    to_area_uuid: z.string().uuid().nullable(), // Added from new sample
    
    // Nested objects
    controller: GeneaControllerSchema, // Use nested schema
    interface_panel: GeneaInterfacePanelSchema, // Use nested schema
    door_position_input_point: z.any().nullable(), // Keeping simple for now, no sample data
    rex1_input_point: z.any().nullable(), // Keeping simple for now, no sample data
    rex2_input_point: z.any().nullable(), // Keeping simple for now, no sample data
    door_unlock_schedule: z.any().nullable(), // Keeping simple for now, no sample data
    door_strike_output_point: GeneaOutputPointSchema, // Use nested schema
    reader_port: GeneaReaderPortSchema, // Use nested schema

    // Additional fields from sample
    from_area_name: z.string().nullable(), // Added from new sample
    to_area_name: z.string().nullable(), // Added from new sample
    is_reader_attached: z.boolean().nullable(), // Updated nullability
    ip_address: z.string().nullable(), // Added from new sample
    is_built_in_dec_reader: z.boolean().nullable().optional(), // Make optional
});

// Type for a single Genea Door based on the updated schema
export type GeneaDoor = z.infer<typeof GeneaDoorSchema>;

// Schema for the Pagination object within Meta
const GeneaPaginationSchema = z.object({
    page: z.number(),
    page_size: z.number(),
    row_count: z.number(),
    page_count: z.number(),
    from: z.number(),
    to: z.number(),
    order: z.string().optional(), // Optional based on sample
    order_by: z.string().optional(), // Optional based on sample
});

// Updated Response Schema for the Door List endpoint
const GeneaDoorListResponseSchema = z.object({
  data: z.array(GeneaDoorSchema), // Data is an array of doors
  meta: z.object({
    pagination: GeneaPaginationSchema, // Include pagination schema
    message: z.string(),
  }).optional(), // Meta itself might still be optional? Keeping optional for safety.
});
// --- END UPDATED Schemas ---

/**
 * Tests the connection to Genea by verifying the API key.
 * @param config - The Genea connector configuration containing the API key.
 * @returns An object indicating success or failure, and the customerUuid on success.
 */
export async function testGeneaConnection(config: unknown): Promise<GeneaTestResult> {
  // Validate the input config (only needs apiKey for the test)
  const parseResult = z.object({ apiKey: z.string().min(1) }).safeParse(config);
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
      body: JSON.stringify({ api_key: apiKey }), // Send apiKey in body as required by Genea
    });

    // Check if the response status indicates success (e.g., 200 OK)
    if (response.ok) {
        const responseBody = await response.json();
        // Validate the response body structure
        const validationResult = GeneaVerifySuccessResponseSchema.safeParse(responseBody);

        if (validationResult.success) {
            const customerUuid = validationResult.data.data.customer_uuid;
            console.log(`Genea API Key verified successfully. Customer UUID: ${customerUuid}`);
            // Return success and the customerUuid
            return { 
                success: true, 
                message: 'Genea API Key is valid.',
                customerUuid: customerUuid 
            };
        } else {
             console.error("Genea API Key verification successful, but response format unexpected:", validationResult.error);
             return { 
                success: false, 
                error: 'API Key verified, but failed to parse customer UUID from response.' 
             };
        }
    } else {
        // Handle API errors (e.g., 401 Unauthorized, 404 Not Found, etc.)
        let errorMessage = `Genea API returned status: ${response.status}`;
        try {
            const errorBody = await response.json();
            // Attempt to extract a more specific error message
            errorMessage = errorBody?.meta?.message || errorBody?.error?.message || errorBody?.error || errorMessage;
        } catch (e) { 
            console.warn("Could not parse error response body from Genea API.");
        }
        
        console.error(`Genea API Key verification failed: ${errorMessage}`);
        return { success: false, error: `API Key verification failed: ${errorMessage}` };
    }
  } catch (error: unknown) {
    console.error('Network or other error during Genea connection test:', error);
    const message = error instanceof Error ? error.message : 'Unknown error during connection test';
    return { success: false, error: `Connection test failed: ${message}` };
  }
} 

// --- Function to fetch doors ---
/**
 * Locks a Genea door.
 * @param config - The Genea connector configuration containing the API key.
 * @param doorUuid - The UUID of the door to lock.
 * @returns A promise that resolves to true if the door was successfully locked.
 */
export async function lockGeneaDoor(config: GeneaConfig, doorUuid: string): Promise<boolean> {
  // Validate the config
  const validation = z.object({ 
    apiKey: z.string().min(1)
  }).safeParse(config);

  if (!validation.success) {
    console.error("Invalid Genea config provided for locking door:", validation.error);
    throw new Error('Invalid configuration: API Key is required.');
  }

  if (!doorUuid || typeof doorUuid !== 'string') {
    console.error("Invalid door UUID provided for locking:", doorUuid);
    throw new Error('Invalid door UUID provided.');
  }

  const { apiKey } = validation.data;

  try {
    console.log(`[Genea Driver] Locking door ${doorUuid}...`);
    
    const response = await fetch(`${GENEA_API_BASE_URL}/v2/door/${doorUuid}/lock`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      let errorMessage = `Genea API returned status: ${response.status} when locking door ${doorUuid}`;
      let detailedError = null;
      
      try {
        const errorBody = await response.json();
        detailedError = errorBody;
        
        // Extract more specific error information
        if (response.status === 422) {
          if (errorBody?.meta?.message) {
            errorMessage = errorBody.meta.message;
          } else if (errorBody?.error?.message) {
            errorMessage = errorBody.error.message;
          } else {
            errorMessage = `Door lock failed - request cannot be processed (device may be offline, in maintenance mode, or access restricted)`;
          }
        } else {
          errorMessage = errorBody?.meta?.message || errorBody?.error?.message || errorBody?.error || errorMessage;
        }
      } catch (e) {
        console.warn("Could not parse error response body from Genea lock API.");
        if (response.status === 422) {
          errorMessage = `Door lock failed - request cannot be processed (device may be offline, in maintenance mode, or access restricted)`;
        }
      }
      
      console.error(`[Genea Driver] Lock error for ${doorUuid}:`, { status: response.status, errorMessage, detailedError });
      throw new Error(errorMessage);
    }

    const responseBody = await response.json();
    console.log(`[Genea Driver] Successfully locked door ${doorUuid}. Response:`, responseBody?.meta?.message || 'Success');
    
    // Verify the door is actually locked in the response
    if (responseBody?.data?.is_locked === true) {
      return true;
    } else {
      console.warn(`[Genea Driver] Door ${doorUuid} lock command succeeded but door may not be locked. Response:`, responseBody);
      return true; // Still return true since API call succeeded
    }

  } catch (error: unknown) {
    console.error(`[Genea Driver] Error locking door ${doorUuid}:`, error);
    throw error instanceof Error ? error : new Error(`Unknown error locking door ${doorUuid}`);
  }
}

/**
 * Unlocks a Genea door.
 * @param config - The Genea connector configuration containing the API key.
 * @param doorUuid - The UUID of the door to unlock.
 * @returns A promise that resolves to true if the door was successfully unlocked.
 */
export async function unlockGeneaDoor(config: GeneaConfig, doorUuid: string): Promise<boolean> {
  // Validate the config
  const validation = z.object({ 
    apiKey: z.string().min(1)
  }).safeParse(config);

  if (!validation.success) {
    console.error("Invalid Genea config provided for unlocking door:", validation.error);
    throw new Error('Invalid configuration: API Key is required.');
  }

  if (!doorUuid || typeof doorUuid !== 'string') {
    console.error("Invalid door UUID provided for unlocking:", doorUuid);
    throw new Error('Invalid door UUID provided.');
  }

  const { apiKey } = validation.data;

  try {
    console.log(`[Genea Driver] Unlocking door ${doorUuid}...`);
    
    const response = await fetch(`${GENEA_API_BASE_URL}/v2/door/${doorUuid}/unlock`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      let errorMessage = `Genea API returned status: ${response.status} when unlocking door ${doorUuid}`;
      let detailedError = null;
      
      try {
        const errorBody = await response.json();
        detailedError = errorBody;
        
        // Extract more specific error information
        if (response.status === 422) {
          if (errorBody?.meta?.message) {
            errorMessage = errorBody.meta.message;
          } else if (errorBody?.error?.message) {
            errorMessage = errorBody.error.message;
          } else {
            errorMessage = `Door unlock failed - request cannot be processed (device may be offline, in maintenance mode, or access restricted)`;
          }
        } else {
          errorMessage = errorBody?.meta?.message || errorBody?.error?.message || errorBody?.error || errorMessage;
        }
      } catch (e) {
        console.warn("Could not parse error response body from Genea unlock API.");
        if (response.status === 422) {
          errorMessage = `Door unlock failed - request cannot be processed (device may be offline, in maintenance mode, or access restricted)`;
        }
      }
      
      console.error(`[Genea Driver] Unlock error for ${doorUuid}:`, { status: response.status, errorMessage, detailedError });
      throw new Error(errorMessage);
    }

    const responseBody = await response.json();
    console.log(`[Genea Driver] Successfully unlocked door ${doorUuid}. Response:`, responseBody?.meta?.message || 'Success');
    
    // Verify the door is actually unlocked in the response
    if (responseBody?.data?.is_locked === false) {
      return true;
    } else {
      console.warn(`[Genea Driver] Door ${doorUuid} unlock command succeeded but door may not be unlocked. Response:`, responseBody);
      return true; // Still return true since API call succeeded
    }

  } catch (error: unknown) {
    console.error(`[Genea Driver] Error unlocking door ${doorUuid}:`, error);
    throw error instanceof Error ? error : new Error(`Unknown error unlocking door ${doorUuid}`);
  }
}

/**
 * Fetches all doors for a given Genea customer.
 * @param config - The Genea connector configuration containing the API key and customer UUID.
 * @returns A promise that resolves with an array of GeneaDoor objects.
 */
export async function getGeneaDoors(config: GeneaConfig): Promise<GeneaDoor[]> {
  // Validate the config needed for fetching doors
  const validation = z.object({ 
      apiKey: z.string().min(1), 
      customerUuid: z.string().uuid() 
  }).safeParse(config);

  if (!validation.success) {
    console.error("Invalid Genea config provided for fetching doors:", validation.error);
    throw new Error('Invalid configuration: API Key and Customer UUID are required.');
  }

  const { apiKey, customerUuid } = validation.data;
  const pageSize = 100;

  try {
    console.log(`Fetching Genea doors for customer ${customerUuid} with pagination...`);
    
    const allDoors: GeneaDoor[] = [];
    let currentPage = 1;
    let totalPages = 1; // Will be updated from first response
    let totalRows = 0; // Will be updated from first response

    do {
      console.log(`Fetching Genea doors page ${currentPage}${totalPages > 1 ? ` of ${totalPages}` : ''} (page size: ${pageSize})...`);
      
      const response = await fetch(`${GENEA_API_BASE_URL}/v2/customer/${customerUuid}/door?page=${currentPage}&page_size=${pageSize}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        let errorMessage = `Genea API returned status: ${response.status} when fetching doors (page ${currentPage})`;
        try {
          const errorBody = await response.json();
          errorMessage = errorBody?.meta?.message || errorBody?.error?.message || errorBody?.error || errorMessage;
        } catch (e) {
          console.warn("Could not parse error response body from Genea door fetch API.");
        }
        console.error(errorMessage);
        throw new Error(errorMessage);
      }

      const responseBody = await response.json();
      const parseResult = GeneaDoorListResponseSchema.safeParse(responseBody);

      if (!parseResult.success) {
        console.error(`Failed to parse Genea door list response for page ${currentPage}:`, parseResult.error);
        throw new Error(`Invalid data format received from Genea doors API (page ${currentPage}).`);
      }

      // Update pagination info from first response
      if (currentPage === 1 && parseResult.data.meta?.pagination) {
        totalPages = parseResult.data.meta.pagination.page_count;
        totalRows = parseResult.data.meta.pagination.row_count;
        console.log(`Found ${totalRows} total doors across ${totalPages} pages`);
      }

      // Add doors from this page
      const doorsOnThisPage = parseResult.data.data.length;
      allDoors.push(...parseResult.data.data);
      console.log(`Retrieved ${doorsOnThisPage} doors from page ${currentPage} (${allDoors.length} total so far)`);

      currentPage++;

    } while (currentPage <= totalPages);

    console.log(`Successfully fetched ${allDoors.length} Genea doors total across ${totalPages} pages.`);
    return allDoors;

  } catch (error: unknown) {
    console.error('Error fetching Genea doors:', error);
    // Re-throw the error to be caught by the sync function
    throw error instanceof Error ? error : new Error('Unknown error fetching Genea doors');
  }
}