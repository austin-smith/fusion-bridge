'use client';

import React, { useRef, useEffect, useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { resetUserPassword } from '@/lib/actions/user-actions'; // Import the new action
import type { User } from '@/lib/actions/user-actions'; // Import User type
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import { Loader2, KeyRound, Eye, EyeOff } from "lucide-react";
import { toast } from 'sonner';

// Define initial state for the reset action
const initialResetState = {
    success: false,
    message: undefined,
};

interface ResetPasswordDialogProps {
    user: User; // Pass the full user object for context
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ResetPasswordDialog({ user, isOpen, onOpenChange }: ResetPasswordDialogProps) {
    // Use specific initial state for this form
    const [resetState, formAction] = useActionState(resetUserPassword, initialResetState);
    const formRef = useRef<HTMLFormElement>(null);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Effect for feedback and closing dialog
    useEffect(() => {
        if (resetState.success) {
            toast.success(resetState.message || 'Password reset successfully!');
            formRef.current?.reset();
            setShowNewPassword(false);
            setShowConfirmPassword(false);
            onOpenChange(false); // Close dialog on success using the callback prop
        }
        if (!resetState.success && resetState.message) {
            toast.error(resetState.message);
        }
    }, [resetState, onOpenChange]);

    // Reset form when dialog closes manually
    const handleOpenChange = (open: boolean) => {
        if (!open) {
            formRef.current?.reset();
            setShowNewPassword(false);
            setShowConfirmPassword(false);
        }
        onOpenChange(open); // Use the callback prop to control external state
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            {/* Trigger is handled externally in UserActionsCell */}
            {/* <DialogTrigger asChild>{children}</DialogTrigger> */}
            <DialogContent className="sm:max-w-[425px] p-0">
                <DialogHeader className="p-6 pb-4">
                    <DialogTitle>Reset Password for {user.name || user.email}</DialogTitle>
                    <DialogDescription>
                        Enter a new password for this user. They will not be notified.
                    </DialogDescription>
                </DialogHeader>
                <form action={formAction} ref={formRef}>
                     {/* Hidden input for userId */}
                    <input type="hidden" name="userId" value={user.id} />
                    
                    <div className="px-6 py-4 space-y-4 border-t">
                        {/* New Password */}
                        <div className="space-y-1">
                            <Label htmlFor={`reset-newPassword-${user.id}`}>New Password</Label>
                            <div className="relative">
                                <Input
                                    id={`reset-newPassword-${user.id}`}
                                    name="newPassword"
                                    type={showNewPassword ? 'text' : 'password'}
                                    required
                                    minLength={8}
                                    placeholder="Min 8 characters"
                                    autoComplete="new-password"
                                />
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="icon" 
                                    className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground"
                                    onClick={() => setShowNewPassword(!showNewPassword)} 
                                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showNewPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                                </Button>
                            </div>
                        </div>
                        {/* Confirm New Password */}
                        <div className="space-y-1">
                            <Label htmlFor={`reset-confirmPassword-${user.id}`}>Confirm New Password</Label>
                            <div className="relative">
                                <Input
                                    id={`reset-confirmPassword-${user.id}`}
                                    name="confirmPassword"
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    required
                                    minLength={8}
                                    placeholder="Min 8 characters"
                                    autoComplete="new-password"
                                />
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="icon" 
                                    className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)} 
                                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showConfirmPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                                </Button>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="px-6 py-4 border-t bg-muted/40">
                         <DialogClose asChild>
                             <Button type="button" variant="outline">Cancel</Button>
                         </DialogClose>
                         <ResetPasswordSubmitButton />
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// Submit Button specific for the reset password dialog form
function ResetPasswordSubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" disabled={pending} size="sm">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4"/>}
            {pending ? 'Resetting...' : 'Reset Password'}
        </Button>
    );
} 