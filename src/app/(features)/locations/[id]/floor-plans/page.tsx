'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FloorPlanManager } from '@/components/features/locations/floor-plan';
import { useFusionStore } from '@/stores/store';

export default function LocationFloorPlansPage() {
  const params = useParams();
  const router = useRouter();
  const locationId = String(params?.id || '');
  const { locations } = useFusionStore();
  const locationName = locations.find((l) => l.id === locationId)?.name || locationId;

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
        <FloorPlanManager locationId={locationId} expectedToHaveFloorPlans className="h-full flex flex-col" />
      </div>
    </div>
  );
}


