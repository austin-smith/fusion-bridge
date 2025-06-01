'use client';

import React, { useState } from 'react';
import { useFusionStore, type Organization } from '@/stores/store';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { MoreHorizontal, Building2, Users, Edit, Trash2, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { DataTable } from '@/components/ui/data-table';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateOrganizationDialog } from '@/components/features/organizations/create-organization-dialog';
import { EditOrganizationDialog } from '@/components/features/organizations/edit-organization-dialog';

// --- Column Helper ---
const columnHelper = createColumnHelper<Organization>();

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

// --- Column Definitions ---
export const columns: ColumnDef<Organization>[] = [
  {
    id: "logo",
    header: "",
    cell: ({ row }) => {
      const org = row.original;
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted shrink-0">
          {org.logo ? (
            <img 
              src={org.logo} 
              alt={`${org.name} logo`}
              className="h-8 w-8 rounded-md object-cover"
            />
          ) : (
            <Building2 className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      );
    },
    enableSorting: false,
    size: 50,
  },
  {
    accessorKey: "name",
    header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
    cell: ({ row }) => {
      const org = row.original;
      return (
        <div className="max-w-[200px]">
          <div className="font-medium truncate">{org.name}</div>
          <div className="text-sm text-muted-foreground truncate">/{org.slug}</div>
        </div>
      );
    },
    size: 200,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => <SortableHeader column={column}>Created</SortableHeader>,
    cell: ({ row }) => {
      const date = row.getValue("createdAt") as Date | string | number;
      // Handle different date formats that Better Auth might return
      let parsedDate: Date;
      if (date instanceof Date) {
        parsedDate = date;
      } else if (typeof date === 'string') {
        parsedDate = new Date(date);
      } else if (typeof date === 'number') {
        // Handle timestamp (in milliseconds or seconds)
        parsedDate = new Date(date > 1000000000000 ? date : date * 1000);
      } else {
        parsedDate = new Date(); // Fallback to current date
      }
      
      const formatted = format(parsedDate, 'MMM d, yyyy');
      return <div className="text-xs text-muted-foreground">{formatted}</div>;
    },
    size: 120,
  },
  {
    id: "members",
    header: "Members",
    cell: () => {
      // TODO: Add member count when available
      return (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>-</span>
        </div>
      );
    },
    enableSorting: false,
    size: 100,
  },
  {
    id: "actions",
    cell: ({ row }) => <OrganizationActionsCell organization={row.original} />,
    enableSorting: false,
    enableHiding: false,
    size: 50,
  },
];

// --- Organization Actions Cell Component ---
interface OrganizationActionsCellProps {
  organization: Organization;
}

function OrganizationActionsCell({ organization }: OrganizationActionsCellProps) {
  const { deleteOrganization } = useFusionStore();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const success = await deleteOrganization(organization.id);
      if (success) {
        toast.success(`Organization ${organization.name} deleted successfully.`);
      }
    } catch (error: any) {
      console.error("Error deleting organization:", error);
      toast.error(error.message || 'Failed to delete organization.');
    } finally {
      setIsDeleting(false);
      setIsAlertOpen(false);
    }
  };

  return (
    <>
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setIsEditDialogOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Organization
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <AlertDialogTrigger asChild>
              <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Organization
              </DropdownMenuItem>
            </AlertDialogTrigger>
          </DropdownMenuContent>
        </DropdownMenu>
        
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the organization
              <span className="font-semibold"> {organization.name} </span>
              and remove all associated data including locations, members, and settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              disabled={isDeleting} 
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditOrganizationDialog
        organization={organization}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />
    </>
  );
}

// --- Main Organizations Table Component ---
interface OrganizationsTableProps {
  data: Organization[];
}

export function OrganizationsTable({ data }: OrganizationsTableProps) {
  return (
    <DataTable columns={columns} data={data} />
  );
}

// --- Skeleton Component ---
export function OrganizationsTableSkeleton({ rowCount = 5 }: { rowCount?: number }) {
  return (
    <div className="rounded-md border">
      <div className="h-12 border-b bg-muted/50 px-4 flex items-center">
        <Skeleton className="h-4 w-[150px]" />
      </div>
      <div className="divide-y">
        {[...Array(rowCount)].map((_, i) => (
          <div key={i} className="flex items-center space-x-4 p-4">
            <Skeleton className="h-8 w-8 rounded" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-3 w-[120px]" />
            </div>
            <Skeleton className="h-4 w-[80px]" />
            <Skeleton className="h-4 w-[60px]" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Export the create dialog for use in page headers
export { CreateOrganizationDialog }; 