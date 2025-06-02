import { authClient } from '@/lib/auth/client';

/**
 * Client-side hook to get the active organization
 */
export function useActiveOrganization() {
  return authClient.useActiveOrganization();
}

/**
 * Client-side hook to get the active organization ID
 */
export function useActiveOrganizationId(): string | null {
  const { data: activeOrganization } = authClient.useActiveOrganization();
  return activeOrganization?.id || null;
}

/**
 * Client-side hook to get all user organizations
 */
export function useUserOrganizations() {
  return authClient.useListOrganizations();
} 