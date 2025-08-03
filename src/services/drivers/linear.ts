import { z } from 'zod';
import { LinearClient } from '@linear/sdk';

// Linear Configuration Schema (for storage)
export const LinearConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  teamId: z.string().optional(),
  teamName: z.string().optional(),
});

// Linear Configuration with UI properties (includes isEnabled from BaseServiceConfig pattern)
export interface LinearConfig {
  id?: string;
  type?: 'linear';
  isEnabled?: boolean;
  apiKey: string;
  teamId?: string;
  teamName?: string;
}

export type LinearStoredConfig = z.infer<typeof LinearConfigSchema>;

// Linear API Response Types
export interface LinearTeam {
  id: string;
  name: string;
  key: string;
  description?: string;
}

export interface LinearUser {
  id: string;
  name: string;
  email: string;
  displayName: string;
}

export interface LinearTestResult {
  success: boolean;
  message?: string;
  error?: string;
  user?: LinearUser;
  teams?: LinearTeam[];
  responseTime?: number;
}

/**
 * Create a Linear client with API key
 */
function createLinearClient(apiKey: string): LinearClient {
  return new LinearClient({
    apiKey: apiKey,
  });
}

/**
 * Test Linear API connection and return user info + available teams
 */
export async function testLinearConnection(config: unknown): Promise<LinearTestResult> {
  const startTime = Date.now();
  
  try {
    // Validate configuration
    const validatedConfig = LinearConfigSchema.parse(config);
    
    // Create Linear client
    const client = createLinearClient(validatedConfig.apiKey);
    
    // Test the connection by fetching user and teams
    const [viewer, teams] = await Promise.all([
      client.viewer,
      client.teams()
    ]);

    const responseTime = Date.now() - startTime;

    return {
      success: true,
      message: `Connected successfully as ${viewer.displayName || viewer.name}`,
      user: {
        id: viewer.id,
        name: viewer.name,
        email: viewer.email,
        displayName: viewer.displayName,
      },
      teams: teams.nodes.map(team => ({
        id: team.id,
        name: team.name,
        key: team.key,
        description: team.description || undefined,
      })),
      responseTime,
    };
  } catch (error) {
    console.error('Linear connection test failed:', error);
    
    let errorMessage = 'Unknown error occurred';
    
    if (error instanceof z.ZodError) {
      errorMessage = `Configuration error: ${error.errors.map(e => e.message).join(', ')}`;
    } else if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        errorMessage = 'Invalid API key. Please check your Linear API key.';
      } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
        errorMessage = 'Access forbidden. Please check your API key permissions.';
      } else if (error.message.includes('Network')) {
        errorMessage = 'Network error: Unable to connect to Linear API.';
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      error: errorMessage,
      responseTime: Date.now() - startTime,
    };
  }
}

/**
 * Get user information from Linear
 */
export async function getLinearViewer(apiKey: string): Promise<LinearUser> {
  const client = createLinearClient(apiKey);
  const viewer = await client.viewer;
  
  return {
    id: viewer.id,
    name: viewer.name,
    email: viewer.email,
    displayName: viewer.displayName,
  };
}

/**
 * Get available teams from Linear
 */
export async function getLinearTeams(apiKey: string): Promise<LinearTeam[]> {
  const client = createLinearClient(apiKey);
  const teams = await client.teams();
  
  return teams.nodes.map(team => ({
    id: team.id,
    name: team.name,
    key: team.key,
    description: team.description || undefined,
  }));
}

/**
 * Validate Linear configuration
 */
export function validateLinearConfig(config: unknown): LinearConfig {
  return LinearConfigSchema.parse(config);
}