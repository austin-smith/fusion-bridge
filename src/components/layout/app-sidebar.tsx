'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { LogOut, Loader2, User, Settings, ChevronsUpDown, Users, Plug, Cpu, Terminal, Workflow, Building, ShieldAlert, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FiActivity } from 'react-icons/fi';
import FusionIcon from '@/components/icons/FusionIcon';
import { useSession, signOut } from '@/lib/auth/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useFusionStore, UserProfile } from '@/stores/store';
import { AuthContext } from '@/components/layout/client-providers';
import { OrganizationSwitcher } from '@/components/layout/organization-switcher';

// --- Define Navigation Groups ---
type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
};

type NavGroup = {
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    items: [
      { href: '/connectors', label: 'Connectors', icon: Plug },
      { href: '/devices', label: 'Devices', icon: Cpu },
      { href: '/locations-areas', label: 'Locations & Areas', icon: Building },
    ]
  },
  {
    items: [
      { href: '/alarm/schedules', label: 'Alarm Schedules', icon: CalendarClock },
      { href: '/alarm/alarms', label: 'Active Alarms', icon: ShieldAlert },
    ]
  },
  {
    items: [
      { href: '/events', label: 'Events', icon: FiActivity },
      { href: '/automations', label: 'Automations', icon: Workflow },
    ]
  },
  {
    items: [
      { href: '/users', label: 'Users', icon: Users },
      { href: '/system-logs', label: 'Console', icon: Terminal },
      { href: '/settings', label: 'Settings', icon: Settings },
    ]
  }
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => pathname === href;
  const { data: session, isPending } = useSession();
  const { initialUserRole } = React.useContext(AuthContext);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  // Get setter and currentUser from Zustand
  const { setCurrentUser, currentUser } = useFusionStore();
  const { isMobile, setOpenMobile, state } = useSidebar();

  // Determine user role from session
  const userRole = (session?.user as any)?.role; // Access role, might be undefined

  // Effect to populate Zustand store from useSession data on initial load only
  useEffect(() => {
    if (session?.user && !currentUser) {
        const userProfile: UserProfile = {
            id: session.user.id,
            name: session.user.name ?? null,
            email: session.user.email ?? null,
            image: session.user.image ?? null,
            twoFactorEnabled: (session.user as any).twoFactorEnabled ?? false,
        };
        setCurrentUser(userProfile);
    }
  }, [session, setCurrentUser, currentUser]);

  // Filter navGroups based on user role
  const displayedNavGroups = useMemo(() => {
    return navGroups;
    // Remove the expensive filtering operation that causes menu flicker
    // The visibility will be handled with CSS conditionally in the rendering
  }, []); // Empty dependency array since navGroups is static

  // Helper function to determine if an admin-only item should be shown
  const canViewAdminItem = (): boolean => {
    // Explicitly get userRole from session within the function scope for clarity
    const currentDynamicUserRole = (session?.user as any)?.role;
    if (initialUserRole === 'admin') {
      return true;
    }
    // Check dynamic role from session if initialRole is not admin
    if (!isPending && session?.user && currentDynamicUserRole === 'admin') {
      return true;
    }
    return false; // Default to false if no admin conditions are met
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut({
        fetchOptions: {
          onSuccess: () => {
            setCurrentUser(null); // Clear user state on logout
            router.push('/login');
          },
          onError: (err) => {
             console.error("Logout API call failed:", err);
             setIsLoggingOut(false);
          }
        }
      });
    } catch (error) {
      console.error("Error initiating logout:", error);
      setIsLoggingOut(false);
    }
  };

  // --- Render sidebar frame immediately --- 
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex h-[60px] items-center justify-center border-b">
        <Link href="/" className="inline-block">
          <div className={cn(
              "flex items-start gap-2 font-bold text-xl py-1",
              "group-data-[collapsible=icon]:justify-center"
          )}>
             <FusionIcon className="h-6 w-6 text-primary" />
             <span className="font-csg group-data-[collapsible=icon]:hidden">FUSION</span>
          </div>
        </Link>
      </SidebarHeader>
      
      <SidebarContent className="flex-grow">
        {/* Organization Switcher */}
        <div className="p-2 border-b">
          <OrganizationSwitcher />
        </div>
        
         {/* Render nav groups immediately - assuming navGroups is static */}
          {displayedNavGroups.map((group, groupIndex) => (
            <React.Fragment key={`group-fragment-${groupIndex}`}>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      
                      // Determine if the item should be shown based on role
                      let showItem = true; // Default to true
                      if (item.label === 'Users' || item.label === 'Settings') {
                        showItem = canViewAdminItem();
                      }
                      
                      // Skip rendering completely if item shouldn't be shown
                      if (!showItem) {
                        return null;
                      }
                      
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            asChild
                            data-active={active}
                            className={cn(
                              "w-full justify-start",
                              "group-data-[collapsible=icon]:justify-center",
                              active && "bg-sidebar-accent text-sidebar-accent-foreground"
                            )}
                            tooltip={item.label}
                          >
                            <Link
                              href={item.href}
                              onClick={() => {
                                if (isMobile) {
                                  setOpenMobile(false);
                                }
                              }}
                            >
                              <Icon className="mr-2 h-5 w-5 flex-shrink-0 group-data-[collapsible=icon]:mr-0" />
                              <span className="truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
              {groupIndex < displayedNavGroups.length - 1 && (
                  <Separator className="w-[80%] mx-auto" />
              )}
            </React.Fragment>
          ))
        }
      </SidebarContent>

      {/* --- Footer: Render structure immediately, adapt content smoothly --- */}
      <SidebarFooter className="mt-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "flex w-full items-center justify-start gap-2",
                "min-h-14",
                "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:min-h-0",
                "group-data-[collapsible=expanded]:px-2",
                // Apply open state styles only if user exists (from store) and not loading (from session)
                (!isPending && currentUser) && "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
                "transition-all duration-200 ease-linear"
              )}
              aria-label="User menu"
              // Disable button if loading (from session) or no user (from store)
              disabled={isPending || !currentUser}
            >
              <div className={cn("flex h-full w-full items-center gap-2")}>
                {/* Avatar: Always render, conditionally populate */}
                <Avatar className={cn(
                  "size-7 flex-shrink-0",
                  "group-data-[collapsible=icon]:size-8",
                  // Muted background if loading or no user
                  (isPending || !currentUser) && "bg-muted"
                )}>
                   {/* Only add image/fallback if not pending and currentUser exists */}
                  {!isPending && currentUser && (
                    <>
                      <AvatarImage src={currentUser.image || ''} alt={currentUser.name || 'User'} className="object-cover" />
                      <AvatarFallback>{currentUser.name?.charAt(0).toUpperCase() || currentUser.email?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
                    </>
                  )}
                  {/* If pending or no user, the default Avatar background/fallback will show, potentially enhanced by the bg-muted above */}
                </Avatar>

                {/* Text Section (Hidden when collapsed): Adapt content based on state */}
                <div className="flex flex-1 items-center justify-between group-data-[collapsible=icon]:hidden">
                  {isPending ? (
                    // Placeholder text appearance during loading
                    <div className="flex flex-col items-start gap-1.5">
                      <div className="h-4 w-20 rounded bg-muted/50" />
                      <div className="h-3 w-24 rounded bg-muted/50" />
                    </div>
                  ) : currentUser ? (
                    // Actual user info when loaded (from store)
                    <>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate text-sm font-semibold">{currentUser.name || currentUser.email?.split('@')[0] || 'User'}</span>
                        <span className="truncate text-xs text-muted-foreground">{currentUser.email}</span>
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    </>
                  ) : (
                    // Muted placeholder text when logged out (or simply nothing)
                    <div className="flex flex-col items-start gap-1.5">
                       <div className="h-4 w-20 rounded bg-muted/50" />
                       <div className="h-3 w-24 rounded bg-muted/50" />
                    </div>
                  )}
                </div>
              </div>
            </Button>
          </DropdownMenuTrigger>

          {/* Dropdown Content - Only render content if not pending (from session) and currentUser exists (from store) */}
          {!isPending && currentUser && (
            <DropdownMenuContent
              side={isMobile ? 'bottom' : 'right'}
              align="end"
              sideOffset={4}
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            >
              <DropdownMenuLabel className="font-normal">
                 <div className="flex items-center gap-3">
                   <Avatar className="h-8 w-8">
                     <AvatarImage src={currentUser.image || ''} alt={currentUser.name || 'User'} />
                     <AvatarFallback>{currentUser.name?.charAt(0).toUpperCase() || currentUser.email?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
                   </Avatar>
                   <div className="flex flex-col space-y-1">
                     <p className="text-sm font-medium leading-none truncate max-w-[150px]">{currentUser.name || currentUser.email?.split('@')[0] || 'User'}</p>
                     <p className="text-xs leading-none text-muted-foreground truncate max-w-[150px]">
                       {currentUser.email}
                     </p>
                   </div>
                 </div>
               </DropdownMenuLabel>
               <DropdownMenuSeparator />
               <DropdownMenuItem onClick={() => router.push('/account/settings')} className="cursor-pointer">
                 <Settings className="mr-2 h-4 w-4" />
                 <span>Account Settings</span>
               </DropdownMenuItem>
               <DropdownMenuSeparator />
               <DropdownMenuItem onClick={handleLogout} disabled={isLoggingOut}>
                 {isLoggingOut ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4 mr-2" />
                  )}
                 <span>Logout</span>
               </DropdownMenuItem>
            </DropdownMenuContent>
          )}
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
} 