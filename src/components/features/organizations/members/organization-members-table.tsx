'use client';

import React, { useState } from 'react';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { MoreHorizontal, Shield, User, UserCircle2, ArrowUpDown, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { authClient } from '@/lib/auth/client';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { MemberRoleDialog } from './member-role-dialog';

// Type for organization member with user details
export interface OrganizationMemberWithUser {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  createdAt: Date | string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

// --- Column Helper ---
const columnHelper = createColumnHelper<OrganizationMemberWithUser>();

// Helper for sortable headers
const SortableHeader = ({ column, children }: { column: any; children: React.ReactNode }) => (
  <div
    className="flex items-center gap-1 cursor-pointer select-none w-full"
    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
  >
    <span>{children}</span>
    <ArrowUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
  </div>
);

// Role badge component
const RoleBadge = ({ role }: { role: string }) => {
  const roleConfig = {
    owner: { icon: Shield, variant: 'default' as const, className: 'bg-purple-500 hover:bg-purple-600' },
    admin: { icon: UserCircle2, variant: 'secondary' as const },
    member: { icon: User, variant: 'outline' as const },
  }[role] || { icon: User, variant: 'outline' as const };

  const Icon = roleConfig.icon;

  return (
    <Badge variant={roleConfig.variant} className={cn('capitalize', roleConfig.className)}>
      <Icon className="mr-1 h-3 w-3" />
      {role}
    </Badge>
  );
};

// --- Column Definitions ---
export const columns: ColumnDef<OrganizationMemberWithUser>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40,
  },
  {
    id: 'user',
    header: ({ column }) => <SortableHeader column={column}>User</SortableHeader>,
    accessorFn: (row) => row.user.name || row.user.email,
    cell: ({ row }) => {
      const member = row.original;
      const user = member.user;
      const name = user.name || user.email;
      const fallback = name.charAt(0).toUpperCase();
      
      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.image ?? undefined} alt={name} />
            <AvatarFallback>{fallback}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-medium">{user.name || 'Unnamed'}</span>
            <span className="text-sm text-muted-foreground">{user.email}</span>
          </div>
        </div>
      );
    },
    size: 300,
  },
  {
    accessorKey: 'role',
    header: ({ column }) => <SortableHeader column={column}>Role</SortableHeader>,
    cell: ({ row }) => <RoleBadge role={row.getValue('role')} />,
    size: 120,
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => <SortableHeader column={column}>Joined</SortableHeader>,
    cell: ({ row }) => {
      const date = row.getValue('createdAt') as Date | string;
      const parsedDate = typeof date === 'string' ? new Date(date) : date;
      return (
        <div className="text-sm text-muted-foreground">
          {format(parsedDate, 'MMM d, yyyy')}
        </div>
      );
    },
    size: 120,
  },
  {
    id: 'actions',
    cell: ({ row }) => <MemberActionsCell member={row.original} />,
    enableSorting: false,
    enableHiding: false,
    size: 50,
  },
];

// --- Member Actions Cell Component ---
interface MemberActionsCellProps {
  member: OrganizationMemberWithUser;
}

function MemberActionsCell({ member }: MemberActionsCellProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const isOwner = member.role === 'owner';
  const router = useRouter();

  const handleRemove = async () => {
    setIsDeleting(true);
    try {
      const response = await authClient.organization.removeMember({
        memberIdOrEmail: member.id,
        organizationId: member.organizationId,
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to remove member');
      }

      toast.success(`${member.user.name || member.user.email} removed from organization`);
      // Refresh the page data
      router.refresh();
    } catch (error: any) {
      console.error('Error removing member:', error);
      toast.error(error.message || 'Failed to remove member');
    } finally {
      setIsDeleting(false);
      setIsAlertOpen(false);
    }
  };

  // Owners cannot be removed or have their role changed
  if (isOwner) {
    return (
      <Button variant="ghost" className="h-8 w-8 p-0" disabled>
        <span className="sr-only">No actions available</span>
        <MoreHorizontal className="h-4 w-4 opacity-30" />
      </Button>
    );
  }

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
            <DropdownMenuItem
              onSelect={() => setIsRoleDialogOpen(true)}
            >
              <Edit className="mr-2 h-4 w-4" />
              Change Role
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <AlertDialogTrigger asChild>
              <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10">
                <Trash2 className="mr-2 h-4 w-4" />
                Remove Member
              </DropdownMenuItem>
            </AlertDialogTrigger>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <span className="font-semibold">{member.user.name || member.user.email}</span> from
              the organization. They will lose access to all organization resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isDeleting ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MemberRoleDialog
        member={member}
        open={isRoleDialogOpen}
        onOpenChange={setIsRoleDialogOpen}
      />
    </>
  );
}

// --- Main Table Component ---
interface OrganizationMembersTableProps {
  data: OrganizationMemberWithUser[];
}

export function OrganizationMembersTable({ data }: OrganizationMembersTableProps) {
  return <DataTable columns={columns} data={data} />;
}

// --- Skeleton Component ---
export function OrganizationMembersTableSkeleton({ rowCount = 5 }: { rowCount?: number }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              <Skeleton className="h-5 w-5" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-5 w-20" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-5 w-16" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-5 w-20" />
            </TableHead>
            <TableHead className="w-[50px]">
              <Skeleton className="h-5 w-8" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...Array(rowCount)].map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-5 w-5" />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-8 w-8" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
} 