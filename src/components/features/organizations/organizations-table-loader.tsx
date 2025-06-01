'use client';

import React, { useEffect } from 'react';
import { useFusionStore } from '@/stores/store';
import { OrganizationsTable, OrganizationsTableSkeleton } from './organizations-table';

export function OrganizationsTableLoader() {
  const { 
    organizations, 
    isLoadingOrganizations, 
    errorOrganizations, 
    fetchOrganizations 
  } = useFusionStore();

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  if (isLoadingOrganizations) {
    return <OrganizationsTableSkeleton />;
  }

  if (errorOrganizations) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">Error loading organizations: {errorOrganizations}</p>
        <button 
          onClick={() => fetchOrganizations()} 
          className="mt-2 text-sm text-muted-foreground hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return <OrganizationsTable data={organizations} />;
} 