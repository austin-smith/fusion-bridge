'use client'; // Add this directive for client-side interactivity

import React from 'react'; // Removed useState
import Link from 'next/link'; // Import next/link
import { usePathname } from 'next/navigation'; // Import usePathname
import { Button } from '@/components/ui/button'; // Import shadcn Button
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip" // Import Tooltip components
import { cn } from '@/lib/utils'; // Import cn utility
import { FiChevronsLeft, FiChevronsRight, FiActivity } from 'react-icons/fi'; // Example icons, removed Sun and Moon
import { Plug, Cpu, Terminal, Workflow } from 'lucide-react'; // Import new icons

// Define props interface
interface NavMenuProps {
  isCollapsed: boolean;
  toggleCollapse: () => void;
}

// Define widths for reuse
export const collapsedNavWidth = 'w-[70px]'; // Slightly narrower collapsed width
export const expandedNavWidth = 'w-[240px]'; // Slightly narrower expanded width

const navItems = [
  { href: '/connectors', label: 'Connectors', icon: Plug },
  { href: '/devices', label: 'Devices', icon: Cpu },
  { href: '/events', label: 'Events', icon: FiActivity },
  { href: '/automations', label: 'Automations', icon: Workflow },
  { href: '/system-logs', label: 'Console', icon: Terminal },
];

// Update component signature to accept props
const NavMenu: React.FC<NavMenuProps> = ({ isCollapsed, toggleCollapse }) => {
  const pathname = usePathname(); // Get current path

  const isActive = (href: string) => pathname === href;

  return (
    <TooltipProvider delayDuration={0}>
      <nav
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen flex-col border-r bg-background transition-all duration-300 ease-in-out',
          isCollapsed ? collapsedNavWidth : expandedNavWidth
        )}
      >
        {/* Header section */}
        <div className={cn('flex h-[60px] items-center border-b px-2', isCollapsed ? 'justify-center' : 'justify-end')}>
          <Button variant="ghost" size="icon" onClick={toggleCollapse} className="h-8 w-8">
            {isCollapsed ? <FiChevronsRight className="h-4 w-4" /> : <FiChevronsLeft className="h-4 w-4" />}
            <span className="sr-only">Toggle Navigation</span>
          </Button>
        </div>

        {/* Menu List */}
        <div className="flex flex-1 flex-col items-start gap-1 overflow-y-auto overflow-x-hidden py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const linkContent = (
              <Link href={item.href} className="flex items-center w-full">
                <Icon className={cn('h-5 w-5 flex-shrink-0', isCollapsed ? 'mx-auto' : 'mr-3')} />
                <span className={cn('truncate', isCollapsed ? 'sr-only' : '')}>{item.label}</span>
              </Link>
            );
            const buttonClasses = cn(
                'flex h-9 items-center justify-start gap-3 rounded-md text-sm font-medium',
                isCollapsed ? 'w-9 px-0 mx-auto' : 'mx-2 px-3' // Adjusted sizes/padding
            );

            const navButton = (
                <Button
                  key={item.href} // Key on the button
                  asChild
                  variant={isActive(item.href) ? 'secondary' : 'ghost'}
                  className={buttonClasses}
                >
                  {linkContent}
                </Button>
            );

            return isCollapsed ? (
              <Tooltip key={`${item.href}-tooltip`}> {/* Key on the Tooltip when collapsed */}
                <TooltipTrigger asChild>
                    {navButton}
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={5}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            ) : (
              navButton // Render button directly when expanded
            );
          })}
        </div>

         {/* Footer Section in Nav */}
         <div className="mt-auto border-t p-2">
         </div>
      </nav>
    </TooltipProvider>
  );
};

export default NavMenu; 