'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FloorPlanManager } from '@/components/features/locations/floor-plan';
import { useFusionStore } from '@/stores/store';
import { FloorPlanLoadingSkeleton } from '@/components/features/locations/floor-plan/floor-plan-loading-skeleton';

export default function LocationFloorPlansPage() {
  const params = useParams();
  const router = useRouter();
  const locationId = String(params?.id || '');
  const { locations, isLoadingLocations } = useFusionStore();
  const activeOrganizationId = useFusionStore((s) => s.activeOrganizationId);
  const locationName = locations.find((l) => l.id === locationId)?.name || locationId;
  const existsInOrg = React.useMemo(() => locations.some((l) => l.id === locationId), [locations, locationId]);

  // Redirect to /locations if current location is not available for the active org
  React.useEffect(() => {
    if (!locationId) return;
    // Wait until locations finished loading for the new org before deciding
    if (!isLoadingLocations && !existsInOrg) {
      router.replace('/locations');
    }
  }, [activeOrganizationId, locations, isLoadingLocations, existsInOrg, locationId, router]);

  if (!locationId) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Missing location id.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header handled by AppShell via page-config breadcrumbs */}

      {/* Editor area */}
      <div className="flex-1 p-4 min-h-0">
        {isLoadingLocations ? (
          <div className="h-full">
            <FloorPlanLoadingSkeleton />
          </div>
        ) : existsInOrg ? (
          <FloorPlanManager key={`${activeOrganizationId ?? ''}:${locationId}`} locationId={locationId} expectedToHaveFloorPlans className="h-full flex flex-col" />
        ) : null}
      </div>
    </div>
  );
}


