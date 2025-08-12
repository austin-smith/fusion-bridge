'use client';

import React, { useState, useRef, useEffect, useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { MoreHorizontal, ArrowUpDown, Trash2, Loader2, Pencil, KeyRound, ShieldCheck, UserCircle2, Plus, Hash, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable } from '@/components/ui/data-table';
import type { User } from '@/lib/actions/user-actions';
import { updateUser } from '@/lib/actions/user-actions';
import { authClient } from '@/lib/auth/client';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ResetPasswordDialog } from './reset-password-dialog';
import { cn } from '@/lib/utils';
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFusionStore } from '@/stores/store';
import { PinManagementDialog } from './pin-management-dialog';
import { UserOrganizationsDialog } from './user-organizations-dialog';

// --- Column Definitions ---

const columnHelper = createColumnHelper<User>();

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

export const columns: ColumnDef<User>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]" // Align checkbox slightly better
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]" // Align checkbox slightly better
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40, // Fixed size for checkbox column
  },
  {
    id: "user",
    header: ({ column }) => <SortableHeader column={column}>User</SortableHeader>,
    accessorFn: (row) => row.name || row.email,
    cell: ({ row }) => {
      const user = row.original;
      const name = user.name || user.email;
      const fallback = name.charAt(0).toUpperCase();
      
      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.image ?? undefined} alt={name} />
            <AvatarFallback>{fallback}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <span className="font-medium truncate">{user.name || 'Unnamed'}</span>
            <span className="text-sm text-muted-foreground truncate">{user.email}</span>
          </div>
        </div>
      );
    },
    minSize: 250,
  },
  {
    accessorKey: "role",
    header: ({ column }) => <SortableHeader column={column}>Role</SortableHeader>,
    cell: ({ row }) => {
      const role = row.getValue("role") as string | null;
      const displayRole = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User';
      let RoleIcon = UserCircle2;

      if (role === 'admin') {
        RoleIcon = ShieldCheck;
      }

      return (
        <span className={cn(
          "flex items-center w-fit"
        )}>
          <RoleIcon className="mr-1.5 h-4 w-4" />
          {displayRole}
        </span>
      );
    },
    size: 100, 
  },
  {
    id: "emailVerified",
    header: ({ column }) => <SortableHeader column={column}>Email</SortableHeader>,
    cell: ({ row }) => {
      const isVerified = Boolean((row.original as any).emailVerified);
      return (
        <Badge
          variant="outline"
          className={cn(
            isVerified
              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
          )}
        >
          {isVerified ? "Verified" : "Unverified"}
        </Badge>
      );
    },
    size: 120,
    enableSorting: true,
  },
  {
    accessorKey: "twoFactorEnabled",
    header: ({ column }) => <SortableHeader column={column}>2FA</SortableHeader>,
    cell: ({ row }) => {
      const user = row.original;
      const isEnabled = user.twoFactorEnabled;
      return (
        <Badge
          variant="outline"
          className={cn(
            isEnabled
              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
          )}
        >
          {isEnabled ? "Enabled" : "Disabled"}
        </Badge>
      );
    },
    size: 100, 
    enableSorting: true,
  },
  {
    accessorKey: "keypadPin",
    header: ({ column }) => <SortableHeader column={column}>Keypad PIN</SortableHeader>,
    cell: ({ row }) => {
      const user = row.original as any; // Type assertion since Better Auth additionalFields aren't in our type yet
      const hasPin = user.keypadPin;
      
      return (
        <Badge
          variant="outline"
          className={cn(
            hasPin
              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
          )}
        >
          {hasPin ? "Enabled" : "Disabled"}
        </Badge>
      );
    },
    size: 100, 
    enableSorting: true,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => <SortableHeader column={column}>Created</SortableHeader>,
    cell: ({ row }) => {
      const date = row.getValue("createdAt") as Date;
      const formatted = new Intl.DateTimeFormat('en-US', {
          year: 'numeric', month: 'short', day: 'numeric'
          // hour: '2-digit', minute: '2-digit' // Maybe remove time for brevity?
      }).format(date);
      return <div className="text-xs text-muted-foreground">{formatted}</div>;
    },
    size: 100,
  },
  {
    id: "actions",
    cell: ({ row }) => <UserActionsCell user={row.original} />,
    enableSorting: false,
    enableHiding: false,
    size: 50, // Fixed size for actions
  },
];

// --- User Actions Cell Component ---

interface UserActionsCellProps {
  user: User;
}

function UserActionsCell({ user }: UserActionsCellProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [isOrganizationsDialogOpen, setIsOrganizationsDialogOpen] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await authClient.admin.removeUser({ userId: user.id });
      if (response.error) {
        const errorMessage = typeof response.error === 'object' && response.error.message 
                              ? response.error.message 
                              : JSON.stringify(response.error);
        throw new Error(errorMessage);
      }
      toast.success(`User ${user.name || user.email} deleted successfully.`);
      router.refresh();
      useFusionStore.getState().triggerUserListRefresh();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast.error(error.message || 'Failed to delete user.');
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
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit User
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setIsResetPasswordDialogOpen(true)}>
                   <KeyRound className="mr-2 h-4 w-4" />
                  Reset Password
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setIsPinDialogOpen(true)}>
                   <Hash className="mr-2 h-4 w-4" />
                  Manage PIN
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setIsOrganizationsDialogOpen(true)}>
                   <Building2 className="mr-2 h-4 w-4" />
                  View Organizations
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialogTrigger asChild>
                   <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10">
                       <Trash2 className="mr-2 h-4 w-4" />
                      Delete User
                   </DropdownMenuItem>
              </AlertDialogTrigger>
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the user
                      <span className="font-semibold"> {user.name || user.email} </span>
                      and remove their associated account data.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                       {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Delete
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      <EditUserDialog
         user={user}
         isOpen={isEditDialogOpen}
         onOpenChange={setIsEditDialogOpen}
      />
      
      <ResetPasswordDialog
         user={user}
         isOpen={isResetPasswordDialogOpen}
         onOpenChange={setIsResetPasswordDialogOpen}
       />
       
      <PinManagementDialog
         user={user}
         isOpen={isPinDialogOpen}
         onOpenChange={setIsPinDialogOpen}
       />
       
      <UserOrganizationsDialog
         user={user}
         isOpen={isOrganizationsDialogOpen}
         onOpenChange={setIsOrganizationsDialogOpen}
       />
    </>
  );
}

// --- Main User Table Component ---

interface UsersTableProps {
  data: User[];
}

export function UsersTable({ data }: UsersTableProps) {
  return (
    <DataTable columns={columns} data={data} />
  );
}

// --- Add User Dialog Component ---

export function AddUserDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      type CreateUserSuccessResponse = { 
        data?: { user: { name?: string | null, email: string } }; 
        error?: any; 
        name?: string | null;
        email?: string;
      };

      const tempPassword = Array.from(crypto.getRandomValues(new Uint32Array(6)))
        .map((n) => n.toString(36))
        .join('')
        .slice(0, 24);

      const response = await authClient.admin.createUser({
        name,
        email,
        password: tempPassword,
        role: role,
      }) as CreateUserSuccessResponse;

      if (response.error) {
        const errorMessage = typeof response.error === 'object' && response.error.message 
                              ? response.error.message 
                              : JSON.stringify(response.error);
        throw new Error(errorMessage);
      }

      let newUserName = 'New user';
      if (response.data?.user) {
        newUserName = response.data.user.name || response.data.user.email;
      } else if (response.name || response.email) { 
        newUserName = response.name || response.email || 'New user';
      }
      
      toast.success(`User ${newUserName} created successfully!`);

      // Send verification email for admin-created users
      try {
        const sendResult: any = await authClient.sendVerificationEmail({
          email,
          callbackURL: '/create-password',
        });
        const errorMessage = sendResult?.error?.message || sendResult?.error;
        if (errorMessage) {
          console.error('Error sending verification email:', errorMessage);
          toast.error(`Verification email failed: ${String(errorMessage)}`);
        } else {
          toast.success('Verification email sent');
        }
      } catch (e: any) {
        console.error('Error sending verification email:', e);
        const msg = e?.message || (typeof e === 'string' ? e : 'Unknown error');
        toast.error(`Verification email failed: ${msg}`);
      }
      setIsOpen(false);
      setName('');
      setEmail('');
      setRole('user');
      formRef.current?.reset();
      router.refresh();
      useFusionStore.getState().triggerUserListRefresh();
    } catch (error: any) {
      console.error("Error creating user:", error);
      toast.error(error.message || 'Failed to create user.');
    }
    setIsLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) {
        setName('');
        setEmail('');
      // no-op: password is not collected from admin; user will set password after verification
        setRole('user');
        setIsLoading(false);
      }
    }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New User</DialogTitle>
          <DialogDescription>
            Enter the details for the new user.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} ref={formRef}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="add-name" className="text-right">
                Name
              </Label>
              <Input id="add-name" name="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="add-email" className="text-right">
                Email
              </Label>
              <Input id="add-email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="col-span-3" required autoComplete="off" />
            </div>
            {null}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="add-role" className="text-right">
                Role
              </Label>
              <Select value={role} onValueChange={(value: 'user' | 'admin') => setRole(value)}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">
                    <div className="flex items-center gap-2">
                      <UserCircle2 className="h-4 w-4 text-muted-foreground" />
                      <span>User</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                      <span>Admin</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
                 <Button type="button" variant="outline" disabled={isLoading}>Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add User
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Edit User Dialog Component ---

interface EditUserDialogProps {
    user: User;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

const editInitialState = {
    success: false,
    message: undefined,
};

function EditUserDialog({ user, isOpen, onOpenChange }: EditUserDialogProps) {
  const [state, formAction, isPending] = useActionState(updateUser, editInitialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [role, setRole] = React.useState<'user' | 'admin'>((user.role as any) ?? 'user');

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || 'User updated successfully!');
      onOpenChange(false);
      useFusionStore.getState().triggerUserListRefresh();
    }
    if (!state.success && state.message) {
        toast.error(state.message);
    }
  }, [state, onOpenChange]);

  useEffect(() => {
      if (!isOpen) {
          formRef.current?.reset();
      }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update the user&apos;s details. Changes will be saved immediately.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} ref={formRef}>
          <input type="hidden" name="id" value={user.id} />
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="text-right">
                Name
              </Label>
              <Input id="edit-name" name="name" className="col-span-3" required defaultValue={user.name ?? ''} />
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-email" className="text-right">
                Email
              </Label>
              <Input id="edit-email" name="email" type="email" className="col-span-3" disabled value={user.email} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-image" className="text-right">
                Avatar URL
              </Label>
              <Input id="edit-image" name="image" type="url" placeholder="https://..." className="col-span-3" defaultValue={user.image ?? ''} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-role" className="text-right">
                Role
              </Label>
              <Select value={role} onValueChange={(value: 'user' | 'admin') => setRole(value)} name="role">
                <SelectTrigger className="col-span-3" id="edit-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">
                    <div className="flex items-center gap-2">
                      <UserCircle2 className="h-4 w-4 text-muted-foreground" />
                      <span>User</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                      <span>Admin</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
                 <Button type="button" variant="outline" disabled={isPending}>Cancel</Button>
            </DialogClose>
            <EditUserSubmitButton isPending={isPending} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserSubmitButton({ isPending }: { isPending: boolean }) {
    return (
        <Button type="submit" disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
        </Button>
    );
}

// --- Skeleton Loader ---

// Helper component for skeleton table for Users page
export function UsersTableSkeleton({ rowCount = 10 }: { rowCount?: number }) {
  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            {/* Select Checkbox */}
            <TableHead className="w-[40px] px-2 py-1"><Skeleton className="h-5 w-5" /></TableHead>
            {/* User (combined avatar, name, email) */}
            <TableHead className="px-2 py-1"><Skeleton className="h-5 w-20" /></TableHead>
            {/* Role */}
            <TableHead className="w-[120px] px-2 py-1"><Skeleton className="h-5 w-12" /></TableHead>
            {/* Email Verified */}
            <TableHead className="w-[120px] px-2 py-1"><Skeleton className="h-5 w-16" /></TableHead>
            {/* 2FA */}
            <TableHead className="w-[110px] px-2 py-1"><Skeleton className="h-5 w-10" /></TableHead>
            {/* Keypad PIN */}
            <TableHead className="w-[130px] px-2 py-1"><Skeleton className="h-5 w-16" /></TableHead>
            {/* Created */}
            <TableHead className="w-[120px] px-2 py-1"><Skeleton className="h-5 w-24" /></TableHead>
            {/* Actions */}
            <TableHead className="w-[80px] px-2 py-1"><Skeleton className="h-5 w-16" /></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...Array(rowCount)].map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {/* Select Checkbox */}
              <TableCell className="px-2 py-2"><Skeleton className="h-5 w-5" /></TableCell>
              {/* User (combined avatar, name, email) */}
              <TableCell className="px-2 py-2">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              </TableCell>
              {/* Role */}
              <TableCell className="px-2 py-2"><Skeleton className="h-5 w-full" /></TableCell>
              {/* Email Verified */}
              <TableCell className="px-2 py-2"><Skeleton className="h-5 w-full" /></TableCell>
              {/* 2FA */}
              <TableCell className="px-2 py-2"><Skeleton className="h-5 w-full" /></TableCell>
              {/* Keypad PIN */}
              <TableCell className="px-2 py-2"><Skeleton className="h-5 w-full" /></TableCell>
              {/* Created */}
              <TableCell className="px-2 py-2"><Skeleton className="h-5 w-full" /></TableCell>
              {/* Actions */}
              <TableCell className="px-2 py-2"><Skeleton className="h-8 w-8" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/* Add simplified skeleton pagination/footer if DataTable usually has one */}
      <div className="flex items-center justify-end space-x-2 p-2 border-t">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
} 