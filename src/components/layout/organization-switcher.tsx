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
import { type Organization } from '@/stores/store';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { toast } from 'sonner';
import { OrganizationLogoDisplay } from '@/components/features/organizations/organization-logo-selector';
import { Badge } from '@/components/ui/badge';
import { useActiveOrganization, useUserOrganizations } from '@/hooks/use-organization';

export function OrganizationSwitcher() {
  const { isMobile } = useSidebar();
  const router = useRouter();
  
  // Use Better Auth hooks for organization management
  const { data: activeOrganization, isPending: isLoadingActiveOrg } = useActiveOrganization();
  const { data: organizations, isPending: isLoadingOrganizations } = useUserOrganizations();
  
  const [isSwitching, setIsSwitching] = React.useState(false);
  const [hasMounted, setHasMounted] = React.useState(false);

  // Prevent hydration mismatch by only rendering dynamic content after mount
  React.useEffect(() => {
    setHasMounted(true);
  }, []);



  const handleOrganizationSwitch = React.useCallback(async (organization: Organization) => {
    if (organization.id === activeOrganization?.id) return;
    
    setIsSwitching(true);
    try {
      // Use Better Auth's setActive method - OrganizationBridge handles store sync
      const result = await authClient.organization.setActive({
        organizationId: organization.id
      });
      
      if (result.error) {
        throw new Error(result.error.message || 'Failed to switch organization');
      }
      
      toast.success(`Switched to ${organization.name}`);
      
    } catch (error) {
      console.error('Error switching organization:', error);
      const message = error instanceof Error ? error.message : 'Failed to switch organization';
      toast.error(message);
    } finally {
      setIsSwitching(false);
    }
  }, [activeOrganization?.id]);



  // Consolidate loading state logic
  const isLoading = React.useMemo(() => {
    // Always show loading state until mounted (prevents hydration mismatch)
    if (!hasMounted) {
      return true;
    }
    
    // Don't show loading if we're just switching organizations
    if (isSwitching && organizations && organizations.length > 0) {
      return false;
    }
    
    // Show loading during auth check or organization fetch
    return isLoadingActiveOrg || (isLoadingOrganizations && (!organizations || organizations.length === 0));
  }, [hasMounted, isLoadingActiveOrg, isLoadingOrganizations, organizations, isSwitching]);

  // Sort organizations alphabetically by name for consistent display
  const sortedOrganizations = React.useMemo(() => {
    if (!organizations) return [];
    return [...organizations].sort((a, b) => a.name.localeCompare(b.name));
  }, [organizations]);

  // Show loading state
  if (isLoading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            disabled
            className="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-muted">
              <Building2 className="size-4 text-muted-foreground" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-semibold text-muted-foreground">
                Loading...
              </span>
              <span className="truncate text-xs text-muted-foreground">
                Please wait
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  // Show "no organizations" state
  if (!organizations || organizations.length === 0) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            disabled
            className="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-muted">
              <Building2 className="size-4 text-muted-foreground" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-semibold text-muted-foreground">
                No Organizations
              </span>
              <span className="truncate text-xs text-muted-foreground">
                Create one to get started
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  // Default to first organization (alphabetically) if none active
  const currentOrg = activeOrganization || sortedOrganizations[0];

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
                disabled={isSwitching}
              >
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <OrganizationLogoDisplay 
                    logo={currentOrg.logo} 
                    className="size-6 rounded" 
                    size="default"
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold">
                    {currentOrg.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {organizations?.length || 0} organization{(organizations?.length || 0) !== 1 ? 's' : ''}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              align="start"
              side={isMobile ? 'bottom' : 'right'}
              sideOffset={4}
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Organizations
              </DropdownMenuLabel>
              {sortedOrganizations.map((org, index) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => handleOrganizationSwitch(org)}
                  className="gap-2 p-2"
                  disabled={isSwitching}
                >
                  <div className="flex size-6 items-center justify-center rounded-sm border">
                    <OrganizationLogoDisplay 
                      logo={org.logo} 
                      className="size-4 rounded" 
                      size="sm"
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{org.name}</span>
                    <span className="text-xs text-muted-foreground">/{org.slug}</span>
                  </div>
                  {org.id === currentOrg.id && (
                    <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                      Current
                    </Badge>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="gap-2 p-2"
                onClick={() => router.push('/organizations')}
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