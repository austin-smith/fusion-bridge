import 'server-only';

import type { AutomationConfig, AutomationAction } from '@/lib/automation-schemas';
import { AutomationActionType } from '@/lib/automation-types';

// Define thumbnail token patterns to search for
const THUMBNAIL_TOKEN_PATTERNS = [
  /\{\{\s*event\.thumbnail\s*\}\}/g,
] as const;

export interface ThumbnailRequirement {
  automationId: string;
  requiresThumbnail: boolean;
  usedTokens: string[];
}

export interface OrganizationThumbnailRequirements {
  organizationId: string;
  automations: ThumbnailRequirement[];
  requiresThumbnail: boolean; // True if any automation needs thumbnails
}

/**
 * Analyzes automation configurations to determine thumbnail requirements
 * This allows us to conditionally fetch thumbnails only when needed
 */
export class AutomationThumbnailAnalyzer {
  private static cache = new Map<string, OrganizationThumbnailRequirements>();
  private static cacheExpiry = new Map<string, number>();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Analyzes a single automation configuration for thumbnail token usage
   */
  static analyzeAutomationConfig(
    automationId: string,
    config: AutomationConfig
  ): ThumbnailRequirement {
    const usedTokens: string[] = [];
    let requiresThumbnail = false;

    // Check all actions for thumbnail token usage
    for (const action of config.actions) {
      const actionTokens = this.findThumbnailTokensInAction(action);
      if (actionTokens.length > 0) {
        usedTokens.push(...actionTokens);
        requiresThumbnail = true;
      }
    }

    // Remove duplicates
    const uniqueTokens = [...new Set(usedTokens)];

    return {
      automationId,
      requiresThumbnail,
      usedTokens: uniqueTokens,
    };
  }

  /**
   * Analyzes all automations for an organization
   */
  static analyzeOrganizationAutomations(
    organizationId: string,
    automations: Array<{ id: string; config: AutomationConfig }>
  ): OrganizationThumbnailRequirements {
    const automationRequirements: ThumbnailRequirement[] = [];
    let orgRequiresThumbnail = false;

    for (const automation of automations) {
      const requirement = this.analyzeAutomationConfig(automation.id, automation.config);
      automationRequirements.push(requirement);
      
      if (requirement.requiresThumbnail) {
        orgRequiresThumbnail = true;
      }
    }

    const result: OrganizationThumbnailRequirements = {
      organizationId,
      automations: automationRequirements,
      requiresThumbnail: orgRequiresThumbnail,
    };

    // Cache the result
    this.cache.set(organizationId, result);
    this.cacheExpiry.set(organizationId, Date.now() + this.CACHE_TTL_MS);

    return result;
  }

  /**
   * Gets cached thumbnail requirements for an organization
   * Returns null if not cached or expired
   */
  static getCachedRequirements(organizationId: string): OrganizationThumbnailRequirements | null {
    const expiry = this.cacheExpiry.get(organizationId);
    if (!expiry || Date.now() > expiry) {
      // Cache expired, clean up
      this.cache.delete(organizationId);
      this.cacheExpiry.delete(organizationId);
      return null;
    }

    return this.cache.get(organizationId) || null;
  }

  /**
   * Clears cache for an organization (useful when automations are updated)
   */
  static clearCache(organizationId: string): void {
    this.cache.delete(organizationId);
    this.cacheExpiry.delete(organizationId);
  }

  /**
   * Clears all cache (useful for testing or memory management)
   */
  static clearAllCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Finds thumbnail tokens in a single automation action
   */
  private static findThumbnailTokensInAction(action: AutomationAction): string[] {
    const foundTokens: string[] = [];
    
    // Convert action params to string for pattern matching
    const actionParamsStr = JSON.stringify(action.params);
    
    // Search for each thumbnail token pattern
    for (const pattern of THUMBNAIL_TOKEN_PATTERNS) {
      const matches = actionParamsStr.match(pattern);
      if (matches) {
        foundTokens.push(...matches);
      }
    }

    return foundTokens;
  }

  /**
   * Checks if any automation in an organization requires thumbnails
   * Uses cache if available, otherwise analyzes fresh
   */
  static async organizationRequiresThumbnails(
    organizationId: string,
    automations: Array<{ id: string; config: AutomationConfig }>
  ): Promise<boolean> {
    // Try cache first
    const cached = this.getCachedRequirements(organizationId);
    if (cached) {
      return cached.requiresThumbnail;
    }

    // Analyze fresh
    const requirements = this.analyzeOrganizationAutomations(organizationId, automations);
    return requirements.requiresThumbnail;
  }

  /**
   * Gets thumbnail requirements for specific automations
   * Useful for processing only the automations that match an event
   */
  static getRequirementsForAutomations(
    organizationId: string,
    automationIds: string[]
  ): ThumbnailRequirement[] {
    const cached = this.getCachedRequirements(organizationId);
    if (!cached) {
      return [];
    }

    return cached.automations.filter(req => 
      automationIds.includes(req.automationId)
    );
  }
} 