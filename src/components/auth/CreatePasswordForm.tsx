'use client';

import { useActionState, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import FusionIcon from '@/components/icons/FusionIcon';
import { Lock } from 'lucide-react';
import { setInitialPasswordAction } from '@/lib/actions/user-actions';

interface FormState {
  success: boolean;
  message?: string;
}

const initialState: FormState = { success: false };

export default function CreatePasswordForm() {
  const [state, formAction, isPending] = useActionState(setInitialPasswordAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex justify-center items-center min-h-screen">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="space-y-3 text-center pb-6">
          <div className="flex justify-center">
            <FusionIcon className="h-10 w-10 text-primary mb-2" />
          </div>
          <CardTitle className="text-2xl font-bold">Create Password</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Set a new password to finish activating your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {state.message && !state.success ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm flex items-center gap-2">
              <Lock className="h-4 w-4 text-destructive" />
              <span className="font-medium text-destructive">{state.message}</span>
            </div>
          ) : null}

          <form action={formAction} ref={formRef} className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-sm font-medium">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="newPassword"
                    name="newPassword"
                    type="password"
                    required
                    minLength={12}
                    autoComplete="new-password"
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={12}
                    autoComplete="new-password"
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}


