'use client';

import React, { useRef, useEffect, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { updateCurrentUser } from '@/lib/actions/user-actions';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save } from "lucide-react";
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Define the expected user prop structure
interface UserData {
    id: string;
    name: string;
    email: string;
    image: string | null;
}

interface AccountSettingsFormProps {
    user: UserData;
}

// Define initial state for the action
const initialState = {
    success: false,
    message: undefined,
};

export function AccountSettingsForm({ user }: AccountSettingsFormProps) {
    const [state, formAction] = useActionState(updateCurrentUser, initialState);
    const formRef = useRef<HTMLFormElement>(null);
    const userInitial = user.name ? user.name.charAt(0).toUpperCase() : (user.email ? user.email.charAt(0).toUpperCase() : '?');

    useEffect(() => {
        if (state.success) {
            toast.success(state.message || 'Profile updated successfully!');
            // Optionally reset form or refetch data if needed, but revalidatePath should handle display updates
        }
        if (!state.success && state.message) {
            toast.error(state.message);
        }
    }, [state]);

    return (
        <Card>
            <CardHeader className="items-center text-center">
                <Avatar className="h-20 w-20 mb-4">
                    <AvatarImage src={user.image ?? undefined} alt={user.name} className="object-cover" />
                    <AvatarFallback className="text-2xl">{userInitial}</AvatarFallback>
                </Avatar>
                <CardTitle>Profile Details</CardTitle>
                <CardDescription>Update your name and avatar URL.</CardDescription>
            </CardHeader>
            <form action={formAction} ref={formRef}>
                <CardContent className="space-y-4 pt-4">
                    <div className="space-y-1">
                        <Label htmlFor="settings-name">Name</Label>
                        <Input id="settings-name" name="name" required defaultValue={user.name} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="settings-email">Email</Label>
                        <Input id="settings-email" name="email" type="email" disabled value={user.email} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="settings-image">Avatar URL</Label>
                        <Input id="settings-image" name="image" type="url" placeholder="https://... (optional)" defaultValue={user.image ?? ''} />
                    </div>
                </CardContent>
                <CardFooter className="border-t px-6 py-4">
                    <SubmitButton />
                </CardFooter>
            </form>
        </Card>
    );
}

// Submit Button specific for this form
function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" disabled={pending} className="ml-auto">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="h-4 w-4"/>}
            {pending ? 'Saving...' : 'Save Changes'}
        </Button>
    );
} 