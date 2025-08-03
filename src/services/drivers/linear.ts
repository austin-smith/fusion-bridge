import { z } from 'zod';
import { LinearClient } from '@linear/sdk';
import { Flag } from 'lucide-react';
import { MOCK_LINEAR_ISSUES_RESPONSE } from './linear-mock-data';

// Shared Linear Priority Configuration
export const LINEAR_PRIORITY_CONFIG = {
  0: { label: 'None', color: '#6b7280', icon: Flag },     // gray-500
  1: { label: 'Urgent', color: '#ef4444', icon: Flag },   // red-500
  2: { label: 'High', color: '#f97316', icon: Flag },     // orange-500
  3: { label: 'Medium', color: '#eab308', icon: Flag },   // yellow-500
  4: { label: 'Low', color: '#3b82f6', icon: Flag },      // blue-500
} as const;

export const getLinearPriorityConfig = (priority: number) => {
  return LINEAR_PRIORITY_CONFIG[priority as keyof typeof LINEAR_PRIORITY_CONFIG] || LINEAR_PRIORITY_CONFIG[0];
};

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

export interface LinearLabel {
  id: string;
  name: string;
  color: string;
}

export interface LinearIssue {
  id: string;
  identifier: string; // e.g., "FUS-123"
  title: string;
  description?: string;
  priority: number;
  estimate?: number;
  url: string;
  createdAt: Date;
  updatedAt: Date;
  state: {
    id: string;
    name: string;
    color: string;
    type: string;
  };
  assignee?: LinearUser;
  creator?: LinearUser;
  team: LinearTeam;
  labels: LinearLabel[];
}

export interface LinearIssuesResponse {
  issues: LinearIssue[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor?: string;
  };
  totalCount: number;
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
 * Get issues from Linear for a specific team
 */
export async function getLinearIssues(
  apiKey: string,
  teamId?: string,
  options?: {
    orderBy?: 'updatedAt' | 'createdAt';
    activeOnly?: boolean; // Filter to active states only (excludes completed/canceled)
    filter?: {
      state?: string;
      assignee?: string;
      priority?: number;
    };
  }
): Promise<LinearIssuesResponse> {
  // Return mock data if environment variable is set
  if (process.env.LINEAR_USE_MOCK_DATA === 'true') {
    console.log('[Linear Driver] Using mock data');
    return MOCK_LINEAR_ISSUES_RESPONSE;
  }

  const client = createLinearClient(apiKey);
  
  try {
    // Build filter object for SDK
    const filter: any = {};
    if (teamId) {
      filter.team = { id: { eq: teamId } };
    }
    if (options?.filter?.state) {
      filter.state = { id: { eq: options.filter.state } };
    }
    if (options?.filter?.assignee) {
      filter.assignee = { id: { eq: options.filter.assignee } };
    }
    if (options?.filter?.priority !== undefined) {
      filter.priority = { eq: options.filter.priority };
    }

    // Use SDK method to fetch issues
    const issuesConnection = await client.issues({
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    });

    // Transform issues to match our interface - resolve lazy-loaded relationships
    const issues: LinearIssue[] = await Promise.all(
      issuesConnection.nodes.map(async (issue: any) => {
        // Resolve all related data using SDK's lazy loading
        const [state, assignee, creator, team, labels] = await Promise.all([
          issue.state,
          issue.assignee,
          issue.creator,
          issue.team,
          issue.labels()
        ]);

        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description || undefined,
          priority: issue.priority,
          url: issue.url,
          updatedAt: issue.updatedAt,
          createdAt: issue.createdAt,
          state: {
            id: state?.id || '',
            name: state?.name || '',
            color: state?.color || '',
            type: state?.type || '',
          },
          assignee: assignee ? {
            id: assignee.id,
            name: assignee.name,
            email: assignee.email,
            displayName: assignee.displayName || assignee.name,
          } : undefined,
          creator: creator ? {
            id: creator.id,
            name: creator.name,
            email: creator.email,
            displayName: creator.displayName || creator.name,
          } : undefined,
          team: {
            id: team?.id || '',
            name: team?.name || '',
            key: team?.key || '',
          },
          labels: labels?.nodes || [],
          estimate: issue.estimate,
        };
      })
    );

    // Apply activeOnly filter if specified
    const filteredIssues = options?.activeOnly 
      ? issues.filter(issue => !['completed', 'canceled'].includes(issue.state.type))
      : issues;

    return {
      issues: filteredIssues,
      pageInfo: {
        hasNextPage: issuesConnection.pageInfo.hasNextPage,
        endCursor: issuesConnection.pageInfo.endCursor,
      },
      totalCount: filteredIssues.length,
    };
  } catch (error) {
    console.error('Error fetching Linear issues:', error);
    throw new Error('Failed to fetch Linear issues');
  }
}

/**
 * Get a single issue from Linear by ID
 */
export async function getLinearIssue(apiKey: string, issueId: string): Promise<LinearIssue> {
  const client = createLinearClient(apiKey);
  
  try {
    // Use SDK method to fetch single issue
    const issue = await client.issue(issueId);
    
    if (!issue) {
      throw new Error('Issue not found');
    }

    // Resolve all related data using SDK's lazy loading
    const [state, assignee, creator, team, labels] = await Promise.all([
      issue.state,
      issue.assignee,
      issue.creator,
      issue.team,
      issue.labels()
    ]);

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || undefined,
      priority: issue.priority,
      url: issue.url,
      updatedAt: issue.updatedAt,
      createdAt: issue.createdAt,
      state: {
        id: state?.id || '',
        name: state?.name || '',
        color: state?.color || '',
        type: state?.type || '',
      },
      assignee: assignee ? {
        id: assignee.id,
        name: assignee.name,
        email: assignee.email,
        displayName: assignee.displayName || assignee.name,
      } : undefined,
      creator: creator ? {
        id: creator.id,
        name: creator.name,
        email: creator.email,
        displayName: creator.displayName || creator.name,
      } : undefined,
      team: {
        id: team?.id || '',
        name: team?.name || '',
        key: team?.key || '',
      },
      labels: labels?.nodes || [],
      estimate: issue.estimate,
    };
  } catch (error) {
    console.error('Error fetching Linear issue:', error);
    throw new Error('Failed to fetch Linear issue');
  }
}

/**
 * Update a Linear issue with any fields
 */
export async function updateLinearIssue(
  apiKey: string, 
  issueId: string, 
  updates: {
    stateId?: string;
    assigneeId?: string;
    priority?: number;
    title?: string;
    description?: string;
    estimate?: number;
    // Additional fields can be added as needed
  }
): Promise<LinearIssue> {
  const client = createLinearClient(apiKey);
  
  try {
    // Use Linear SDK's updateIssue mutation
    const updatePayload = await client.updateIssue(issueId, updates);

    if (!updatePayload.success) {
      throw new Error('Failed to update issue');
    }

    // Return the updated issue by fetching it fresh
    return await getLinearIssue(apiKey, issueId);
  } catch (error) {
    console.error('Error updating Linear issue:', error);
    throw new Error(`Failed to update issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate Linear configuration
 */
export function validateLinearConfig(config: unknown): LinearConfig {
  return LinearConfigSchema.parse(config);
}