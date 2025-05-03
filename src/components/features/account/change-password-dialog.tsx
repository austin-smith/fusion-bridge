'use client';

import React, { useRef, useEffect, useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { updateCurrentUserPassword } from '@/lib/actions/user-actions';
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
import { Separator } from "@/components/ui/separator";

// Define initial state for the PASSWORD update action
const initialPasswordState = {
    success: false,
    message: undefined,
};

interface ChangePasswordDialogProps {
    children: React.ReactNode; // To wrap the trigger button
}

export function ChangePasswordDialog({ children }: ChangePasswordDialogProps) {
    const [open, setOpen] = useState(false);
    const [passwordState, passwordFormAction] = useActionState(updateCurrentUserPassword, initialPasswordState);
    const formRef = useRef<HTMLFormElement>(null);
    // State for password visibility
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Effect for Password Form feedback and closing dialog
    useEffect(() => {
        if (passwordState.success) {
            toast.success(passwordState.message || 'Password updated successfully!');
            formRef.current?.reset();
            // Reset visibility toggles on success
            setShowCurrentPassword(false);
            setShowNewPassword(false);
            setShowConfirmPassword(false);
            setOpen(false); // Close dialog on success
        }
        if (!passwordState.success && passwordState.message) {
            toast.error(passwordState.message);
        }
    }, [passwordState]);

    // Reset form when dialog closes manually
    const handleOpenChange = (isOpen: boolean) => {
        if (!isOpen) {
            formRef.current?.reset();
            // Reset visibility toggles on close
            setShowCurrentPassword(false);
            setShowNewPassword(false);
            setShowConfirmPassword(false);
        }
        setOpen(isOpen);
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="p-0">
                <DialogHeader className="p-6 pb-4">
                    <DialogTitle>Change Password</DialogTitle>
                    <DialogDescription>
                        Enter your current password and choose a new one.
                    </DialogDescription>
                </DialogHeader>
                <form action={passwordFormAction} ref={formRef}>
                    <div className="px-6 py-4 space-y-4 border-t">
                        {/* Current Password */}
                        <div className="space-y-1">
                            <Label htmlFor="currentPasswordDialog">Current Password</Label>
                            <div className="relative">
                                <Input
                                    id="currentPasswordDialog"
                                    name="currentPassword"
                                    type={showCurrentPassword ? 'text' : 'password'}
                                    required
                                />
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="icon" 
                                    className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground"
                                    onClick={() => setShowCurrentPassword(!showCurrentPassword)} 
                                    aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showCurrentPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                                </Button>
                            </div>
                        </div>

                        {/* --- Add Separator Here --- */}
                        <Separator />

                        {/* New Password */}
                        <div className="space-y-1">
                            <Label htmlFor="newPasswordDialog">New Password</Label>
                             <div className="relative">
                                <Input
                                    id="newPasswordDialog"
                                    name="newPassword"
                                    type={showNewPassword ? 'text' : 'password'}
                                    required
                                    minLength={8}
                                    placeholder="Min 8 characters"
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
                            <Label htmlFor="confirmPasswordDialog">Confirm New Password</Label>
                             <div className="relative">
                                <Input
                                    id="confirmPasswordDialog"
                                    name="confirmPassword"
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    required
                                    minLength={8}
                                    placeholder="Min 8 characters"
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
                        <PasswordSubmitButton />
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// Submit Button specific for the password dialog form
function PasswordSubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" disabled={pending} size="sm" className="w-full sm:w-auto">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4"/>}
            {pending ? 'Updating...' : 'Update Password'}
        </Button>
    );
} 