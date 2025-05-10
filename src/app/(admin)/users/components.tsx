'use client';

import React, { useState, useRef, useEffect, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { MoreHorizontal, ArrowUpDown, Trash2, Loader2, PlusCircle, Pencil, KeyRound } from 'lucide-react';
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
import { deleteUser, addUser, updateUser } from '@/lib/actions/user-actions';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
    id: "avatar",
    header: "",
    cell: ({ row }) => {
        const user = row.original;
        const name = user.name || user.email || 'U';
        const fallback = name.charAt(0).toUpperCase();
        return (
            <Avatar className="h-7 w-7 text-xs">
                <AvatarImage src={user.image ?? undefined} alt={name} />
                <AvatarFallback>{fallback}</AvatarFallback>
            </Avatar>
        );
    },
    enableSorting: false,
    size: 50,
  },
  {
    accessorKey: "name",
    header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
    cell: ({ row }) => (
        // Add max-width and ellipsis like in devices page
        <div className="max-w-[200px] truncate font-medium">
            {row.getValue("name") || '-'}
        </div>
    ),
    size: 200,
  },
  {
    accessorKey: "email",
    header: ({ column }) => <SortableHeader column={column}>Email</SortableHeader>,
    cell: ({ row }) => (
        // Add max-width and ellipsis
        <div className="max-width-[250px] truncate">
            {row.getValue("email")}
        </div>
    ),
    size: 250,
  },
  {
    accessorKey: "twoFactorEnabled",
    header: ({ column }) => <SortableHeader column={column}>2FA</SortableHeader>,
    cell: ({ row }) => {
      // Access the value directly from the original data object
      const user = row.original;
      const isEnabled = user.twoFactorEnabled; // Access directly

      return (
        <span className={cn(
          "px-2 py-0.5 rounded-full text-xs font-medium",
          isEnabled ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
        )}>
          {isEnabled ? "Enabled" : "Disabled"}
        </span>
      );
    },
    size: 100, // Adjust size as needed
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
    size: 120,
  },
  {
    accessorKey: "lastLoginAt",
    header: ({ column }) => <SortableHeader column={column}>Last Login</SortableHeader>,
    cell: ({ row }) => {
      const date = row.getValue("lastLoginAt") as Date | null;
      if (!date) {
        return <div className="text-xs text-muted-foreground">-</div>;
      }
      const dateOnlyFormatted = new Intl.DateTimeFormat('en-US', {
          year: 'numeric', month: 'short', day: 'numeric',
      }).format(date);
      const fullDateTimeFormatted = new Intl.DateTimeFormat('en-US', {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
          // Optionally add second: '2-digit' if needed
      }).format(date);

      return (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-xs text-muted-foreground cursor-default">{dateOnlyFormatted}</div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{fullDateTimeFormatted}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
    size: 150, // Adjusted size
  },
  {
    id: "actions",
    cell: ({ row }) => <UserActionsCell user={row.original} />,
    enableSorting: false,
    enableHiding: false,
    size: 80, // Fixed size for actions
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

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteUser(user.id);
      if (result.success) {
        toast.success(result.message || 'User deleted successfully.');
        // Table will automatically re-render due to revalidatePath in server action
      } else {
        toast.error(result.message || 'Failed to delete user.');
      }
    } catch (error) {
      console.error("Error calling deleteUser action:", error);
      toast.error('An unexpected error occurred while deleting the user.');
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
                       {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
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

// Initial state for the form action
const initialState = {
    success: false,
    message: undefined,
};

export function AddUserDialog() {
  const [isOpen, setIsOpen] = useState(false);
  // Use useActionState to handle form submission and feedback
  const [state, formAction] = useActionState(addUser, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Use effect to show toast message and close dialog on success
  useEffect(() => {
    if (state.success) {
      toast.success(state.message || 'User added successfully!');
      setIsOpen(false); // Close the dialog
      formRef.current?.reset(); // Reset the form fields
    }
    if (!state.success && state.message) {
        toast.error(state.message);
    }
  }, [state]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusCircle className="h-4 w-4" />
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
        <form action={formAction} ref={formRef}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input id="name" name="name" className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                Email
              </Label>
              <Input id="email" name="email" type="text" className="col-span-3" required autoComplete="off" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">
                Password
              </Label>
              <Input id="password" name="password" type="password" className="col-span-3" required minLength={8} autoComplete="new-password" />
            </div>
             {/* Display server-side error message if any */}
            {/* {!state.success && state.message && (
                 <p className="col-span-4 text-sm text-destructive text-center">{state.message}</p>
             )} */} {/* Removed from here, handled by toast */} 
          </div>
          <DialogFooter>
            {/* Add DialogClose for the Cancel button */}
            <DialogClose asChild>
                 <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <AddUserSubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Specific submit button for Add User Dialog
function AddUserSubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add User
        </Button>
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
  const [state, formAction] = useActionState(updateUser, editInitialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || 'User updated successfully!');
      onOpenChange(false); // Close the dialog via prop
    }
    if (!state.success && state.message) {
        toast.error(state.message);
    }
  }, [state, onOpenChange]);

  // Reset form if dialog is closed externally or on success
  useEffect(() => {
      if (!isOpen) {
          formRef.current?.reset();
          // Reset form state manually if needed, though re-render might handle it
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
          {/* Hidden input for user ID */}
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
          </div>
          <DialogFooter>
            <DialogClose asChild>
                 <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <EditUserSubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Specific submit button for Edit User Dialog
function EditUserSubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
        </Button>
    );
}

// --- Skeleton Loader ---

// Helper component for skeleton table for Users page
export function UsersTableSkeleton({ rowCount = 10 }: { rowCount?: number }) {
  const columnCount = 6; // Select, Avatar, Name, Email, Created, Actions
  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            {/* Select Checkbox */}
            <TableHead className="w-[40px] px-2 py-1"><Skeleton className="h-5 w-5" /></TableHead>
            {/* Avatar */}
            <TableHead className="w-[50px] px-2 py-1"><Skeleton className="h-7 w-7 rounded-full" /></TableHead>
            {/* Name */}
            <TableHead className="w-[200px] px-2 py-1"><Skeleton className="h-5 w-20" /></TableHead>
            {/* Email */}
            <TableHead className="px-2 py-1"><Skeleton className="h-5 w-20" /></TableHead>
            {/* Created */}
            <TableHead className="w-[120px] px-2 py-1"><Skeleton className="h-5 w-24" /></TableHead>
            {/* Last Login */}
            <TableHead className="w-[150px] px-2 py-1"><Skeleton className="h-5 w-24" /></TableHead>
            {/* Actions */}
            <TableHead className="w-[80px] px-2 py-1"><Skeleton className="h-5 w-16" /></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...Array(rowCount)].map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {/* Select Checkbox */}
              <TableCell className="px-2 py-2"><Skeleton className="h-5 w-5" /></TableCell>
              {/* Avatar */}
              <TableCell className="px-2 py-2"><Skeleton className="h-7 w-7 rounded-full" /></TableCell>
              {/* Name */}
              <TableCell className="px-2 py-2"><Skeleton className="h-5 w-full" /></TableCell>
              {/* Email */}
              <TableCell className="px-2 py-2"><Skeleton className="h-5 w-full" /></TableCell>
              {/* Created */}
              <TableCell className="px-2 py-2"><Skeleton className="h-5 w-full" /></TableCell>
              {/* Last Login */}
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