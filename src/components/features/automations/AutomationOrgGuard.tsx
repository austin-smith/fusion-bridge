'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useFusionStore } from '@/stores/store';

/**
 * Redirects to /automations when the active organization changes while viewing
 * a specific automation. Prevents showing stale data from a different org.
 */
export function AutomationOrgGuard() {
  const router = useRouter();
  const activeOrganizationId = useFusionStore((s) => s.activeOrganizationId);
  const prevOrgRef = React.useRef<string | null | undefined>(activeOrganizationId);

  React.useEffect(() => {
    if (prevOrgRef.current !== undefined && prevOrgRef.current !== activeOrganizationId) {
      router.replace('/automations');
    }
    prevOrgRef.current = activeOrganizationId;
  }, [activeOrganizationId, router]);

  return null;
}