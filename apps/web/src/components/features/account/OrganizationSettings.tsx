'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2, Hash, Building2, Info, Trash2, Edit } from "lucide-react";
import { toast } from 'sonner';
import { useActiveOrganization } from '@/hooks/use-organization';
import { ApiKeysSettings } from '@/components/api-keys/ApiKeysSettings';
import { OrganizationLogoDisplay } from '@/components/features/organizations/organization-logo-selector';

interface UserData {
    id: string;
    name: string;
    email: string;
    image: string | null;
    twoFactorEnabled: boolean;
}

interface OrganizationSettingsProps {
    user: UserData;
}

export function OrganizationSettings({ user }: OrganizationSettingsProps) {
    const { data: organization, isPending: orgLoading } = useActiveOrganization();
    const [pinStatus, setPinStatus] = useState<{ hasPin: boolean; setAt: string | null }>({ hasPin: false, setAt: null });
    const [loadingPinStatus, setLoadingPinStatus] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dialogType, setDialogType] = useState<'set' | 'change' | 'remove'>('set');
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const checkPinStatus = useCallback(async () => {
        try {
            setLoadingPinStatus(true);
            const response = await fetch(`/api/users/${user.id}/keypad-pin`);
            
            if (response.ok) {
                const data = await response.json();
                setPinStatus({
                    hasPin: data.hasPin,
                    setAt: data.setAt
                });
            } else {
                console.error('Failed to check PIN status');
            }
        } catch (error) {
            console.error('Error checking PIN status:', error);
        } finally {
            setLoadingPinStatus(false);
        }
    }, [user.id]);

    // Load PIN status when organization changes
    useEffect(() => {
        if (organization?.id) {
            checkPinStatus();
        }
    }, [organization?.id, user.id, checkPinStatus]);

    const handleSubmitPin = async () => {
        if (!pin) {
            setError('Please enter a PIN');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/users/${user.id}/keypad-pin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ pin }),
            });

            const data = await response.json();

            if (response.ok) {
                toast.success(dialogType === 'set' ? 'PIN set successfully!' : 'PIN updated successfully!');
                setIsDialogOpen(false);
                resetForm();
                checkPinStatus(); // Refresh status
            } else {
                setError(data.error || 'Failed to set PIN');
            }
        } catch (error) {
            setError('Network error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemovePin = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/users/${user.id}/keypad-pin`, {
                method: 'DELETE',
            });

            const data = await response.json();

            if (response.ok) {
                toast.success('PIN removed successfully!');
                setIsDialogOpen(false);
                resetForm();
                checkPinStatus(); // Refresh status
            } else {
                setError(data.error || 'Failed to remove PIN');
            }
        } catch (error) {
            setError('Network error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setPin('');
        setError(null);
    };

    const openDialog = (type: 'set' | 'change' | 'remove') => {
        setDialogType(type);
        resetForm();
        setIsDialogOpen(true);
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '';
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(dateString));
    };

    if (orgLoading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                </CardContent>
            </Card>
        );
    }

    if (!organization) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Organization Settings
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2 p-4 bg-amber-50 border border-amber-200 rounded-md">
                        <Info className="h-5 w-5 text-amber-600" />
                        <p className="text-sm text-amber-700">
                            No active organization selected. Please select an organization to manage settings.
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Organization Context Display */}
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <OrganizationLogoDisplay 
                    logo={organization.logo} 
                    className="h-8 w-8" 
                    size="default"
                />
                <div>
                    <div className="font-medium">{organization.name}</div>
                    <div className="text-xs text-muted-foreground">/{organization.slug}</div>
                    <div className="text-xs text-muted-foreground">
                        Settings below are organization-specific
                    </div>
                </div>
                <Badge variant="secondary" className="ml-auto text-xs">
                    Current
                </Badge>
            </div>

            {/* Keypad PIN Management */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Hash className="h-5 w-5" />
                        Keypad PIN
                    </CardTitle>
                    <CardDescription>
                        Manage your keypad PIN for <strong>{organization.name}</strong>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <Info className="h-4 w-4 text-blue-600" />
                        <p className="text-sm text-blue-700">
                            This PIN is specific to <strong>{organization.name}</strong> and cannot be used in other organizations.
                        </p>
                    </div>

                    {loadingPinStatus ? (
                        <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm text-muted-foreground">Checking PIN status...</span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label className="text-sm font-medium">PIN Status</Label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant={pinStatus.hasPin ? "default" : "secondary"}>
                                            {pinStatus.hasPin ? "Set" : "Not Set"}
                                        </Badge>
                                        {pinStatus.setAt && (
                                            <span className="text-xs text-muted-foreground">
                                                Set on {formatDate(pinStatus.setAt)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {pinStatus.hasPin ? (
                                        <>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openDialog('change')}
                                            >
                                                <Edit className="h-4 w-4" />
                                                Change PIN
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => openDialog('remove')}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                Remove PIN
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            variant="default"
                                            size="sm"
                                            onClick={() => openDialog('set')}
                                        >
                                            <Hash className="h-4 w-4" />
                                            Set PIN
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* API Keys Management */}
            <ApiKeysSettings user={user} />

            {/* PIN Management Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Hash className="h-5 w-5" />
                            {dialogType === 'set' && 'Set Keypad PIN'}
                            {dialogType === 'change' && 'Change Keypad PIN'}
                            {dialogType === 'remove' && 'Remove Keypad PIN'}
                        </DialogTitle>
                        <DialogDescription>
                            {dialogType === 'remove' ? (
                                <>
                                    Remove your keypad PIN for <strong>{organization.name}</strong>? You will no longer be able to use the keypad to access systems in this organization.
                                </>
                            ) : (
                                <>
                                    {dialogType === 'set' ? 'Set' : 'Change'} your keypad PIN for <strong>{organization.name}</strong>.
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    {dialogType !== 'remove' ? (
                        <div className="py-4">
                            <div className="space-y-2">
                                <Label htmlFor="pin" className="block text-center">Keypad PIN</Label>
                                <div className="flex justify-center">
                                    <InputOTP
                                        id="pin"
                                        maxLength={6}
                                        value={pin}
                                        onChange={(value) => setPin(value)}
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
                                </div>
                                {error && (
                                    <p className="text-sm text-destructive text-center">{error}</p>
                                )}
                            </div>
                        </div>
                    ) : (
                        error && <p className="text-sm text-destructive">{error}</p>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsDialogOpen(false)}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant={dialogType === 'remove' ? 'destructive' : 'default'}
                            onClick={dialogType === 'remove' ? handleRemovePin : handleSubmitPin}
                            disabled={isLoading || (dialogType !== 'remove' && !pin)}
                        >
                            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                            {dialogType === 'set' && (
                                <>
                                    <Hash className="h-4 w-4" />
                                    Set PIN
                                </>
                            )}
                            {dialogType === 'change' && 'Update PIN'}
                            {dialogType === 'remove' && 'Remove PIN'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
} 