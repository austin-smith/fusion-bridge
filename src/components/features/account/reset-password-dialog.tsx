'use client';

import React, { useRef, useEffect, useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
// Revert to using the server action for now
import { resetUserPassword } from '@/lib/actions/user-actions';
import type { User } from '@/lib/actions/user-actions';
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
  DialogClose // Removed DialogTrigger as it's handled externally
} from "@/components/ui/dialog";
import { Loader2, KeyRound, Eye, EyeOff } from "lucide-react";
import { toast } from 'sonner';

// Define initial state for the reset action
const initialResetState = {
    success: false,
    message: undefined,
};

interface ResetPasswordDialogProps {
    user: User;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ResetPasswordDialog({ user, isOpen, onOpenChange }: ResetPasswordDialogProps) {
    const [resetState, formAction, isPending] = useActionState(resetUserPassword, initialResetState);
    const formRef = useRef<HTMLFormElement>(null);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    // const [isLoading, setIsLoading] = useState(false); // Controlled by useActionState's isPending

    // Effect for feedback and closing dialog
    useEffect(() => {
        if (resetState.success && isOpen) { // Only act if dialog was open
            toast.success(resetState.message || 'Password reset successfully!');
            formRef.current?.reset();
            setShowNewPassword(false);
            setShowConfirmPassword(false);
            onOpenChange(false);
        }
        if (!resetState.success && resetState.message && isOpen) { // Only show error if dialog was open
            toast.error(resetState.message);
            // Do not close dialog on error, allow user to correct
        }
    }, [resetState, onOpenChange, isOpen]);

    // Reset form visual state when dialog closes manually or after successful action
    const handleOpenChange = (open: boolean) => {
        if (!open) {
            formRef.current?.reset(); // Reset form fields
            setShowNewPassword(false);
            setShowConfirmPassword(false);
            // useActionState will reset its internal state if the key/action changes or component unmounts
        }
        onOpenChange(open);
    };

    // No separate handleSubmit needed when using useActionState and form action
    // Input values are now taken from FormData by the server action

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[425px] p-0">
                <DialogHeader className="p-6 pb-4">
                    <DialogTitle>Reset Password for {user.name || user.email}</DialogTitle>
                    <DialogDescription>
                        Enter a new password for this user. They will not be notified.
                    </DialogDescription>
                </DialogHeader>
                {/* Form uses the action from useActionState */}
                <form action={formAction} ref={formRef}>
                    <input type="hidden" name="userId" value={user.id} />
                    
                    <div className="px-6 py-4 space-y-4 border-t">
                        <div className="space-y-1">
                            <Label htmlFor={`reset-newPassword-${user.id}`}>New Password</Label>
                            <div className="relative">
                                <Input
                                    id={`reset-newPassword-${user.id}`}
                                    name="newPassword" // Name attribute is used by FormData
                                    type={showNewPassword ? 'text' : 'password'}
                                    required
                                    minLength={8}
                                    placeholder="Min 8 characters"
                                    autoComplete="new-password"
                                    // Value and onChange are not needed when using FormData with server actions directly
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
                        <div className="space-y-1">
                            <Label htmlFor={`reset-confirmPassword-${user.id}`}>Confirm New Password</Label>
                            <div className="relative">
                                <Input
                                    id={`reset-confirmPassword-${user.id}`}
                                    name="confirmPassword" // Name attribute is used by FormData
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    required
                                    minLength={8}
                                    placeholder="Min 8 characters"
                                    autoComplete="new-password"
                                    // Value and onChange are not needed
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
                             <Button type="button" variant="outline" disabled={isPending}>Cancel</Button>
                         </DialogClose>
                         {/* Submit button's pending state is handled by isPending from useActionState */}
                         <Button type="submit" disabled={isPending} size="sm">
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4"/>}
                            {isPending ? 'Resetting...' : 'Reset Password'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// The separate ResetPasswordSubmitButton is no longer needed as its logic is integrated above
// and useFormStatus is for forms directly calling server actions without React state for pending.
// useActionState provides its own isPending. 