'use client';

import React, { useMemo, useState, useCallback } from 'react';
import {
  KanbanBoard,
  KanbanBoardColumn,
  KanbanBoardColumnHeader,
  KanbanBoardColumnTitle,
  KanbanBoardColumnList,
  KanbanBoardColumnListItem,
  KanbanBoardColumnSkeleton,
  KanbanBoardExtraMargin,
  KanbanBoardProvider,
  KanbanBoardCard,
} from '@/components/kanban';
import { Badge } from '@/components/ui/badge';
import { Circle, CircleDashed, CircleCheck, LoaderCircle, CircleX } from 'lucide-react';
import { useJsLoaded } from '@/hooks/use-js-loaded';
import type { LinearIssue } from '@/services/drivers/linear';
import { LinearKanbanCard } from './linear-kanban-card';
import { toast } from 'sonner';

interface LinearKanbanBoardProps {
  issues: LinearIssue[];
  onCardClick: (issue: LinearIssue) => void;
}

interface KanbanColumn {
  id: string; // Linear state ID
  title: string; // Linear state name
  color: string; // Linear state color
  type: string; // Linear state type
  items: LinearIssue[];
}

/**
 * Transform Linear issues into Kanban columns grouped by state
 */
function groupIssuesByState(issues: LinearIssue[]): KanbanColumn[] {
  // Group issues by state name (more reliable than ID for mock data)
  const stateGroups = issues.reduce((groups, issue) => {
    const stateKey = issue.state.name;
    if (!groups[stateKey]) {
      groups[stateKey] = {
        id: issue.state.id || issue.state.name, // Fallback to name if ID is empty
        title: issue.state.name,
        color: issue.state.color,
        type: issue.state.type,
        items: [],
      };
    }
    groups[stateKey].items.push(issue);
    return groups;
  }, {} as Record<string, KanbanColumn>);

  // Convert to array and sort by state type for logical order
  const columns = Object.values(stateGroups);
  
  // Sort columns by state type priority (backlog -> unstarted -> started -> completed -> canceled)
  const stateOrder = {
    'backlog': 0,
    'unstarted': 1,
    'started': 2,
    'completed': 3,
    'canceled': 4,
  };
  
  return columns.sort((a, b) => {
    const orderA = stateOrder[a.type as keyof typeof stateOrder] ?? 999;
    const orderB = stateOrder[b.type as keyof typeof stateOrder] ?? 999;
    return orderA - orderB;
  });
}

/**
 * Get the appropriate icon for a Linear state type
 */
function getStateIcon(type: string) {
  switch (type) {
    case 'unstarted': return Circle; // Todo
    case 'backlog': return CircleDashed;
    case 'started': return LoaderCircle; // In Progress
    case 'completed': return CircleCheck; // Done
    case 'canceled': return CircleX;
    default: return Circle;
  }
}

export function LinearKanbanBoard({ issues, onCardClick }: LinearKanbanBoardProps) {
  const jsLoaded = useJsLoaded();
  const [localIssues, setLocalIssues] = useState<LinearIssue[]>(issues);
  
  // Update local state when issues prop changes
  React.useEffect(() => {
    setLocalIssues(issues);
  }, [issues]);
  
  // Transform issues into columns
  const columns = useMemo(() => groupIssuesByState(localIssues), [localIssues]);

  // Handle drop on column
  const handleDropOverColumn = useCallback((columnId: string) => {
    return async (dataTransferData: string) => {
      console.log('Drop triggered on column:', columnId, 'with data:', dataTransferData);
      
      const draggedCardData = JSON.parse(dataTransferData) as { id: string };
      console.log('Parsed drag data:', draggedCardData);
      
      // Find the full issue from local state
      const draggedIssue = localIssues.find(issue => issue.id === draggedCardData.id);
      console.log('Found dragged issue:', draggedIssue);
      if (!draggedIssue) return;
      
      // Find target column
      const targetColumn = columns.find(col => col.id === columnId);
      console.log('Target column:', targetColumn);
      if (!targetColumn || targetColumn.id === draggedIssue.state.id) return;
      
      // Optimistic update
      const originalIssues = [...localIssues];
      const updatedIssues = localIssues.map(issue => 
        issue.id === draggedIssue.id 
          ? { ...issue, state: { ...issue.state, id: targetColumn.id, name: targetColumn.title, color: targetColumn.color, type: targetColumn.type } }
          : issue
      );
      setLocalIssues(updatedIssues);
      
      try {
        // Call API to update Linear
        const response = await fetch(`/api/services/linear/issues/${draggedIssue.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stateId: targetColumn.id })
        });
        
        if (!response.ok) {
          throw new Error('Failed to update issue');
        }
        
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'Failed to update issue');
        }
        
        // Update with actual response data
        setLocalIssues(prev => prev.map(issue => 
          issue.id === draggedIssue.id ? result.data : issue
        ));
        
        toast.success(`Moved issue to ${targetColumn.title}`);
      } catch (error) {
        // Revert optimistic update
        setLocalIssues(originalIssues);
        toast.error(error instanceof Error ? error.message : 'Failed to update issue');
        console.error('Error updating Linear issue:', error);
      }
    };
  }, [localIssues, columns]);

  // Show skeleton while loading
  if (!jsLoaded) {
    return <LinearKanbanBoardSkeleton />;
  }

  // Empty state
  if (issues.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border border-dashed">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No issues found</p>
          <p className="text-xs text-muted-foreground mt-1">
            Try adjusting your filters or check your Linear configuration
          </p>
        </div>
      </div>
    );
  }

  return (
    <KanbanBoardProvider>
      <KanbanBoard>
        {columns.map((column) => {
          const StateIcon = getStateIcon(column.type);
          
          return (
            <KanbanBoardColumn 
              key={column.id} 
              columnId={column.id}
              onDropOverColumn={handleDropOverColumn(column.id)}
            >
              <KanbanBoardColumnHeader>
                <KanbanBoardColumnTitle columnId={column.id}>
                  <div className="flex items-center gap-2">
                    <StateIcon 
                      className="h-4 w-4 shrink-0" 
                      style={{ color: column.color }}
                    />
                    <span className="font-medium">{column.title}</span>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {column.items.length}
                    </Badge>
                  </div>
                </KanbanBoardColumnTitle>
              </KanbanBoardColumnHeader>

              <KanbanBoardColumnList>
                {column.items.map((issue) => (
                  <KanbanBoardColumnListItem 
                    key={issue.id} 
                    cardId={issue.id}
                    onDropOverListItem={(dataTransferData, dropDirection) => {
                      console.log('Drop on list item:', issue.id, dataTransferData, dropDirection);
                      return handleDropOverColumn(column.id)(dataTransferData);
                    }}
                  >
                    <KanbanBoardCard data={{ id: issue.id }} onClick={() => onCardClick(issue)}>
                      <LinearKanbanCard issue={issue} />
                    </KanbanBoardCard>
                  </KanbanBoardColumnListItem>
                ))}
              </KanbanBoardColumnList>
            </KanbanBoardColumn>
          );
        })}
        <KanbanBoardExtraMargin />
      </KanbanBoard>
    </KanbanBoardProvider>
  );
}

/**
 * Skeleton loading state for Linear Kanban Board
 */
export function LinearKanbanBoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <KanbanBoardColumnSkeleton key={i} />
      ))}
    </div>
  );
}