'use client';

import React from 'react';
import { useActiveOrganization } from '@/hooks/use-organization';
import { useFusionStore } from '@/stores/store';

/**
 * Hook that syncs Better Auth organization state to Zustand store
 * 
 * This hook:
 * 1. Uses Better Auth's useActiveOrganization hook to get session-based organization
 * 2. Syncs the active organization ID to the Zustand store 
 * 3. Triggers the store's data cascade when organization changes
 * 4. Always runs when called (regardless of UI state)
 */
export function useOrganizationSync() {
  const { data: activeOrganization, isPending } = useActiveOrganization();
  const setActiveOrganizationId = useFusionStore(state => state.setActiveOrganizationId);

  React.useEffect(() => {
    // Only sync when Better Auth has finished loading the session
    if (!isPending) {
      const orgId = activeOrganization?.id || null;
      setActiveOrganizationId(orgId); // This triggers the store's data cascade
    }
  }, [activeOrganization?.id, isPending, setActiveOrganizationId]);
}