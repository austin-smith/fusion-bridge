import 'server-only';

// Type for organization metadata structure
export interface OrganizationMetadata {
  defaultTimezone?: string;
  [key: string]: any; // Allow other custom fields
}

/**
 * Get the default timezone from organization metadata
 * @param metadata - The organization metadata object
 * @returns The default timezone (should always exist due to beforeCreate hook)
 */
export function getOrganizationDefaultTimezone(metadata: any): string {
  const parsed = parseOrganizationMetadata(metadata);
  if (!parsed.defaultTimezone) {
    console.error('[Organization Utils] No defaultTimezone found in metadata. This should not happen if beforeCreate hook is working properly.', { metadata: parsed });
    throw new Error('Organization missing required defaultTimezone metadata');
  }
  return parsed.defaultTimezone;
}

/**
 * Parse organization metadata safely
 * @param metadata - Raw metadata from Better Auth
 * @returns Parsed metadata object
 */
export function parseOrganizationMetadata(metadata: any): OrganizationMetadata {
  if (!metadata) return {};
  
  // If metadata is already an object, return it
  if (typeof metadata === 'object') {
    return metadata as OrganizationMetadata;
  }
  
  // If metadata is a string, try to parse it as JSON
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata) as OrganizationMetadata;
    } catch {
      return {};
    }
  }
  
  return {};
}

/**
 * Update organization metadata with new values
 * @param currentMetadata - Current metadata
 * @param updates - Updates to apply
 * @returns Updated metadata object
 */
export function updateOrganizationMetadata(
  currentMetadata: any, 
  updates: Partial<OrganizationMetadata>
): OrganizationMetadata {
  const parsed = parseOrganizationMetadata(currentMetadata);
  return {
    ...parsed,
    ...updates
  };
} 