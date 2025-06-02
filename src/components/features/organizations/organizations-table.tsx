'use client';

import React, { useState } from 'react';
import { useFusionStore, type Organization } from '@/stores/store';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { MoreHorizontal, Building2, Users, Edit, Trash2, ArrowUpDown, MapPin } from 'lucide-react';
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
import { OrganizationLocationsDialog } from '@/components/features/organizations/organization-locations-dialog';
import { OrganizationLogoDisplay } from '@/components/features/organizations/organization-logo-selector';
import { useRouter } from 'next/navigation';

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
        <div className="flex items-center justify-center w-10 h-10">
          <OrganizationLogoDisplay logo={org.logo} className="h-8 w-8" size="default" />
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
  const [isLocationsDialogOpen, setIsLocationsDialogOpen] = useState(false);
  const router = useRouter();

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
            <DropdownMenuItem onSelect={() => router.push(`/organizations/${organization.slug}/members`)}>
              <Users className="mr-2 h-4 w-4" />
              Manage Members
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setIsLocationsDialogOpen(true)}>
              <MapPin className="mr-2 h-4 w-4" />
              View Locations
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

      <OrganizationLocationsDialog
        organization={organization}
        open={isLocationsDialogOpen}
        onOpenChange={setIsLocationsDialogOpen}
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
      {/* Table content using DataTable-like structure */}
      <div className="w-full">
        <div className="border-b">
          {/* Header */}
          <div className="flex items-center px-4 py-3">
            <div className="w-[50px]" /> {/* Logo column */}
            <div className="flex-1 px-4">
              <Skeleton className="h-4 w-16" /> {/* Name header */}
            </div>
            <div className="w-[120px] px-4">
              <Skeleton className="h-4 w-20" /> {/* Created header */}
            </div>
            <div className="w-[50px]" /> {/* Actions column */}
          </div>
        </div>
        {/* Rows */}
        <div className="divide-y">
          {[...Array(rowCount)].map((_, i) => (
            <div key={i} className="flex items-center px-4 py-3">
              {/* Logo */}
              <div className="w-[50px]">
                <Skeleton className="h-8 w-8 rounded" />
              </div>
              {/* Name and slug */}
              <div className="flex-1 px-4 space-y-1.5">
                <Skeleton className="h-4 w-[180px]" />
                <Skeleton className="h-3 w-[120px]" />
              </div>
              {/* Created date */}
              <div className="w-[120px] px-4">
                <Skeleton className="h-3 w-[80px]" />
              </div>
              {/* Actions */}
              <div className="w-[50px] flex justify-center">
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Export the create dialog for use in page headers
export { CreateOrganizationDialog }; 