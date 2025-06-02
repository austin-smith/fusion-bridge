'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Clock, UserCircle2, ShieldCheck, Crown } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { User as UserType } from '@/lib/actions/user-actions';
import { OrganizationLogoDisplay } from '@/components/features/organizations/organization-logo-selector';

interface UserOrganizationsDialogProps {
  user: UserType;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface OrganizationMembership {
  membership: {
    id: string;
    role: string;
    createdAt: Date | string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
    createdAt: Date | string;
  };
}

interface UserOrganizationsData {
  user: {
    id: string;
    name: string | null;
    email: string;
  };
  organizations: OrganizationMembership[];
}

function RoleBadge({ role }: { role: string }) {
  const getRoleIcon = (role: string) => {
    switch (role.toLowerCase()) {
      case 'owner':
        return Crown;
      case 'admin':
        return ShieldCheck;
      default:
        return UserCircle2;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'owner':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'admin':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const Icon = getRoleIcon(role);
  const colorClasses = getRoleColor(role);

  return (
    <Badge
      variant="outline"
      className={`${colorClasses} font-medium`}
    >
      <Icon className="w-3 h-3 mr-1" />
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </Badge>
  );
}

export function UserOrganizationsDialog({
  user,
  isOpen,
  onOpenChange,
}: UserOrganizationsDialogProps) {
  const [data, setData] = useState<UserOrganizationsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserOrganizations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/users/${user.id}/organizations`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch user organizations');
      }

      setData(result.data);
    } catch (err: any) {
      console.error('Error fetching user organizations:', err);
      const errorMessage = err.message || 'Failed to load organizations';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    if (isOpen && user.id) {
      fetchUserOrganizations();
    }
  }, [isOpen, user.id, fetchUserOrganizations]);

  const handleClose = () => {
    onOpenChange(false);
    // Clear data when closing to ensure fresh data on next open
    setData(null);
    setError(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Building2 className="h-5 w-5" />
            Organization Memberships
          </DialogTitle>
          <DialogDescription>
            Organizations that <strong>{user.name || user.email}</strong> belongs to
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                  <Skeleton className="h-10 w-10 rounded-md" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <div className="text-muted-foreground mb-2">
                Failed to load organizations
              </div>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {!isLoading && !error && data && (
            <>
              {data.organizations.length === 0 ? (
                <div className="text-center py-8">
                  <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <div className="text-muted-foreground mb-2">
                    No organization memberships
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This user is not a member of any organizations.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.organizations.map((item) => {
                    const joinedDate = typeof item.membership.createdAt === 'string' 
                      ? new Date(item.membership.createdAt) 
                      : item.membership.createdAt;
                    
                    return (
                      <div
                        key={item.membership.id}
                        className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-shrink-0">
                          <OrganizationLogoDisplay
                            logo={item.organization.logo}
                            className="h-10 w-10 rounded-md"
                            size="default"
                          />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium truncate">
                              {item.organization.name}
                            </h4>
                            <RoleBadge role={item.membership.role} />
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>/{item.organization.slug}</span>
                            <span>•</span>
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>Joined {format(joinedDate, 'MMM d, yyyy')}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {data.organizations.length > 0 && (
                <div className="text-center text-sm text-muted-foreground pt-2 border-t">
                  {data.organizations.length} organization{data.organizations.length !== 1 ? 's' : ''} total
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 