'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, Check, ChevronsUpDown, User as UserIcon, UserCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { User } from '@/lib/actions/user-actions';
import { authClient } from '@/lib/auth/client';

interface AddMemberDialogProps {
  organizationId: string;
  organizationSlug: string;
  existingMemberIds: Set<string>;
  onMemberAdded?: () => void;
}

export function AddMemberDialog({
  organizationId,
  organizationSlug,
  existingMemberIds,
  onMemberAdded,
}: AddMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<'member' | 'admin'>('member');
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const fetchUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const response = await fetch('/api/users');
      const data = await response.json();
      
      if (data.success && data.data) {
        // Filter out users who are already members
        const availableUsers = data.data.filter(
          (user: User) => !existingMemberIds.has(user.id)
        );
        setUsers(availableUsers);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setIsLoadingUsers(false);
    }
  }, [existingMemberIds]);

  useEffect(() => {
    if (open) {
      fetchUsers();
    }
  }, [open, fetchUsers]);

  const handleSubmit = async () => {
    if (!selectedUserId) {
      toast.error('Please select a user');
      return;
    }

    setIsSubmitting(true);
    try {
      // Call server-side API to add member directly
      const response = await fetch('/api/organizations/members/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          organizationId,
          role: selectedRole,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to add member');
      }

      const selectedUser = users.find(u => u.id === selectedUserId);
      toast.success(
        `${selectedUser?.name || selectedUser?.email} added to organization as ${selectedRole}`
      );
      
      setOpen(false);
      setSelectedUserId('');
      setSelectedRole('member');
      
      // Callback to refresh the members list
      if (onMemberAdded) {
        onMemberAdded();
      }
    } catch (error: any) {
      console.error('Error adding member:', error);
      toast.error(error.message || 'Failed to add member');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Add Member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Add Member to Organization</DialogTitle>
          <DialogDescription>
            Select an existing user to add as a member of this organization.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="user">User</Label>
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={searchOpen}
                  className="w-full justify-between"
                  disabled={isLoadingUsers}
                >
                  {selectedUser ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={selectedUser.image ?? undefined} />
                        <AvatarFallback>
                          {(selectedUser.name || selectedUser.email).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span>{selectedUser.name || 'Unnamed'}</span>
                      <span className="text-muted-foreground">({selectedUser.email})</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      {isLoadingUsers ? 'Loading users...' : 'Select a user...'}
                    </span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[500px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search users..." />
                  <CommandList>
                    <CommandEmpty>No users found.</CommandEmpty>
                    <CommandGroup>
                      {users.map((user) => (
                        <CommandItem
                          key={user.id}
                          value={`${user.name} ${user.email}`}
                          onSelect={() => {
                            setSelectedUserId(user.id);
                            setSearchOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedUserId === user.id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <Avatar className="h-6 w-6 mr-2">
                            <AvatarImage src={user.image ?? undefined} />
                            <AvatarFallback>
                              {(user.name || user.email).charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span>{user.name || 'Unnamed'}</span>
                            <span className="text-sm text-muted-foreground">{user.email}</span>
                          </div>
                          {user.role === 'admin' && (
                            <Badge variant="secondary" className="ml-auto">
                              Admin
                            </Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="role">Role</Label>
            <Select value={selectedRole} onValueChange={(value: 'member' | 'admin') => setSelectedRole(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4" />
                    <span>Member</span>
                  </div>
                </SelectItem>
                <SelectItem value="admin">
                  <div className="flex items-center gap-2">
                    <UserCircle2 className="h-4 w-4" />
                    <span>Admin</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {selectedRole === 'admin'
                ? 'Admins can manage organization settings and members'
                : 'Members have basic access to organization resources'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !selectedUserId}>
            {isSubmitting ? 'Adding...' : 'Add Member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 