'use client';

import React, { useRef, useEffect, useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { updateCurrentUser } from '@/lib/actions/user-actions';
import type { UpdateUserResult } from '@/lib/actions/user-actions'; // Import result type
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"; // Using shadcn InputOTP
import { Loader2, Trash2, Pencil, ShieldCheck, ShieldOff, Check, Copy, AlertTriangle } from "lucide-react"; // Added more icons
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ChangePasswordDialog } from './change-password-dialog';
import { useFusionStore } from '@/stores/store'; // Import Zustand store
import { authClient } from '@/lib/auth/client'; // Import authClient
import QRCode from "react-qr-code"; // Import QR Code component

// Define the expected user prop structure
interface UserData {
    id: string;
    name: string;
    email: string;
    image: string | null;
    twoFactorEnabled: boolean;
}

interface AccountSettingsFormProps {
    user: UserData;
}

// Define initial state for the PROFILE update action
// Ensure this matches the expected prevState type for useActionState
const initialProfileState: UpdateUserResult = { 
    success: false,
    message: undefined,
    updatedUser: null,
};

// Enum for 2FA dialog steps
enum TwoFactorStep {
    Idle,
    ConfirmPassword,
    ShowQrAndVerify,
    ConfirmDisable,
    ShowNewBackupCodes,
}

export function AccountSettingsForm({ user }: AccountSettingsFormProps) {
    // Profile Form State - use extended result type
    const [profileState, profileFormAction] = useActionState<UpdateUserResult, FormData>(updateCurrentUser, initialProfileState);
    const profileFormRef = useRef<HTMLFormElement>(null);
    
    // State for Image URL management via Popover
    const [imageUrlToSubmit, setImageUrlToSubmit] = useState<string>(user.image ?? '');
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [popoverImageUrl, setPopoverImageUrl] = useState<string>(user.image ?? '');

    // --- NEW: 2FA State --- 
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(user.twoFactorEnabled);
    const [is2faLoading, setIs2faLoading] = useState(false);
    const [twoFactorStep, setTwoFactorStep] = useState<TwoFactorStep>(TwoFactorStep.Idle);
    const [currentPassword, setCurrentPassword] = useState('');
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [totpUri, setTotpUri] = useState<string | null>(null);
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [verificationCode, setVerificationCode] = useState('');
    const [verificationError, setVerificationError] = useState<string | null>(null);
    const [intendedAction, setIntendedAction] = useState<'enable' | 'disable' | 'regenerate' | null>(null);

    const userInitial = user.name ? user.name.charAt(0).toUpperCase() : (user.email ? user.email.charAt(0).toUpperCase() : '?');

    // --- Helper to Reset 2FA State --- 
    const resetTwoFactorState = () => {
        setIs2faLoading(false);
        setTwoFactorStep(TwoFactorStep.Idle);
        setCurrentPassword('');
        setPasswordError(null);
        setTotpUri(null);
        setBackupCodes([]);
        setVerificationCode('');
        setVerificationError(null);
        setIntendedAction(null);
    }

    // Effect for Profile Form feedback - update store on success
    useEffect(() => {
        if (profileState.success) {
            toast.success(profileState.message || 'Profile updated successfully!');
            // Sync popover input with the state that will be used for display
            if (profileState.updatedUser) {
                setImageUrlToSubmit(profileState.updatedUser.image ?? ''); // Update image URL state used by Avatar
                setPopoverImageUrl(profileState.updatedUser.image ?? ''); // Sync popover input
                // Update global store - Ensure updatedUser includes 2FA status if changed
                useFusionStore.getState().setCurrentUser(profileState.updatedUser);
                console.log("[AccountSettingsForm] Updated currentUser in Zustand store.");
            } else {
                 // If for some reason updatedUser isn't returned, sync with local state
                 setPopoverImageUrl(imageUrlToSubmit);
            }
        }
        if (!profileState.success && profileState.message) {
            toast.error(profileState.message);
        }
        // Only depend on profileState and imageUrlToSubmit now
    }, [profileState, imageUrlToSubmit]); 

    // Sync local 2FA state if prop changes (e.g., after successful enable/disable)
    useEffect(() => {
        setTwoFactorEnabled(user.twoFactorEnabled);
    }, [user.twoFactorEnabled]);

    // Handle saving URL from popover
    const handlePopoverSave = () => {
        setImageUrlToSubmit(popoverImageUrl);
        setPopoverOpen(false);
    };

    // Handle removing photo from popover
    const handlePopoverRemove = () => {
        setImageUrlToSubmit('');
        setPopoverImageUrl('');
        setPopoverOpen(false);
    };

    // Handle opening popover - sync input field with current saved URL
    const handlePopoverOpenChange = (open: boolean) => {
        if (open) {
            setPopoverImageUrl(imageUrlToSubmit); // Sync input on open
        }
        setPopoverOpen(open);
    }

    // --- Password Confirmation Handler ---
    const handlePasswordConfirm = async () => {
        if (!intendedAction) return; // Should not happen
        if (!currentPassword) {
            setPasswordError("Password is required.");
            return;
        }
        
        setIs2faLoading(true);
        setPasswordError(null);
        setVerificationError(null);

        try {
            switch (intendedAction) {
                case 'enable':
                    console.log("Attempting to enable 2FA...");
                    const enableResult = await authClient.twoFactor.enable({ password: currentPassword });
                    console.log("Enable result:", enableResult);
                    if (enableResult.error) {
                        throw new Error(enableResult.error.message || 'Failed to initiate 2FA setup.');
                    }
                    if (!enableResult.data) {
                        throw new Error('Missing data in 2FA enable response.');
                    }
                    setTotpUri(enableResult.data.totpURI);
                    setBackupCodes(enableResult.data.backupCodes);
                    setTwoFactorStep(TwoFactorStep.ShowQrAndVerify);
                    setIs2faLoading(false);
                    break;
                case 'disable':
                     console.log("Password confirmed for disabling 2FA, proceeding to confirmation...");
                    // Password confirmed, move to the final alert dialog confirmation
                    setTwoFactorStep(TwoFactorStep.ConfirmDisable);
                    break;
                case 'regenerate':
                    console.log("Attempting to regenerate backup codes...");
                    const regenResult = await authClient.twoFactor.generateBackupCodes({ password: currentPassword });
                    console.log("Regen result:", regenResult);
                    if (regenResult.error) {
                        throw new Error(regenResult.error.message || 'Failed to regenerate backup codes.');
                    }
                     if (!regenResult.data) {
                        throw new Error('Missing data in backup code regeneration response.');
                    }
                    setBackupCodes(regenResult.data.backupCodes);
                    setTwoFactorStep(TwoFactorStep.ShowNewBackupCodes);
                    setIs2faLoading(false);
                    break;
            }
            // Keep loading state until next step or if error below
            // setIs2faLoading(false); // This comment is now obsolete

        } catch (err: any) {
            console.error(`Error during password confirmation for ${intendedAction}:`, err);
            setPasswordError(err?.message || "Incorrect password or server error.");
            setIs2faLoading(false); // Stop loading on error
        }
    };

    // --- QR/Verification Handler ---
    const handleVerifyAndCompleteEnable = async () => {
        if (verificationCode.length !== 6) {
            setVerificationError("Please enter a 6-digit code.");
            return;
        }
        setIs2faLoading(true);
        setVerificationError(null);

        try {
            console.log("Verifying TOTP code...");
            await authClient.twoFactor.verifyTotp({ code: verificationCode });
            console.log("TOTP verification successful!");
            toast.success("Two-Factor Authentication enabled successfully!");
            setTwoFactorEnabled(true); // Update local state visually
            // Update user in Zustand store - Fetch updated user data if needed or manually update
            const currentUser = useFusionStore.getState().currentUser;
            if (currentUser) {
                useFusionStore.getState().setCurrentUser({ ...currentUser, twoFactorEnabled: true });
            }
            resetTwoFactorState();
        } catch (err: any) {
            console.error("Error verifying TOTP code:", err);
            setVerificationError(err?.message || "Invalid code. Please try again.");
            setIs2faLoading(false);
        }
    };

    // --- Disable Confirmation Handler ---
    const handleConfirmDisable = async () => {
        setIs2faLoading(true); // Set loading for the alert dialog action
        try {
            console.log("Disabling 2FA...");
            // Password was already confirmed, proceed to disable
            await authClient.twoFactor.disable({ password: currentPassword }); // Still need password here per docs
            console.log("2FA disabled successfully.");
            toast.success("Two-Factor Authentication disabled.");
            setTwoFactorEnabled(false);
             // Update user in Zustand store
             const currentUser = useFusionStore.getState().currentUser;
            if (currentUser) {
                useFusionStore.getState().setCurrentUser({ ...currentUser, twoFactorEnabled: false });
            }
            resetTwoFactorState(); // Close dialogs and reset state
        } catch (err: any) {
            // Error during disable (should be rare if password check passed, but handle anyway)
            console.error("Error disabling 2FA:", err);
            toast.error(err?.message || "Failed to disable 2FA. Please try again.");
            // Reset state but maybe leave password dialog open? Or just reset fully.
            resetTwoFactorState(); 
        }
    };

    // --- Trigger Handlers --- 
    const handleEnable2FA = () => {
        resetTwoFactorState();
        setIntendedAction('enable');
        setTwoFactorStep(TwoFactorStep.ConfirmPassword);
    }

    const handleDisable2FA = () => {
        resetTwoFactorState();
        setIntendedAction('disable');
        setTwoFactorStep(TwoFactorStep.ConfirmPassword);
    }

    const handleRegenerateBackupCodes = () => {
        resetTwoFactorState();
        setIntendedAction('regenerate');
        setTwoFactorStep(TwoFactorStep.ConfirmPassword);
    }
    
     // --- Backup Code Copy Helper ---
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            toast.success("Copied to clipboard!");
        }, (err) => {
            toast.error("Failed to copy.");
            console.error('Could not copy text: ', err);
        });
    };

    return (
        <div className="space-y-6"> 
            {/* --- Profile Card --- */}
            <Card>
                <CardHeader className="items-center text-center">
                    {/* --- Container for Avatar and Edit Button - Wrapped by Popover --- */}
                    <Popover open={popoverOpen} onOpenChange={handlePopoverOpenChange}>
                        <PopoverTrigger asChild>
                           {/* This div is the trigger area */}
                           <div 
                             className="relative mb-4 inline-block group cursor-pointer rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" 
                             tabIndex={0}
                             role="button"
                             aria-label="Edit profile picture"
                           > 
                                <Avatar className="h-20 w-20"> 
                                    <AvatarImage src={imageUrlToSubmit || undefined} alt={user.name} className="object-cover" />
                                    <AvatarFallback className="text-2xl">{userInitial}</AvatarFallback>
                                </Avatar>

                                {/* Visual cue - non-interactive */}
                                <div 
                                    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full border-2 bg-background flex items-center justify-center pointer-events-none"
                                >
                                    <Pencil className="h-4 w-4 text-foreground" />
                                </div>
                            </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-4 space-y-3">
                           <div className="space-y-1">
                                <Label htmlFor="popover-image-url">Image URL</Label>
                                <Input 
                                    id="popover-image-url"
                                    value={popoverImageUrl}
                                    onChange={(e) => setPopoverImageUrl(e.target.value)}
                                    placeholder="https://example.com/avatar.png"
                                />
                            </div>
                            <div className="flex justify-between items-center pt-2">
                                <Button variant="ghost" size="sm" onClick={handlePopoverRemove} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Remove
                                </Button>
                                <Button size="sm" onClick={handlePopoverSave}>
                                    Save
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                    {/* --- End Popover --- */}
                    
                    <CardTitle>Profile Details</CardTitle>
                    <CardDescription>Update your name and profile picture.</CardDescription>
                </CardHeader>
                <form action={profileFormAction} ref={profileFormRef}>
                    <input type="hidden" name="image" value={imageUrlToSubmit} />
                    <CardContent className="space-y-4 pt-4">
                        <div className="space-y-1">
                            <Label htmlFor="settings-name">Name</Label>
                            <Input id="settings-name" name="name" required defaultValue={user.name} />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="settings-email">Email</Label>
                            <Input id="settings-email" name="email" type="email" disabled value={user.email} />
                        </div>
                    </CardContent>
                    <CardFooter className="border-t px-6 py-4">
                        <SubmitButton />
                    </CardFooter>
                </form>
            </Card>

            {/* --- Security Section --- */}
            <Card>
                <CardHeader>
                    <CardTitle>Security</CardTitle>
                    <CardDescription>Manage your account security settings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Password Change */}
                    <div>
                         <ChangePasswordDialog>
                            <Button variant="outline" size="sm">Change Password</Button>
                        </ChangePasswordDialog>
                    </div>

                    <Separator />

                    {/* Two-Factor Authentication */}
                    <div className="space-y-2">
                        <Label className="text-base font-semibold">Two-Factor Authentication (2FA)</Label>
                        {twoFactorEnabled ? (
                            <div className="flex items-center justify-between p-3 rounded-md border border-green-200 bg-green-50">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck className="h-5 w-5 text-green-600" />
                                    <p className="text-sm text-green-700 font-medium">2FA is enabled for your account.</p>
                                </div>
                                <Button variant="destructive" size="sm" onClick={handleDisable2FA} disabled={is2faLoading}>
                                    {is2faLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    Disable 2FA
                                </Button>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between p-3 rounded-md border border-amber-200 bg-amber-50">
                                <div className="flex items-center gap-2">
                                    <ShieldOff className="h-5 w-5 text-amber-600" />
                                    <p className="text-sm text-amber-700 font-medium">Enhance security by enabling 2FA.</p>
                                </div>
                                <Button variant="default" size="sm" onClick={handleEnable2FA} disabled={is2faLoading}>
                                    {is2faLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    Enable 2FA
                                </Button>
                             </div>
                        )}
                    </div>
                    {/* Regenerate Backup Codes Button (only if 2FA enabled) */}
                    {twoFactorEnabled && (
                        <div className="pt-2">
                            <Button variant="outline" size="sm" onClick={handleRegenerateBackupCodes} disabled={is2faLoading}>
                                {is2faLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Regenerate Backup Codes
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* --- 2FA Dialogs --- */}

            {/* 1. Password Confirmation Dialog */}
            <Dialog open={twoFactorStep === TwoFactorStep.ConfirmPassword} onOpenChange={(open) => !open && resetTwoFactorState()}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Your Password</DialogTitle>
                        <DialogDescription>
                            For your security, please enter your current password to proceed with 
                            {intendedAction === 'enable' && ' enabling two-factor authentication.'}
                            {intendedAction === 'disable' && ' disabling two-factor authentication.'}
                            {intendedAction === 'regenerate' && ' regenerating backup codes.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                        <Label htmlFor="confirm-password">Current Password</Label>
                        <Input 
                            id="confirm-password"
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            disabled={is2faLoading}
                            required
                            autoComplete="current-password"
                        />
                        {passwordError && (
                            <p className="text-sm text-destructive">{passwordError}</p>
                        )}
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                             <Button variant="outline" onClick={resetTwoFactorState}>Cancel</Button>
                        </DialogClose>
                        <Button onClick={handlePasswordConfirm} disabled={is2faLoading || !currentPassword}>
                             {is2faLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                             Confirm Password
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 2. Enable 2FA - Show QR & Verify Dialog */}
            <Dialog open={twoFactorStep === TwoFactorStep.ShowQrAndVerify} onOpenChange={(open) => !open && resetTwoFactorState()}>
                 <DialogContent className="sm:max-w-[550px]">
                    <DialogHeader>
                        <DialogTitle>Enable Two-Factor Authentication</DialogTitle>
                        <DialogDescription>
                            Scan the QR code with your authenticator app (e.g., Google Authenticator, Authy), then enter the code below.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                        {/* QR Code Section */}
                        <div className="flex flex-col items-center justify-center space-y-3 p-4 bg-muted rounded-md">
                             {totpUri ? (
                                <div className="bg-white p-3 rounded-lg shadow">
                                    <QRCode value={totpUri} size={160} level="M" />
                                </div>
                            ) : (
                                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                            )}
                             <p className="text-xs text-muted-foreground text-center">Scan with your authenticator app</p>
                             {/* Optional: Show secret manually */} 
                            {/* <details className="text-xs"> <summary>Show Secret</summary> <code className="block break-all p-1 bg-background rounded">{totpUri?.split('secret=')[1]?.split('&')[0]}</code> </details> */} 
                         </div>

                        {/* Verification and Backup Codes Section */}
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="verification-code">Verification Code</Label>
                                <InputOTP 
                                    id="verification-code"
                                    maxLength={6} 
                                    value={verificationCode} 
                                    onChange={(value: string) => setVerificationCode(value)} 
                                    disabled={is2faLoading}
                                    autoComplete="one-time-code"
                                    containerClassName="justify-start mt-1" // Align left
                                >
                                    <InputOTPGroup>
                                        <InputOTPSlot index={0} />
                                        <InputOTPSlot index={1} />
                                        <InputOTPSlot index={2} />
                                        <InputOTPSlot index={3} />
                                        <InputOTPSlot index={4} />
                                        <InputOTPSlot index={5} />
                                    </InputOTPGroup>
                                </InputOTP>
                                {verificationError && (
                                    <p className="text-sm text-destructive mt-1">{verificationError}</p>
                                )}
                             </div>

                            <div>
                                <Label className="font-medium">Save Your Backup Codes</Label>
                                <p className="text-xs text-muted-foreground mb-2">If you lose access to your authenticator app, you can use these codes to sign in. Store them securely!</p>
                                {backupCodes.length > 0 ? (
                                    <div className="space-y-1 font-mono text-sm p-3 bg-secondary rounded-md max-h-32 overflow-y-auto">
                                        {backupCodes.map((code) => (
                                            <div key={code} className="flex items-center justify-between">
                                                <span>{code}</span>
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(code)}>
                                                    <Copy className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                )}
                                <Button 
                                    variant="secondary" 
                                    size="sm" 
                                    className="mt-2 w-full" 
                                    onClick={() => copyToClipboard(backupCodes.join('\n'))}
                                    disabled={backupCodes.length === 0}
                                >
                                    <Copy className="h-4 w-4"/> Copy All Codes
                                </Button>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline" onClick={resetTwoFactorState}>Cancel</Button>
                        </DialogClose>
                        <Button onClick={handleVerifyAndCompleteEnable} disabled={is2faLoading || verificationCode.length < 6}>
                            {is2faLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Verify & Enable
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 3. Disable 2FA Confirmation (AlertDialog) */}
            <AlertDialog open={twoFactorStep === TwoFactorStep.ConfirmDisable} onOpenChange={(open) => !open && resetTwoFactorState()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Disable Two-Factor Authentication?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove the extra layer of security from your account. 
                            Are you sure you want to proceed?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                         <AlertDialogCancel onClick={resetTwoFactorState} disabled={is2faLoading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={handleConfirmDisable} 
                            disabled={is2faLoading}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                           {is2faLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                            Yes, Disable 2FA
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

             {/* 4. Show Newly Regenerated Backup Codes Dialog */}
            <Dialog open={twoFactorStep === TwoFactorStep.ShowNewBackupCodes} onOpenChange={(open) => !open && resetTwoFactorState()}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New Backup Codes Generated</DialogTitle>
                         <DialogDescription>
                            Your old backup codes have been invalidated. Store these new codes securely. 
                            You will need them if you lose access to your authenticator app.
                        </DialogDescription>
                    </DialogHeader>
                     <div className="py-4">
                         {backupCodes.length > 0 ? (
                            <div className="space-y-1 font-mono text-sm p-4 bg-secondary rounded-md max-h-40 overflow-y-auto">
                                {backupCodes.map((code) => (
                                    <div key={code} className="flex items-center justify-between">
                                        <span>{code}</span>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(code)}>
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <Loader2 className="h-6 w-6 animate-spin mx-auto" /> // Centered loader
                        )}
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="mt-3 w-full" 
                            onClick={() => copyToClipboard(backupCodes.join('\n'))}
                            disabled={backupCodes.length === 0}
                        >
                            <Copy className="h-4 w-4"/> Copy All Codes
                        </Button>
                     </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button onClick={resetTwoFactorState}>Close</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}

// Simplified Submit Button - Only handles Profile form now
function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" disabled={pending} className="ml-auto" size="sm">
            {/* Only show loader when pending, otherwise just text */}
            {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Save Changes
        </Button>
    );
} 