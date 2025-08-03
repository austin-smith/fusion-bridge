import { z } from 'zod';
import { LinearClient } from '@linear/sdk';

// Temporary toggle for testing - set to false to use real API
const USE_MOCK_DATA = true;

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
  creator: LinearUser;
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
    activeOnly?: boolean; // New: filter to active states only (excludes completed/canceled)
    filter?: {
      state?: string;
      assignee?: string;
      priority?: number;
    };
  }
): Promise<LinearIssuesResponse> {
  if (USE_MOCK_DATA) {
    console.log('[Linear Driver] Using mock data for issues');
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate API delay
    
    // Mock response that matches the optimized GraphQL query fields
    const mockApiResponse = {
      issues: {
        nodes: [
          {
            id: "3c00c903-ae15-4b5e-a9dd-d714f93409a4",
            identifier: "FUS-55",
            title: "Cleanup | Remove data/repositories/event.ts",
            description: "Remove data/repositories/event.ts and merge with org-scoped-db.ts… they are doing the same things.",
            priority: 3,
            url: "https://linear.app/pikoxfusion/issue/FUS-55/cleanup-or-remove-datarepositorieseventts",
            updatedAt: "2025-08-01T04:24:11.990Z",
            createdAt: "2025-07-15T10:20:30.000Z",
            state: {
              name: "Todo",
              color: "#e2e2e2",
              type: "unstarted"
            },
            assignee: {
              name: "Austin Smith",
              email: "austinsmith23@gmail.com"
            },
            creator: {
              name: "Austin Smith",
              email: "austinsmith23@gmail.com"
            },
            labels: {
              nodes: [
                { id: "improvement-1", name: "Improvement", color: "#10b981" }
              ]
            }
          },
          {
            id: "0fd4bab0-4371-4830-a0d5-7915f2996c32",
            identifier: "FUS-52",
            title: "Devices | Device onboarding wizard",
            priority: 0,
            url: "https://linear.app/pikoxfusion/issue/FUS-52/devices-or-device-onboarding-wizard",
            updatedAt: "2025-07-31T19:54:27.286Z",
            createdAt: "2025-07-20T14:30:15.000Z",
            state: {
              name: "Backlog",
              color: "#bec2c8",
              type: "backlog"
            },
            assignee: {
              name: "Austin Smith",
              email: "austinsmith23@gmail.com"
            },
            creator: {
              name: "Austin Smith",
              email: "austinsmith23@gmail.com"
            },
            labels: {
              nodes: [
                { id: "feature-1", name: "Feature", color: "#BB87FC" }
              ]
            }
          },
          {
            id: "44234cc6-0cc3-4963-be83-19d81a582251",
            identifier: "FUS-47",
            title: "Set up proper domain",
            description: "# Prod\n\n---\n\nCurrently, the prod Fusion site is available at[ https://www.getfusion.io/](https://www.getfusion.io/.).\n\nInstead, make it available via[ https://app.getfusion.io/](https://app.getfusion.io/.) using the below config info…\n\n## **Configure DNS Records**\n\nTo finish setting up your custom domain, add the following DNS records to [getfusion.io](https://getfusion.io/):\n\n| Type | Name | Value |\n| -- | -- | -- |\n| CNAME | app | `nndizemc.up.railway.app` |\n\n# Non-prod\n\n---\n\nMake dev available at[ https://app.getfusion.dev/.](https://app.getfusion.dev/.) \n\n## **Configure DNS Records**\n\nTo finish setting up your custom domain, add the following DNS records to [getfusion.dev](https://getfusion.dev/)\n\n| Type | Name | Value |\n| -- | -- | -- |\n| CNAME | app | `1j7fbj7e.up.railway.app` |",
            priority: 4,
            url: "https://linear.app/pikoxfusion/issue/FUS-47/set-up-proper-domain",
            updatedAt: "2025-08-01T02:39:31.270Z",
            createdAt: "2025-07-25T09:15:45.000Z",
            state: {
              name: "In Progress",
              color: "#f2c94c",
              type: "started"
            },
            assignee: {
              name: "Levi Daily",
              email: "leviwaynedaily@gmail.com"
            },
            creator: {
              name: "Austin Smith",
              email: "austinsmith23@gmail.com"
            },
            labels: {
              nodes: [
                { id: "improvement-2", name: "Improvement", color: "#4EA7FC" },
                { id: "feature-1", name: "Feature", color: "#BB87FC" }
              ]
            }
          },
          {
            id: "4dcfe580-56df-49ab-b9b1-a76888dfafe7",
            identifier: "FUS-10",
            title: "Locations & Areas | Connectors w/ same name causes frontend display issues",
            description: "When two or more connectors share the same name, it causes two issues on the **Locations & Areas** page:\n\n* Visual data duplication (same device show up twice)\n* When associating devices to areas, only one of the connectors w/ duplicate names are displayed in \"Connectors\" dropdown",
            priority: 2,
            url: "https://linear.app/pikoxfusion/issue/FUS-10/locations-and-areas-or-connectors-w-same-name-causes-frontend-display",
            updatedAt: "2025-07-15T18:35:47.057Z",
            createdAt: "2025-07-10T11:20:30.000Z",
            state: {
              name: "Done",
              color: "#5e6ad2",
              type: "completed"
            },
            assignee: {
              name: "Austin Smith",
              email: "austinsmith23@gmail.com"
            },
            creator: {
              name: "Austin Smith",
              email: "austinsmith23@gmail.com"
            },
            labels: {
              nodes: [
                { id: "bug-1", name: "Bug", color: "#EB5757" }
              ]
            }
          },
          {
            id: "3617199e-aeee-416b-9a71-8c300d9963b7",
            identifier: "FUS-4",
            title: "Connect GitHub or GitLab",
            description: "Connect your account to link issues to pull/merge requests and automate your workflow:\n\n* Link Linear issues to pull requests.\n* Automatically update an issue's status when PRs are created or merged.\n* Connect one or multiple repos.\n\n[Connect GitHub or GitLab →](https://linear.app/settings/integrations/github)\n\n## Setup tips\n\n#### How to link a Linear issue to a PR\n\n* **Branch name** (e.g. \"LIN-123\" or \"username/LIN-123\"). To quickly copy branch name for an issue to your clipboard, press `Cmd/Ctrl` `Shift` `.`\n* **Pull request title** (e.g. \"GitHub Workflow LIN-123\")\n* **Pull request description** (e.g. *Fixes LIN-123, Resolves LIN-123*) – it will not work if entered in commits or comments.\n\n#### When you link a Linear issue to a PR, Linear will:\n\n* Create a link to the PR in the Linear issue.\n* Comment on the PR with a link back to the Linear issue.\n* Once PR has been opened, Linear will change the status of the issue to \"In Progress\".\n* Once PR has been merged, Linear will change the status of the issue as \"Done\".\n\n#### Suggested Workflow\n\n1. Select or create the issue you want to work on next.\n2. Open the command menu (`Cmd` `K` on Mac, or `Ctrl` `K` on Windows) and select **Copy git branch name,** or use the shortcut `Cmd/Ctrl` `Shift` `.`\n3. This will copy the git branch name to your clipboard (e.g. `username/LIN-123-github-workflow`\n4. Paste the branch name to your git checkout command to create a new branch: `git checkout -b username/LIN-123-github-workflow`\n5. Make your changes and push the branch to GitHub and open a pull request\n6. Once the pull request is open, Linear will comment on the PR and change the issue state to **In Progress***.* \n7. Once the PR merged, Linear will change the status to Done.\n\nRead full integration instructions for [GitHub](https://linear.app/docs/github) and [GitLab →](https://linear.app/docs/gitlab)",
            priority: 1,
            url: "https://linear.app/pikoxfusion/issue/FUS-4/connect-github-or-gitlab",
            updatedAt: "2025-07-04T23:22:53.219Z",
            createdAt: "2025-07-01T08:10:20.000Z",
            state: {
              name: "Canceled",
              color: "#95a2b3",
              type: "canceled"
            },
            assignee: null,
            creator: {
              name: "Austin Smith",
              email: "austinsmith23@gmail.com"
            },
            labels: { nodes: [] }
          }
        ],
        pageInfo: {
          hasNextPage: false,
          endCursor: "21d08300-be22-454d-9f17-2cd4dae69568"
        }
      }
    };

    // Transform to match our interface (same logic as real API)
    let issues: LinearIssue[] = mockApiResponse.issues.nodes.map((issue: any) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || undefined,
      priority: issue.priority,
      url: issue.url,
      updatedAt: new Date(issue.updatedAt),
      createdAt: new Date(issue.createdAt),
      state: {
        id: '', // Not needed in UI but required by type
        name: issue.state.name,
        color: issue.state.color,
        type: issue.state.type,
      },
      assignee: issue.assignee ? {
        id: '', // Not needed in UI but required by type
        name: issue.assignee.name,
        email: issue.assignee.email,
        displayName: issue.assignee.name, // Use name as displayName fallback
      } : undefined,
      creator: {
        id: '', // Not needed in UI but required by type
        name: issue.creator.name,
        email: issue.creator.email,
        displayName: issue.creator.name, // Use name as displayName fallback
      },
      team: {
        id: '',
        name: '',
        key: '',
      },
      labels: (issue as any).labels?.nodes || [],
      estimate: undefined,
    }));

    // Apply activeOnly filter if specified
    if (options?.activeOnly) {
      issues = issues.filter(issue => 
        !['completed', 'canceled'].includes(issue.state.type)
      );
    }

    return {
      issues,
      pageInfo: {
        hasNextPage: false, // Mock always returns all data
        endCursor: undefined,
      },
      totalCount: issues.length,
    };
  }

  const client = createLinearClient(apiKey);
  
  try {
    // Build filter object
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

    // Auto-pagination: fetch all pages
    const allIssues: any[] = [];
    let hasNextPage = true;
    let after: string | undefined = undefined;
    const pageSize = 50; // Use Linear's default

    // Use optimized GraphQL query - only fetch fields we actually use
    const query = `
      query Issues($first: Int, $after: String, $filter: IssueFilter) {
        issues(first: $first, after: $after, filter: $filter) {
          nodes {
            id
            identifier
            title
            description
            priority
            url
            updatedAt
            createdAt
            state {
              name
              color
              type
            }
            assignee {
              name
              email
            }
            creator {
              name
              email
            }
            labels {
              nodes {
                id
                name
                color
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    // Auto-pagination loop: fetch all pages
    while (hasNextPage) {
      const variables = {
        first: pageSize,
        after,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
      };

      const response = await client.client.rawRequest(query, variables);
      const data = response.data as any;

      // Add issues from current page
      allIssues.push(...data.issues.nodes);

      // Update pagination state
      hasNextPage = data.issues.pageInfo.hasNextPage;
      after = data.issues.pageInfo.endCursor;

      // Safety check to prevent infinite loops
      if (allIssues.length > 10000) {
        console.warn('[Linear Driver] Breaking auto-pagination at 10,000 issues for safety');
        break;
      }
    }

    // Transform all issues to match our interface
    let issues: LinearIssue[] = allIssues.map((issue: any) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || undefined,
      priority: issue.priority,
      url: issue.url,
      updatedAt: new Date(issue.updatedAt),
      createdAt: new Date(issue.createdAt),
      state: {
        id: '', // Not needed in UI but required by type
        name: issue.state.name,
        color: issue.state.color,
        type: issue.state.type,
      },
      assignee: issue.assignee ? {
        id: '', // Not needed in UI but required by type
        name: issue.assignee.name,
        email: issue.assignee.email,
        displayName: issue.assignee.name, // Use name as displayName fallback
      } : undefined,
      creator: {
        id: '', // Not needed in UI but required by type
        name: issue.creator.name,
        email: issue.creator.email,
        displayName: issue.creator.name, // Use name as displayName fallback
      },
      team: {
        id: '',
        name: '',
        key: '',
      },
      labels: (issue as any).labels?.nodes || [],
      estimate: undefined,
    }));

    // Apply activeOnly filter if specified
    if (options?.activeOnly) {
      issues = issues.filter(issue => 
        !['completed', 'canceled'].includes(issue.state.type)
      );
    }

    return {
      issues,
      pageInfo: {
        hasNextPage: false, // We fetched all pages, so no more data
        endCursor: undefined,
      },
      totalCount: issues.length,
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
  if (USE_MOCK_DATA) {
    console.log('[Linear Driver] Using mock data for single issue');
    await new Promise(resolve => setTimeout(resolve, 75)); // Simulate API delay
    
    // Mock response that matches the optimized GraphQL query fields
    const mockApiResponse = {
      issue: {
        id: "44234cc6-0cc3-4963-be83-19d81a582251",
        identifier: "FUS-47",
        title: "Set up proper domain",
        description: "# Prod\n\n---\n\nCurrently, the prod Fusion site is available at[ https://www.getfusion.io/](https://www.getfusion.io/.).\n\nInstead, make it available via[ https://app.getfusion.io/](https://app.getfusion.io/.) using the below config info…\n\n## **Configure DNS Records**\n\nTo finish setting up your custom domain, add the following DNS records to [getfusion.io](https://getfusion.io/):\n\n| Type | Name | Value |\n| -- | -- | -- |\n| CNAME | app | `nndizemc.up.railway.app` |",
        priority: 4,
        url: "https://linear.app/pikoxfusion/issue/FUS-47/set-up-proper-domain",
        updatedAt: "2025-08-01T02:39:31.270Z",
        createdAt: "2025-07-25T09:15:45.000Z",
        state: {
          name: "In Progress",
          color: "#f2c94c",
          type: "started"
        },
        assignee: {
          name: "Levi Daily",
          email: "levi@example.com"
        },
        creator: {
          name: "Austin Smith",
          email: "austinsmith23@gmail.com"
        },
        labels: {
          nodes: [
            { id: "improvement-2", name: "Improvement", color: "#10b981" },
            { id: "urgent-1", name: "Urgent", color: "#ef4444" }
          ]
        }
      }
    };

    // Transform to match our interface (same logic as real API)
    const issue = mockApiResponse.issue;
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || undefined,
      priority: issue.priority,
      url: issue.url,
      updatedAt: new Date(issue.updatedAt),
      createdAt: new Date(issue.createdAt),
      state: {
        id: '', // Not needed in UI but required by type
        name: issue.state.name,
        color: issue.state.color,
        type: issue.state.type,
      },
      assignee: issue.assignee ? {
        id: '', // Not needed in UI but required by type
        name: issue.assignee.name,
        email: issue.assignee.email,
        displayName: issue.assignee.name, // Use name as displayName fallback
      } : undefined,
      creator: {
        id: '', // Not needed in UI but required by type
        name: issue.creator.name,
        email: issue.creator.email,
        displayName: issue.creator.name, // Use name as displayName fallback
      },
      team: {
        id: '',
        name: '',
        key: '',
      },
      labels: (issue as any).labels?.nodes || [],
      estimate: undefined,
    };
  }

  // REAL API CODE - OPTIMIZED FOR PERFORMANCE
  const client = createLinearClient(apiKey);
  
  try {
    // Use optimized GraphQL query - only fetch fields we actually use
    const query = `
      query Issue($id: String!) {
        issue(id: $id) {
          id
          identifier
          title
          description
          priority
          url
          updatedAt
          createdAt
          state {
            name
            color
            type
          }
          assignee {
            name
            email
          }
          creator {
            name
            email
          }
          labels {
            nodes {
              id
              name
              color
            }
          }
        }
      }
    `;

    const variables = { id: issueId };
    const response = await client.client.rawRequest(query, variables);
    const data = response.data as any;
    
    if (!data.issue) {
      throw new Error('Issue not found');
    }

    const issue = data.issue;

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || undefined,
      priority: issue.priority,
      url: issue.url,
      updatedAt: new Date(issue.updatedAt),
      createdAt: new Date(issue.createdAt),
      state: {
        id: '', // Not needed in UI but required by type
        name: issue.state.name,
        color: issue.state.color,
        type: issue.state.type,
      },
      assignee: issue.assignee ? {
        id: '', // Not needed in UI but required by type
        name: issue.assignee.name,
        email: issue.assignee.email,
        displayName: issue.assignee.name, // Use name as displayName fallback
      } : undefined,
      creator: {
        id: '', // Not needed in UI but required by type
        name: issue.creator.name,
        email: issue.creator.email,
        displayName: issue.creator.name, // Use name as displayName fallback
      },
      team: {
        id: '',
        name: '',
        key: '',
      },
      labels: (issue as any).labels?.nodes || [],
      estimate: undefined,
    };
  } catch (error) {
    console.error('Error fetching Linear issue:', error);
    throw new Error('Failed to fetch Linear issue');
  }
}

/**
 * Validate Linear configuration
 */
export function validateLinearConfig(config: unknown): LinearConfig {
  return LinearConfigSchema.parse(config);
}