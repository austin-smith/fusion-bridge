'use client';

import React, { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Card,
    CardContent,
    CardDescription,
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
} from "@/components/ui/alert-dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2, ShieldCheck, ShieldOff, Check, Copy, AlertTriangle, Hash, Key } from "lucide-react";
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';
import { ChangePasswordDialog } from '@/components/features/account/change-password-dialog';
import { PinManagementDialog } from '@/components/features/account/pin-management-dialog';
import { useFusionStore } from '@/stores/store';
import { authClient } from '@/lib/auth/client';
import QRCode from "react-qr-code";

interface UserData {
    id: string;
    name: string;
    email: string;
    image: string | null;
    twoFactorEnabled: boolean;
    keypadPin?: string | null;
    keypadPinSetAt?: Date | null;
}

interface SecuritySettingsProps {
    user: UserData;
}

enum TwoFactorStep {
    Idle,
    ConfirmPassword,
    ShowQrAndVerify,
    ConfirmDisable,
    ShowNewBackupCodes,
}

export function SecuritySettings({ user }: SecuritySettingsProps) {
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
    
    // PIN management state
    const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);

    // Store actions and state
    const { setUserPin, removeUserPin, getPinStatus, setPinStatus } = useFusionStore();
    const pinStatus = getPinStatus(user.id);

    // Initialize PIN status in store from user prop
    useEffect(() => {
        setPinStatus(user.id, Boolean(user.keypadPin), user.keypadPinSetAt || null);
    }, [user.id, user.keypadPin, user.keypadPinSetAt, setPinStatus]);

    // Create user object with current PIN status for dialog
    const userWithPinData = {
        ...user,
        keypadPin: pinStatus.hasPin ? 'SET' : null,
        keypadPinSetAt: pinStatus.setAt,
    };

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

    useEffect(() => {
        setTwoFactorEnabled(user.twoFactorEnabled);
    }, [user.twoFactorEnabled]);

    const handlePasswordConfirm = async (event?: React.FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        if (!intendedAction) return;
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
                    const enableResult = await authClient.twoFactor.enable({ password: currentPassword });
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
                    setTwoFactorStep(TwoFactorStep.ConfirmDisable);
                    break;
                case 'regenerate':
                    const regenResult = await authClient.twoFactor.generateBackupCodes({ password: currentPassword });
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
        } catch (err: any) {
            setPasswordError(err?.message || "Incorrect password or server error.");
            setIs2faLoading(false);
        }
    };

    const handleVerifyAndCompleteEnable = async () => {
        if (verificationCode.length !== 6) {
            setVerificationError("Please enter a 6-digit code.");
            return;
        }
        setIs2faLoading(true);
        setVerificationError(null);

        try {
            await authClient.twoFactor.verifyTotp({ code: verificationCode });
            toast.success("Two-Factor Authentication enabled successfully!");
            setTwoFactorEnabled(true);
            const currentUser = useFusionStore.getState().currentUser;
            if (currentUser) {
                useFusionStore.getState().setCurrentUser({ ...currentUser, twoFactorEnabled: true });
            }
            resetTwoFactorState();
        } catch (err: any) {
            setVerificationError(err?.message || "Invalid code. Please try again.");
            setIs2faLoading(false);
        }
    };

    const handleConfirmDisable = async () => {
        setIs2faLoading(true);
        try {
            await authClient.twoFactor.disable({ password: currentPassword });
            toast.success("Two-Factor Authentication disabled.");
            setTwoFactorEnabled(false);
             const currentUser = useFusionStore.getState().currentUser;
            if (currentUser) {
                useFusionStore.getState().setCurrentUser({ ...currentUser, twoFactorEnabled: false });
            }
            resetTwoFactorState();
        } catch (err: any) {
            toast.error(err?.message || "Failed to disable 2FA. Please try again.");
            resetTwoFactorState(); 
        }
    };

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
    
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            toast.success("Copied to clipboard!");
        }, (err) => {
            toast.error("Failed to copy.");
            console.error('Could not copy text: ', err);
        });
    };

    // Helper function to format date for PIN display
    const formatPinDate = (date: Date | string | null) => {
        if (!date) return '';
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(dateObj);
    };

    return (
        <>
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
                    {/* Regenerate Backup Codes Button */}
                    {twoFactorEnabled && (
                        <div className="pt-2">
                            <Button variant="outline" size="sm" onClick={handleRegenerateBackupCodes} disabled={is2faLoading}>
                                {is2faLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Regenerate Backup Codes
                            </Button>
                        </div>
                    )}

                    <Separator />

                    {/* Keypad PIN Management */}
                    <div className="space-y-2">
                        <Label className="text-base font-semibold">Keypad PIN</Label>
                        {pinStatus.hasPin ? (
                            <div className="flex items-center justify-between p-3 rounded-md border border-green-200 bg-green-50">
                                <div className="flex items-center gap-2">
                                    <Hash className="h-5 w-5 text-green-600" />
                                    <div className="flex flex-col">
                                        <p className="text-sm text-green-700 font-medium">Keypad PIN is active.</p>
                                        {pinStatus.setAt && (
                                            <p className="text-xs text-green-600">
                                                Set on {formatPinDate(pinStatus.setAt)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => setIsPinDialogOpen(true)}>
                                    <Key className="h-4 w-4" />
                                    Manage PIN
                                </Button>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between p-3 rounded-md border border-gray-200 bg-gray-50">
                                <div className="flex items-center gap-2">
                                    <Hash className="h-5 w-5 text-gray-500" />
                                    <p className="text-sm text-gray-700 font-medium">Set a PIN to arm/disarm the alarm using the keypad.</p>
                                </div>
                                <Button variant="default" size="sm" onClick={() => setIsPinDialogOpen(true)}>
                                    <Hash className="h-4 w-4" />
                                    Set PIN
                                </Button>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* PIN Management Dialog */}
            <PinManagementDialog 
                user={userWithPinData as any}
                isOpen={isPinDialogOpen}
                onOpenChange={setIsPinDialogOpen}
                isSelfService={true}
            />

            {/* 2FA Dialogs */}
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
                    <form onSubmit={handlePasswordConfirm}>
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
                            <Button type="submit" disabled={is2faLoading || !currentPassword}>
                                {is2faLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Confirm Password
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={twoFactorStep === TwoFactorStep.ShowQrAndVerify} onOpenChange={(open) => !open && resetTwoFactorState()}>
                 <DialogContent className="sm:max-w-[550px]">
                    <DialogHeader>
                        <DialogTitle>Enable Two-Factor Authentication</DialogTitle>
                        <DialogDescription>
                            Scan the QR code with your authenticator app, then enter the code below.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                        <div className="flex flex-col items-center justify-center space-y-3 p-4 bg-muted rounded-md">
                             {totpUri ? (
                                <div className="bg-white p-3 rounded-lg shadow">
                                    <QRCode value={totpUri} size={160} level="M" />
                                </div>
                            ) : (
                                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                            )}
                             <p className="text-xs text-muted-foreground text-center">Scan with your authenticator app</p>
                         </div>

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
                                    containerClassName="justify-start mt-1"
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
                                <p className="text-xs text-muted-foreground mb-2">Store these codes securely for emergency access.</p>
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

            <Dialog open={twoFactorStep === TwoFactorStep.ShowNewBackupCodes} onOpenChange={(open) => !open && resetTwoFactorState()}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New Backup Codes Generated</DialogTitle>
                         <DialogDescription>
                            Your old backup codes have been invalidated. Store these new codes securely. 
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
                            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
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
        </>
    );
} 