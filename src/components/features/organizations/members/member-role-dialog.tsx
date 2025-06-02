'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Shield, UserCircle2, User } from 'lucide-react';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth/client';
import { useRouter } from 'next/navigation';
import type { OrganizationMemberWithUser } from './organization-members-table';

interface MemberRoleDialogProps {
  member: OrganizationMemberWithUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MemberRoleDialog({ member, open, onOpenChange }: MemberRoleDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>(member.role);
  const router = useRouter();

  const handleSubmit = async () => {
    if (selectedRole === member.role) {
      toast.info('No changes made');
      onOpenChange(false);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await authClient.organization.updateMemberRole({
        memberId: member.id,
        role: selectedRole as 'member' | 'admin' | 'owner',
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to update role');
      }

      toast.success(`Role updated to ${selectedRole} for ${member.user.name || member.user.email}`);
      router.refresh();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating member role:', error);
      toast.error(error.message || 'Failed to update role');
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleOptions = [
    { value: 'member', label: 'Member', icon: User, description: 'Basic access to organization resources' },
    { value: 'admin', label: 'Admin', icon: UserCircle2, description: 'Can manage organization settings and members' },
  ];

  // Don't show owner role as an option (owners cannot be changed)
  if (member.role === 'owner') {
    roleOptions.push({ 
      value: 'owner', 
      label: 'Owner', 
      icon: Shield, 
      description: 'Full control over the organization (cannot be changed)' 
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Change Member Role</DialogTitle>
          <DialogDescription>
            Update the role for {member.user.name || member.user.email}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="role">Role</Label>
            <Select 
              value={selectedRole} 
              onValueChange={setSelectedRole}
              disabled={member.role === 'owner'}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <SelectItem 
                      key={option.value} 
                      value={option.value}
                      disabled={option.value === 'owner'}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span>{option.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {roleOptions.find(r => r.value === selectedRole)?.description}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || selectedRole === member.role || member.role === 'owner'}
          >
            {isSubmitting ? 'Updating...' : 'Update Role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 