import { Activity, Plug, Cpu, Building, Shield, ShieldAlert, Workflow, Users, Terminal, Settings, User, FileText, BarChart3, Map, MonitorPlay } from 'lucide-react';
import { FiActivity } from 'react-icons/fi';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  isCurrentPage?: boolean;
}

export enum NavGroup {
  RESOURCES = 'resources',
  ALARM = 'alarm', 
  ACTIVITY = 'activity',
  INFORMATION = 'information',
  ADMIN = 'admin'
}

export interface PageConfig {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  breadcrumbs: BreadcrumbItem[];
  isNavItem?: boolean; // Whether this appears in sidebar navigation
  navGroup?: NavGroup; // Which navigation group this belongs to
  badge?: string; // Optional badge text (e.g., "Beta", "New")
}

// Comprehensive page configuration - single source of truth for ALL pages
export const PAGE_CONFIG: Record<string, PageConfig> = {
  // Main navigation pages
  '/connectors': {
    title: 'Connectors',
    icon: Plug,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Connectors', isCurrentPage: true }
    ],
    isNavItem: true,
    navGroup: NavGroup.RESOURCES
  },
  '/devices': {
    title: 'Devices',
    icon: Cpu,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Devices', isCurrentPage: true }
    ],
    isNavItem: true,
    navGroup: NavGroup.RESOURCES
  },
  '/locations': {
    title: 'Locations & Spaces',
    icon: Building,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Locations & Spaces', isCurrentPage: true }
    ],
    isNavItem: true,
    navGroup: NavGroup.RESOURCES
  },
  '/alarm-zones': {
    title: 'Alarm Zones',
    icon: Shield,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Alarm Zones', isCurrentPage: true }
    ],
    isNavItem: true,
    navGroup: NavGroup.ALARM
  },
  '/alarm/alarms': {
    title: 'Active Alarms',
    icon: ShieldAlert,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Active Alarms', isCurrentPage: true }
    ],
    isNavItem: true,
    navGroup: NavGroup.ALARM
  },
  '/events': {
    title: 'Events',
    icon: FiActivity,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Events', isCurrentPage: true }
    ],
    isNavItem: true,
    navGroup: NavGroup.ACTIVITY
  },
  '/play': {
    title: 'Play',
    icon: MonitorPlay,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Play', isCurrentPage: true }
    ],
    isNavItem: true,
    navGroup: NavGroup.ACTIVITY
  },
  '/automations': {
    title: 'Automations',
    icon: Workflow,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Automations', isCurrentPage: true }
    ],
    isNavItem: true,
    navGroup: NavGroup.ACTIVITY
  },
  '/reports': {
    title: 'Reports',
    icon: BarChart3,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Reports', isCurrentPage: true }
    ],
    isNavItem: true,
    navGroup: NavGroup.ACTIVITY,
    badge: 'New'
  },
  '/users': {
    title: 'Users',
    icon: Users,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Users', isCurrentPage: true }
    ],
    isNavItem: true,
    navGroup: NavGroup.ADMIN
  },
  '/system-logs': {
    title: 'Console',
    icon: Terminal,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Console', isCurrentPage: true }
    ],
    isNavItem: true,
    navGroup: NavGroup.ADMIN
  },
  '/settings': {
    title: 'Settings',
    icon: Settings,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Settings', isCurrentPage: true }
    ],
    isNavItem: true,
    navGroup: NavGroup.ADMIN
  },
  '/roadmap': {
    title: 'Roadmap',
    icon: Map,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Roadmap', isCurrentPage: true }
    ],
    isNavItem: true,
    navGroup: NavGroup.INFORMATION,
    badge: 'New'
  },

  // Detail and sub-pages
  '/locations/[id]/floor-plans': {
    title: 'Floor Plans',
    icon: Map,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Locations & Spaces', href: '/locations' },
      { label: 'Floor Plans', isCurrentPage: true }
    ]
  },
  '/account/settings': {
    title: 'Account Settings',
    icon: User,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Account Settings', isCurrentPage: true }
    ]
  },
  '/events/timeline': {
    title: 'Event Timeline',
    icon: FiActivity,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Events', href: '/events' },
      { label: 'Timeline', isCurrentPage: true }
    ]
  },

  // Admin pages
  '/organizations': {
    title: 'Organizations',
    icon: Building,
    breadcrumbs: [
      { label: 'Home', href: '/' },
      { label: 'Organizations', isCurrentPage: true }
    ]
  },

};

// Dynamic route handlers for parameterized routes
export const DYNAMIC_ROUTE_HANDLERS: Array<{
  pattern: RegExp;
  handler: (pathname: string, matches: RegExpMatchArray) => PageConfig | null;
}> = [
  {
    pattern: /^\/locations\/([^\/]+)\/floor-plans(?:\/.*)?$/,
    handler: (pathname, matches) => ({
      title: 'Floor Plans',
      icon: Map,
      breadcrumbs: [
        { label: 'Home', href: '/' },
        { label: 'Locations & Spaces', href: '/locations' },
        { label: 'Floor Plans', isCurrentPage: true }
      ]
    })
  },
  {
    pattern: /^\/devices\/(.+)$/,
    handler: (pathname, matches) => ({
      title: 'Device Details',
      icon: Cpu,
      breadcrumbs: [
        { label: 'Home', href: '/' },
        { label: 'Devices', href: '/devices' },
        { label: 'Device Details', isCurrentPage: true }
      ]
    })
  },
  // IMPORTANT: More specific patterns must come first!
  {
    pattern: /^\/automations\/executions$/,
    handler: (pathname, matches) => ({
      title: 'Automation Logs',
      icon: Workflow,
      breadcrumbs: [
        { label: 'Home', href: '/' },
        { label: 'Automations', href: '/automations' },
        { label: 'Logs', isCurrentPage: true }
      ]
    })
  },
  {
    pattern: /^\/automations\/(.+)\/executions$/,
    handler: (pathname, matches) => ({
      title: 'Execution History',
      icon: Workflow,
      breadcrumbs: [
        { label: 'Home', href: '/' },
        { label: 'Automations', href: '/automations' },
        { label: 'Edit Automation', href: `/automations/${matches[1]}` },
        { label: 'Executions', isCurrentPage: true }
      ]
    })
  },
  {
    pattern: /^\/automations\/(.+)$/,
    handler: (pathname, matches) => ({
      title: 'Edit Automation',
      icon: Workflow,
      breadcrumbs: [
        { label: 'Home', href: '/' },
        { label: 'Automations', href: '/automations' },
        { label: 'Edit Automation', isCurrentPage: true }
      ]
    })
  },
  {
    pattern: /^\/organizations\/(.+)$/,
    handler: (pathname, matches) => ({
      title: 'Members',
      icon: Building,
      breadcrumbs: [
        { label: 'Home', href: '/' },
        { label: 'Organizations', href: '/organizations' },
        { label: 'Members', isCurrentPage: true }
      ]
    })
  }
];

// Main function to get page configuration
export function getPageConfig(pathname: string): PageConfig | null {
  // First try exact match
  const exactMatch = PAGE_CONFIG[pathname];
  if (exactMatch) {
    return exactMatch;
  }

  // Try dynamic route handlers
  for (const { pattern, handler } of DYNAMIC_ROUTE_HANDLERS) {
    const matches = pathname.match(pattern);
    if (matches) {
      return handler(pathname, matches);
    }
  }

  return null;
}

// Get navigation items grouped for sidebar
export function getNavigationGroups(): Array<{
  items: Array<{
    href: string;
    label: string;
    icon: React.ElementType;
    badge?: string;
  }>;
}> {
  const navItems = Object.entries(PAGE_CONFIG)
    .filter(([_, config]) => config.isNavItem)
    .map(([href, config]) => ({
      href,
      label: config.title,
      icon: config.icon as React.ElementType || Activity,
      navGroup: config.navGroup || NavGroup.RESOURCES,
      badge: config.badge
    }));

  // Group by navGroup enum values in proper order
  const groupOrder = [NavGroup.RESOURCES, NavGroup.ALARM, NavGroup.ACTIVITY, NavGroup.ADMIN, NavGroup.INFORMATION];
  
  return groupOrder.map(groupKey => ({
    items: navItems.filter(item => item.navGroup === groupKey)
  })).filter(group => group.items.length > 0); // Remove empty groups
} 