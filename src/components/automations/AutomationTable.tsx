'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DataTable } from '@/components/ui/data-table'; // Correct path to the wrapper component
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { MoreHorizontal } from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge'; // For enabled status
import { toast } from 'sonner'; // For feedback
import Link from 'next/link'; // Import Link

// Import Alert Dialog components
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Import Skeleton component
import { Skeleton } from "@/components/ui/skeleton";
// Import Table primitives for skeleton structure
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Import the necessary types for the component
import type { AutomationConfig } from '@/lib/automation-schemas';

// Interface AutomationApiResponse needs adjustment if GET /api/automations changed
interface AutomationApiResponse {
  id: string;
  name: string;
  enabled: boolean;
  // sourceConnectorId: string; // This is likely removed from API response now
  createdAt: string; 
  updatedAt: string;
  configJson: AutomationConfig | null; // Expects primaryTrigger, secondaryConditions?, actions
  // sourceConnectorName: string | null; // This is likely removed from API response now
}

// --- START: New Row Actions Component ---
interface AutomationRowActionsProps {
  automation: AutomationApiResponse;
  refreshData: () => void;
}

function AutomationRowActions({ automation, refreshData }: AutomationRowActionsProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/automations/${automation.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        // Attempt to parse error details
        let errorDetails = `API Error: ${response.status}`;
        try { const errorJson = await response.json(); errorDetails = errorJson.message || errorDetails; } catch {} 
        throw new Error(errorDetails);
      }
      toast.success(`Automation "${automation.name}" deleted.`);
      setShowDeleteDialog(false); // Close dialog on success
      refreshData(); // Call the refresh function passed via props
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error(`Failed to delete automation. ${error instanceof Error ? error.message : ''}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => navigator.clipboard.writeText(automation.id)}
          >
            Copy ID
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            {/* Link to the manage page */}
            <Link href={`/settings/automations/${automation.id}`}>Edit</Link>
          </DropdownMenuItem>
          <DropdownMenuItem 
            className="text-red-600 focus:text-red-700 focus:bg-red-50"
            onSelect={(e) => {
                e.preventDefault(); // Prevent menu closing immediately
                setShowDeleteDialog(true);
              }}
            disabled={isDeleting}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Alert Dialog for Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              automation rule <span className="font-semibold">{automation.name}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
// --- END: New Row Actions Component ---

export const columns = (
  refreshData: () => void 
): ColumnDef<AutomationApiResponse>[] => [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    id: 'trigger', 
    header: 'Trigger',
    cell: ({ row }) => {
      const config = row.original.configJson;
      const trigger = config?.primaryTrigger;
      
      // Display based on standardized types, not connector name
      const entityTypes = trigger?.sourceEntityTypes?.length 
                          ? trigger.sourceEntityTypes.join(', ') 
                          : 'Any Device Type'; // Clarify default
      const eventFilter = trigger?.eventTypeFilter 
                          ? trigger.eventTypeFilter 
                          : 'Any Event Type'; // Clarify default

      // Combine for display
      return <span>{`Device: ${entityTypes} | Event: ${eventFilter}`}</span>;
    },
  },
  {
    id: 'conditions',
    header: 'Conditions',
    cell: ({ row }) => {
      const config = row.original.configJson;
      const conditionCount = config?.secondaryConditions?.length ?? 0;
      return <span>{conditionCount > 0 ? `${conditionCount} Condition(s)` : 'None'}</span>;
    },
  },
  {
    id: 'action',
    header: 'Action(s)',
    cell: ({ row }) => {
      const config = row.original.configJson;
      const actions = config?.actions;
      if (!actions || actions.length === 0) return 'None';
      // Display first action type, indicate if more exist
      const firstActionType = actions[0].type;
      const display = actions.length > 1 ? `${firstActionType}, ...` : firstActionType;
      return <span>{display}</span>;
    },
  },
  {
    accessorKey: 'enabled',
    header: 'Status',
    cell: ({ row }) => {
      const enabled = row.getValue('enabled') as boolean; // Ensure boolean type
      return (
        <Badge variant={enabled ? 'default' : 'secondary'}>
          {enabled ? 'Enabled' : 'Disabled'}
        </Badge>
      );
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      // Render the new component, passing necessary props
      return <AutomationRowActions automation={row.original} refreshData={refreshData} />;
    },
  },
];

// --- Skeleton Loader Component ---
function AutomationTableSkeleton() {
  // Determine number of columns dynamically or use a fixed number
  const numColumns = 6; // Based on current columns: Name, Trigger, Conditions, Action(s), Status, Actions
  const numRows = 3; // Show a few skeleton rows

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: numColumns }).map((_, index) => (
              <TableHead key={index}>
                <Skeleton className="h-5 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: numRows }).map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {Array.from({ length: numColumns }).map((_, colIndex) => (
                <TableCell key={colIndex}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
// --- End Skeleton Loader Component ---

export function AutomationTable() {
  const [automations, setAutomations] = useState<AutomationApiResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Define fetchAutomations using useCallback to keep reference stable
  const fetchAutomations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/automations');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setAutomations(data as AutomationApiResponse[]);
    } catch (e) {
      console.error('Failed to fetch automations:', e);
      setError('Failed to load automations.');
      toast.error('Failed to load automations.');
    } finally {
      setLoading(false);
    }
  }, []); // Empty dependency array - fetch function itself doesn't change

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]); // Depend on the memoized fetch function

  // Define table columns, passing the fetchAutomations function for refresh
  const tableColumns = React.useMemo(() => columns(fetchAutomations), [fetchAutomations]);

  // Use Skeleton component when loading
  if (loading) {
    return <AutomationTableSkeleton />;
  }

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  return (
    <DataTable columns={tableColumns} data={automations} />
  );
} 