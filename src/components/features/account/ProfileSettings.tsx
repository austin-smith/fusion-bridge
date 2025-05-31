'use client';

import React, { useRef, useEffect, useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { updateCurrentUser } from '@/lib/actions/user-actions';
import type { UpdateUserResult } from '@/lib/actions/user-actions';
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
import { Loader2, Trash2, Pencil } from "lucide-react";
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFusionStore } from '@/stores/store';

interface UserData {
    id: string;
    name: string;
    email: string;
    image: string | null;
    twoFactorEnabled: boolean;
}

interface ProfileSettingsProps {
    user: UserData;
}

const initialProfileState: UpdateUserResult = { 
    success: false,
    message: undefined,
    updatedUser: null,
};

export function ProfileSettings({ user }: ProfileSettingsProps) {
    const [profileState, profileFormAction] = useActionState<UpdateUserResult, FormData>(updateCurrentUser, initialProfileState);
    const profileFormRef = useRef<HTMLFormElement>(null);
    
    const [imageUrlToSubmit, setImageUrlToSubmit] = useState<string>(user.image ?? '');
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [popoverImageUrl, setPopoverImageUrl] = useState<string>(user.image ?? '');

    const userInitial = user.name ? user.name.charAt(0).toUpperCase() : (user.email ? user.email.charAt(0).toUpperCase() : '?');

    // Effect for Profile Form feedback - update store on success
    useEffect(() => {
        if (profileState.success) {
            toast.success(profileState.message || 'Profile updated successfully!');
            if (profileState.updatedUser) {
                setImageUrlToSubmit(profileState.updatedUser.image ?? ''); 
                setPopoverImageUrl(profileState.updatedUser.image ?? ''); 
                useFusionStore.getState().setCurrentUser({
                    ...profileState.updatedUser,
                    twoFactorEnabled: profileState.updatedUser.twoFactorEnabled ?? false, 
                });
                console.log("[ProfileSettings] Updated currentUser in Zustand store.");
                useFusionStore.getState().triggerUserListRefresh();
                console.log("[ProfileSettings] Triggered user list refresh.");
            } else {
                 setPopoverImageUrl(imageUrlToSubmit);
            }
        }
        if (!profileState.success && profileState.message) {
            toast.error(profileState.message);
        }
    }, [profileState, imageUrlToSubmit]); 

    const handlePopoverSave = () => {
        setImageUrlToSubmit(popoverImageUrl);
        setPopoverOpen(false);
    };

    const handlePopoverRemove = () => {
        setImageUrlToSubmit('');
        setPopoverImageUrl('');
        setPopoverOpen(false);
    };

    const handlePopoverOpenChange = (open: boolean) => {
        if (open) {
            setPopoverImageUrl(imageUrlToSubmit);
        }
        setPopoverOpen(open);
    }

    return (
        <Card>
            <CardHeader className="items-center text-center">
                <Popover open={popoverOpen} onOpenChange={handlePopoverOpenChange}>
                    <PopoverTrigger asChild>
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
                    <ProfileSubmitButton />
                </CardFooter>
            </form>
        </Card>
    );
}

function ProfileSubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" disabled={pending} className="ml-auto" size="sm">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
        </Button>
    );
} 