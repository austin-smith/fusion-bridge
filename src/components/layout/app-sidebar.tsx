'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { FiActivity } from 'react-icons/fi';
import { Plug, Cpu, Terminal, Workflow, Network, Building } from 'lucide-react';
import FusionIcon from '@/components/icons/FusionIcon';

// Define nav items (copied from old NavMenu)
const navItems = [
  { href: '/connectors', label: 'Connectors', icon: Plug },
  { href: '/devices', label: 'Devices', icon: Cpu },
  { href: '/locations-areas', label: 'Locations & Areas', icon: Building },
  { href: '/events', label: 'Events', icon: FiActivity },
  { href: '/automations', label: 'Automations', icon: Workflow },
  { href: '/system-logs', label: 'Console', icon: Terminal },
];

export function AppSidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex h-[60px] items-center justify-center border-b">
        <div className="flex items-center gap-2 font-bold text-xl">
           <FusionIcon className="h-6 w-6 text-primary" />
           <span className="font-csg group-data-[collapsible=icon]:hidden">FUSION</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      data-active={active}
                      className={cn(
                        "w-full justify-start",
                        active && "bg-sidebar-accent text-sidebar-accent-foreground"
                      )}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <Icon className="mr-2 h-5 w-5 flex-shrink-0 group-data-[collapsible=icon]:mr-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {/* Placeholder for footer content */}
      </SidebarFooter>
    </Sidebar>
  );
} 