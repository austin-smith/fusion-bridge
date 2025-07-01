'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building, MapPin, Loader2, MoreHorizontal, MoveRight } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import { useSession } from '@/lib/auth/client';
import { toast } from 'sonner';
import type { Organization } from '@/stores/store';
import type { Location } from '@/types';

interface OrganizationLocationsDialogProps {
  organization: Organization | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrganizationLocationsDialog({
  organization,
  open,
  onOpenChange,
}: OrganizationLocationsDialogProps) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
  const { data: session } = useSession();
  
  const isAdmin = (session?.user as any)?.role === 'admin';

  useEffect(() => {
    if (open && organization) {
      // Set active organization and then fetch locations
      setIsLoading(true);
      authClient.organization.setActive({ 
        organizationId: organization.id 
      }).then(() => {
        // Now fetch locations for the active organization
        return fetch('/api/locations');
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setLocations(data.data);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
      
      // If admin, also fetch all organizations for move dropdown
      if (isAdmin) {
        authClient.organization.list()
          .then(result => {
            if (result?.data) {
              setAllOrganizations(result.data.filter(org => org.id !== organization.id));
            }
          })
          .catch(console.error);
      }
    }
  }, [open, organization, isAdmin]);

  const handleMoveLocation = async (locationId: string, targetOrgId: string) => {
    try {
      const response = await fetch(`/api/locations/${locationId}/organization`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: targetOrgId }),
      });
      
      if (response.ok) {
        toast.success('Location moved successfully');
        // Refresh locations
        const data = await fetch('/api/locations').then(res => res.json());
        if (data.success) {
          setLocations(data.data);
        }
      } else {
        toast.error('Failed to move location');
      }
    } catch (error) {
      console.error('Error moving location:', error);
      toast.error('Failed to move location');
    }
  };

  if (!organization) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Locations</DialogTitle>
          <DialogDescription>
            Locations belonging to {organization.name}
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : locations.length > 0 ? (
            <div className="space-y-2">
              {locations.map((location) => (
                <div
                  key={location.id}
                  className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{location.name}</span>
                  </div>
                  {isAdmin && allOrganizations.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                          Move to organization:
                        </DropdownMenuItem>
                        {allOrganizations.map((org) => (
                          <DropdownMenuItem
                            key={org.id}
                            onSelect={() => handleMoveLocation(location.id, org.id)}
                          >
                            <MoveRight className="mr-2 h-4 w-4" />
                            {org.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No locations found</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 