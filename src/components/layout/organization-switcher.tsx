'use client';

import * as React from 'react';
import { ChevronsUpDown, Plus, Building2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useFusionStore, type Organization } from '@/stores/store';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { toast } from 'sonner';

export function OrganizationSwitcher() {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const { 
    organizations, 
    fetchOrganizations,
    isLoadingOrganizations 
  } = useFusionStore();

  const [isSwitching, setIsSwitching] = React.useState(false);
  const [hasMounted, setHasMounted] = React.useState(false);

  // Use Better Auth's useActiveOrganization hook
  const { data: activeOrganization, isPending: isLoadingActiveOrg } = authClient.useActiveOrganization();

  // Prevent hydration mismatch by only rendering after mount
  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  // Load organizations on mount
  React.useEffect(() => {
    if (organizations.length === 0 && !isLoadingOrganizations) {
      fetchOrganizations();
    }
  }, [organizations.length, isLoadingOrganizations, fetchOrganizations]);

  const handleOrganizationSwitch = async (organization: Organization) => {
    if (organization.id === activeOrganization?.id) return;
    
    setIsSwitching(true);
    try {
      // Use Better Auth's setActive method with proper session management
      const result = await authClient.organization.setActive({
        organizationId: organization.id
      });
      
      if (result.error) {
        throw new Error(result.error.message || 'Failed to switch organization');
      }
      
      toast.success(`Switched to ${organization.name}`);
      
      // Refresh the page to reload organization-scoped data
      router.refresh();
      
    } catch (error) {
      console.error('Error switching organization:', error);
      const message = error instanceof Error ? error.message : 'Failed to switch organization';
      toast.error(message);
    } finally {
      setIsSwitching(false);
    }
  };

  // Show loading state until mounted and data is loaded
  if (!hasMounted || isLoadingOrganizations || isLoadingActiveOrg || organizations.length === 0) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-muted">
              <Building2 className="size-4 text-muted-foreground" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold text-muted-foreground">
                {!hasMounted || isLoadingOrganizations || isLoadingActiveOrg ? 'Loading...' : 'No Organizations'}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {!hasMounted || isLoadingOrganizations || isLoadingActiveOrg ? 'Please wait' : 'Create one to get started'}
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  // Default to first organization if none active
  const currentOrg = activeOrganization || organizations[0];

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                disabled={isSwitching}
              >
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  {currentOrg.logo ? (
                    <img 
                      src={currentOrg.logo} 
                      alt={`${currentOrg.name} logo`}
                      className="size-6 rounded object-cover"
                    />
                  ) : (
                    <Building2 className="size-4" />
                  )}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {currentOrg.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {organizations.length} organization{organizations.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
              align="start"
              side={isMobile ? 'bottom' : 'right'}
              sideOffset={4}
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Organizations
              </DropdownMenuLabel>
              {organizations.map((org, index) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => handleOrganizationSwitch(org)}
                  className="gap-2 p-2"
                  disabled={isSwitching}
                >
                  <div className="flex size-6 items-center justify-center rounded-sm border">
                    {org.logo ? (
                      <img 
                        src={org.logo} 
                        alt={`${org.name} logo`}
                        className="size-4 rounded object-cover"
                      />
                    ) : (
                      <Building2 className="size-4 shrink-0" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{org.name}</span>
                    <span className="text-xs text-muted-foreground">/{org.slug}</span>
                  </div>
                  {org.id === currentOrg.id && (
                    <span className="ml-auto text-xs text-muted-foreground">current</span>
                  )}
                  <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="gap-2 p-2"
                onClick={() => router.push('/admin/organizations')}
              >
                <div className="bg-background flex size-6 items-center justify-center rounded-md border">
                  <Plus className="size-4" />
                </div>
                <div className="text-muted-foreground font-medium">Create organization</div>
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="gap-2 p-2"
                onClick={() => router.push('/admin/organizations')}
              >
                <div className="bg-background flex size-6 items-center justify-center rounded-md border">
                  <Building2 className="size-4" />
                </div>
                <div className="text-muted-foreground font-medium">Manage organizations</div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
} 