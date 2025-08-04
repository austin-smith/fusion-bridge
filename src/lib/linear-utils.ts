import type { LinearIssue } from '@/services/drivers/linear';
import { LINEAR_PRIORITY_CONFIG } from '@/services/drivers/linear';
import { Circle, CircleDashed, CircleCheck, LoaderCircle, CircleX } from 'lucide-react';

export interface LinearState {
  id: string;
  name: string;
  color: string;
  type: string;
}

export interface KanbanColumn extends LinearState {
  title: string;
  items: LinearIssue[];
}

// Shared Linear constants and utilities
const STATE_ORDER = {
  'backlog': 0,
  'unstarted': 1,
  'started': 2,
  'completed': 3,
  'canceled': 4,
} as const;



/**
 * Get the appropriate icon component for a Linear state type
 */
export function getStateIcon(type: string) {
  switch (type) {
    case 'unstarted': return Circle;
    case 'backlog': return CircleDashed;
    case 'started': return LoaderCircle;
    case 'completed': return CircleCheck;
    case 'canceled': return CircleX;
    default: return Circle;
  }
}

/**
 * Get all available Linear priority options for use in Select components
 */
export function getLinearPriorityOptions() {
  return Object.entries(LINEAR_PRIORITY_CONFIG).map(([value, config]) => ({
    value: parseInt(value),
    label: config.label,
    color: config.color,
    icon: config.icon,
  }));
}

/**
 * Sort states by their logical workflow order
 */
function sortStatesByOrder<T extends { type: string }>(states: T[]): T[] {
  return states.sort((a, b) => {
    const orderA = STATE_ORDER[a.type as keyof typeof STATE_ORDER] ?? 999;
    const orderB = STATE_ORDER[b.type as keyof typeof STATE_ORDER] ?? 999;
    return orderA - orderB;
  });
}

/**
 * Extract unique states from Linear issues
 */
export function extractStatesFromIssues(issues: LinearIssue[]): LinearState[] {
  const stateMap = new Map<string, LinearState>();
  
  issues.forEach(issue => {
    const stateKey = issue.state.name;
    if (!stateMap.has(stateKey)) {
      stateMap.set(stateKey, {
        id: issue.state.id || issue.state.name, // Fallback to name if ID is empty
        name: issue.state.name,
        color: issue.state.color,
        type: issue.state.type,
      });
    }
  });

  // Convert to array and sort by logical workflow order
  const states = Array.from(stateMap.values());
  return sortStatesByOrder(states);
}

/**
 * Transform Linear issues into Kanban columns grouped by state
 */
export function groupIssuesByState(issues: LinearIssue[]): KanbanColumn[] {
  // Group issues by state name (more reliable than ID for mock data)
  const stateGroups = issues.reduce((groups, issue) => {
    const stateKey = issue.state.name;
    if (!groups[stateKey]) {
      groups[stateKey] = {
        id: issue.state.id || issue.state.name, // Fallback to name if ID is empty
        title: issue.state.name,
        name: issue.state.name,
        color: issue.state.color,
        type: issue.state.type,
        items: [],
      };
    }
    groups[stateKey].items.push(issue);
    return groups;
  }, {} as Record<string, KanbanColumn>);

  // Convert to array and sort by logical workflow order
  const columns = Object.values(stateGroups);
  return sortStatesByOrder(columns);
}