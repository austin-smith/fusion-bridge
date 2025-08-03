'use client';

import React, { useState, useEffect } from 'react';
import { 
  useReactTable, 
  getCoreRowModel, 
  getSortedRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type GroupingState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpDown, Circle, CircleDashed, CircleCheck, LoaderCircle, CircleX, AlertCircle, SignalHigh, SignalMedium, SignalLow, Ellipsis, User, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { LinearIssue } from '@/services/drivers/linear';
import { getLinearPriorityConfig } from '@/services/drivers/linear';

interface LinearIssuesTableProps {
  issues: LinearIssue[];
  onRowClick: (issue: LinearIssue) => void;
  enableGrouping?: boolean;
}

// Helper for sortable headers
const SortableHeader = ({ column, children }: { column: any, children: React.ReactNode }) => (
  <div
    className="flex items-center gap-1 cursor-pointer select-none w-full"
    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
  >
    <span>{children}</span>
    <ArrowUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
  </div>
);

// Priority badge component
const PriorityBadge = ({ priority }: { priority: number }) => {
  const config = getLinearPriorityConfig(priority);
  const IconComponent = config.icon;

  return (
    <Badge 
      variant="outline"
      className="text-xs font-medium text-foreground max-w-24"
      style={{ 
        borderColor: config.color,
        backgroundColor: `${config.color}50`, // 31% opacity background
        color: config.color
      }}
    >
      <IconComponent 
        className="h-3 w-3 mr-1 shrink-0" 
        style={{ fill: config.color }}
      />
      <span className="truncate">{config.label}</span>
    </Badge>
  );
};

// Status badge component
const StatusBadge = ({ state }: { state: LinearIssue['state'] }) => {
  // Map state type to icon
  const getStateIcon = (type: string) => {
    switch (type) {
      case 'unstarted': return Circle; // Todo
      case 'backlog': return CircleDashed;
      case 'started': return LoaderCircle; // In Progress
      case 'completed': return CircleCheck; // Done
      case 'canceled': return CircleX;
      default: return Circle;
    }
  };

  const IconComponent = getStateIcon(state.type);

  return (
    <Badge 
      variant="outline"
      className="text-xs font-medium text-foreground max-w-28"
      style={{ 
        borderColor: state.color,
        backgroundColor: `${state.color}50` // 31% opacity background
      }}
    >
      <IconComponent className="h-3 w-3 mr-1 shrink-0" />
      <span className="truncate">{state.name}</span>
    </Badge>
  );
};

// Column definitions
const columns: ColumnDef<LinearIssue>[] = [
  {
    accessorKey: "identifier",
    header: ({ column }) => <SortableHeader column={column}>ID</SortableHeader>,
    cell: ({ row }) => {
      const issue = row.original;
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="link"
                className="h-auto p-0 font-mono text-xs text-primary hover:underline"
                onClick={() => window.open(issue.url, '_blank', 'noopener,noreferrer')}
              >
                {issue.identifier}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Open in Linear</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
    size: 100,
  },
  {
    accessorKey: "title",
    header: ({ column }) => <SortableHeader column={column}>Title</SortableHeader>,
    cell: ({ row }) => {
      const issue = row.original;
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate">{issue.title}</span>
                {issue.labels.length > 0 && (
                  <div className="flex gap-1 shrink-0">
                    {issue.labels.slice(0, 3).map((label) => (
                      <Badge 
                        key={label.id} 
                        variant="outline" 
                        className="text-xs font-normal"
                        style={{ 
                          borderColor: label.color,
                          backgroundColor: `${label.color}15`, // Very subtle background
                          color: label.color
                        }}
                      >
                        {label.name}
                      </Badge>
                    ))}
                    {issue.labels.length > 3 && (
                      <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                        +{issue.labels.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">
              <p className="break-words">{issue.title}</p>
              {issue.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{issue.description}</p>
              )}
              {issue.labels.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium mb-1">Labels:</p>
                  <div className="flex flex-wrap gap-1">
                    {issue.labels.map((label) => (
                      <Badge 
                        key={label.id} 
                        variant="outline" 
                        className="text-xs"
                        style={{ 
                          borderColor: label.color,
                          color: label.color
                        }}
                      >
                        {label.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
    minSize: 300,
  },
  {
    accessorKey: "state",
    header: ({ column, table }) => {
      const isGrouped = table.getState().grouping.length > 0;
      return isGrouped ? null : <SortableHeader column={column}>Status</SortableHeader>;
    },
    cell: ({ row, table }) => {
      const isGrouped = table.getState().grouping.length > 0;
      return isGrouped ? null : <StatusBadge state={row.original.state} />;
    },
    getGroupingValue: (row) => row.state.name,
    enableGrouping: true,
    size: 120,
  },
  {
    accessorKey: "priority",
    header: ({ column }) => <SortableHeader column={column}>Priority</SortableHeader>,
    cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
    size: 120,
  },
  {
    id: "assignee",
    header: ({ column }) => <SortableHeader column={column}>Assignee</SortableHeader>,
    accessorFn: (row) => row.assignee?.displayName || row.assignee?.name || 'Unassigned',
    cell: ({ row }) => {
      const assignee = row.original.assignee;
      
      if (!assignee) {
        return (
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs bg-muted">
                <User className="h-3 w-3" />
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-muted-foreground truncate">Unassigned</span>
          </div>
        );
      }

      const name = assignee.displayName || assignee.name;
      const fallback = name.charAt(0).toUpperCase();
      
      return (
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-xs">{fallback}</AvatarFallback>
          </Avatar>
          <span className="text-sm truncate">{name}</span>
        </div>
      );
    },
    size: 150,
  },

  {
    accessorKey: "updatedAt",
    header: ({ column }) => <SortableHeader column={column}>Updated</SortableHeader>,
    cell: ({ row }) => {
      const dateValue = row.getValue("updatedAt");
      const date = dateValue instanceof Date ? dateValue : new Date(dateValue as string);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      let formatted: string;
      if (diffDays === 0) {
        formatted = 'Today';
      } else if (diffDays === 1) {
        formatted = 'Yesterday';
      } else if (diffDays < 7) {
        formatted = `${diffDays}d ago`;
      } else {
        formatted = new Intl.DateTimeFormat('en-US', {
          month: 'short', 
          day: 'numeric'
        }).format(date);
      }
      
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-xs text-muted-foreground">{formatted}</div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Updated: {date.toLocaleString()}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
    size: 100,
  },
];

export function LinearIssuesTable({ issues, onRowClick, enableGrouping = false }: LinearIssuesTableProps) {
  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [expanded, setExpanded] = useState({});

  // Update states when enableGrouping changes
  useEffect(() => {
    if (enableGrouping) {
      setGrouping(['state']);
      // Use setTimeout to ensure grouping is applied first
      setTimeout(() => {
        setExpanded(true);
      }, 0);
    } else {
      setGrouping([]);
      setExpanded({});
    }
  }, [enableGrouping]);

  const table = useReactTable({
    data: issues,
    columns,
    state: {
      grouping,
      expanded,
    },
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    autoResetExpanded: false,
    initialState: {
      sorting: [{ id: 'updatedAt', desc: true }],
      expanded: enableGrouping ? true : {},
    },
  });

  return (
    <div className="rounded-md border" key={enableGrouping ? 'grouped' : 'flat'}>
      <Table>
        {!enableGrouping && (
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
        )}
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => 
              row.getIsGrouped() ? (
                <TableRow key={row.id + '-group'} className="bg-muted/50 hover:bg-muted/60">
                  <TableCell 
                    colSpan={columns.length} 
                    className="p-3 font-medium text-sm cursor-pointer"
                    onClick={row.getToggleExpandedHandler()}
                  >
                    <div className="flex items-center gap-3">
                      {row.getIsExpanded() ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      {/* Get state from first item in group to show status icon and color */}
                      {row.subRows.length > 0 && (() => {
                        const state = row.subRows[0].original.state;
                        const getStateIcon = (type: string) => {
                          switch (type) {
                            case 'unstarted': return Circle;
                            case 'backlog': return CircleDashed;
                            case 'started': return LoaderCircle;
                            case 'completed': return CircleCheck;
                            case 'canceled': return CircleX;
                            default: return Circle;
                          }
                        };
                        const IconComponent = getStateIcon(state.type);
                        return (
                          <div className="flex items-center gap-2">
                            <IconComponent 
                              className="h-4 w-4 shrink-0" 
                              style={{ color: state.color }}
                            />
                            <span className="capitalize font-semibold">
                              {state.name}
                            </span>
                          </div>
                        );
                      })()}
                      <span className="text-xs text-muted-foreground font-normal">
                        {row.subRows.length}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onRowClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              )
            )
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No tasks found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function LinearIssuesTableSkeleton() {
  return (
    <div className="rounded-md border">
      <div className="p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center space-x-4 py-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}