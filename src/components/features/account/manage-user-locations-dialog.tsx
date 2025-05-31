'use client';

import React, { useState, useEffect, useActionState } from 'react';
import { MapPin, Loader2, Building, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from 'sonner';
import { assignUserLocations, getUserLocations } from '@/lib/actions/user-actions';
import type { User } from '@/lib/actions/user-actions';

interface Location {
  id: string;
  name: string;
  path: string;
  parentId?: string | null;
  addressStreet: string;
  addressCity: string;
  addressState: string;
}

interface ManageUserLocationsDialogProps {
  user: User;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const initialState = {
  success: false,
  message: undefined,
};

export function ManageUserLocationsDialog({ 
  user, 
  isOpen, 
  onOpenChange, 
  onSuccess 
}: ManageUserLocationsDialogProps) {
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [userLocationIds, setUserLocationIds] = useState<string[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [isLoadingUserLocations, setIsLoadingUserLocations] = useState(false);
  const [hasAllAccess, setHasAllAccess] = useState(false);
  
  const [state, formAction, isPending] = useActionState(assignUserLocations, initialState);

  // Fetch all locations when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchAllLocations();
      fetchUserLocations();
    }
  }, [isOpen, user.id]);

  // Handle form submission result
  useEffect(() => {
    if (state.success && state.message) {
      toast.success(state.message);
      onSuccess?.();
      onOpenChange(false);
    } else if (!state.success && state.message) {
      toast.error(state.message);
    }
  }, [state, onSuccess, onOpenChange]);

  const fetchAllLocations = async () => {
    setIsLoadingLocations(true);
    try {
      const response = await fetch('/api/locations');
      if (!response.ok) {
        throw new Error(`Failed to fetch locations: ${response.status}`);
      }
      const data = await response.json();
      const locations = Array.isArray(data.data) ? data.data : [];
      
      // Sort locations alphabetically by name
      const sortedLocations = locations.sort((a: Location, b: Location) => 
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );
      
      setAllLocations(sortedLocations);
    } catch (error) {
      console.error('Error fetching locations:', error);
      toast.error('Failed to load locations');
      setAllLocations([]);
    } finally {
      setIsLoadingLocations(false);
    }
  };

  const fetchUserLocations = async () => {
    setIsLoadingUserLocations(true);
    try {
      const result = await getUserLocations(user.id);
      const locationIds = result.locations.map(loc => loc.id);
      setUserLocationIds(locationIds);
      
      // Empty array means access to all locations
      const hasAll = locationIds.length === 0;
      setHasAllAccess(hasAll);
      
      // If user has all access, don't preselect any specific locations
      // If user has specific access, preselect those locations
      setSelectedLocationIds(hasAll ? [] : locationIds);
    } catch (error) {
      console.error('Error fetching user locations:', error);
      toast.error('Failed to load user locations');
      setUserLocationIds([]);
      setSelectedLocationIds([]);
      setHasAllAccess(false);
    } finally {
      setIsLoadingUserLocations(false);
    }
  };

  const handleLocationToggle = (locationId: string, checked: boolean) => {
    setSelectedLocationIds(prev => {
      if (checked) {
        return [...prev, locationId];
      } else {
        return prev.filter(id => id !== locationId);
      }
    });
  };

  const handleSelectAll = () => {
    setSelectedLocationIds(allLocations.map(loc => loc.id));
  };

  const handleSelectNone = () => {
    setSelectedLocationIds([]);
  };

  const handleGrantAllAccess = () => {
    // Grant access to all locations (empty array)
    setSelectedLocationIds([]);
  };

  const hasChanges = () => {
    const currentIsAllAccess = hasAllAccess;
    const newIsAllAccess = selectedLocationIds.length === 0;
    
    // If both states are "all access", no change
    if (currentIsAllAccess && newIsAllAccess) return false;
    
    // If changing from all access to specific access, or vice versa
    if (currentIsAllAccess !== newIsAllAccess) return true;
    
    // If both are specific access, compare the arrays
    if (selectedLocationIds.length !== userLocationIds.length) return true;
    return !selectedLocationIds.every(id => userLocationIds.includes(id));
  };

  const getLocationDisplayName = (location: Location) => {
    return `${location.name} (${location.addressCity}, ${location.addressState})`;
  };

  const getCurrentAccessDescription = () => {
    if (hasAllAccess) {
      return `Currently has access to ALL locations`;
    }
    return `Currently assigned to ${userLocationIds.length} location(s)`;
  };

  const getChangesDescription = () => {
    const newIsAllAccess = selectedLocationIds.length === 0;
    
    if (newIsAllAccess) {
      return "Will have access to ALL locations";
    }
    
    const changeCount = selectedLocationIds.length - userLocationIds.length;
    return `${selectedLocationIds.length} location(s) will be assigned (${changeCount > 0 ? '+' : ''}${changeCount} change)`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Manage Location Access
          </DialogTitle>
          <DialogDescription>
            Assign locations to <strong>{user.name || user.email}</strong>. 
            Leave empty to grant access to all locations.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4">
          {/* Current Assignments Summary */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building className="h-4 w-4" />
            <span>{getCurrentAccessDescription()}</span>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2">
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={handleGrantAllAccess}
              disabled={isLoadingLocations}
            >
              Grant All Access
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={handleSelectAll}
              disabled={isLoadingLocations || allLocations.length === 0}
            >
              Select All Specific
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={handleSelectNone}
              disabled={isLoadingLocations}
            >
              Select None
            </Button>
          </div>

          {/* Location List */}
          <ScrollArea className="flex-1 border rounded-md">
            <div className="p-4 space-y-3">
              {isLoadingLocations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading locations...</span>
                </div>
              ) : allLocations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Building className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No locations available</p>
                </div>
              ) : (
                allLocations.map((location) => (
                  <div key={location.id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50">
                    <Checkbox
                      id={`location-${location.id}`}
                      checked={selectedLocationIds.includes(location.id)}
                      onCheckedChange={(checked) => handleLocationToggle(location.id, !!checked)}
                      disabled={isPending || isLoadingUserLocations}
                    />
                    <label 
                      htmlFor={`location-${location.id}`}
                      className="flex-1 cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{getLocationDisplayName(location)}</p>
                          <p className="text-xs text-muted-foreground">{location.addressStreet}</p>
                        </div>
                        {userLocationIds.includes(location.id) && (
                          <Badge variant="secondary" className="ml-2">
                            <Check className="h-3 w-3 mr-1" />
                            Current
                          </Badge>
                        )}
                      </div>
                    </label>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Changes Summary */}
          {hasChanges() && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                {getChangesDescription()}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <form action={formAction}>
            <input type="hidden" name="userId" value={user.id} />
            {selectedLocationIds.map(locationId => (
              <input key={locationId} type="hidden" name="locationIds" value={locationId} />
            ))}
            <Button type="submit" disabled={isPending || !hasChanges() || isLoadingLocations || isLoadingUserLocations}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Updating...
                </>
              ) : (
                'Update Locations'
              )}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 