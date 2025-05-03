'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, KeyRound } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"; // Using shadcn InputOTP

export default function Verify2faPage() {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Future use: Allow backup code entry
  const [isUsingBackupCode, setIsUsingBackupCode] = useState(false); 
  const [backupCode, setBackupCode] = useState('');

  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/'; // Get callbackUrl from query params or default

  const handleVerifyOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (isUsingBackupCode) {
          console.log(`Verifying backup code: ${backupCode}`);
          await authClient.twoFactor.verifyBackupCode({ code: backupCode });
      } else {
          console.log(`Verifying TOTP code: ${code}`);
          await authClient.twoFactor.verifyTotp({ code: code });
      }
      // Success! Better-Auth client will handle the redirect automatically.
      console.log("2FA verification successful, redirecting...");
      // Redirect to the originally intended destination or dashboard
      window.location.href = callbackUrl; 
    } catch (err: any) {
      console.error("2FA Verification failed:", err);
      setError(err?.message || "Invalid code. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-background">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Two-Factor Authentication</CardTitle>
          <CardDescription>
            {isUsingBackupCode 
                ? "Enter one of your backup codes to sign in."
                : "Enter the code from your authenticator app."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="font-medium text-destructive">{error}</span>
            </div>
          )}
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            {isUsingBackupCode ? (
                <div className="space-y-2">
                    <Label htmlFor="backup-code">Backup Code</Label>
                    <Input 
                        id="backup-code" 
                        value={backupCode} 
                        onChange={(e) => setBackupCode(e.target.value)} 
                        required 
                        disabled={isLoading}
                        placeholder="Enter backup code"
                        autoComplete="off"
                    />
                </div>
            ) : (
                <div className="space-y-2 flex flex-col items-center">
                  <Label htmlFor="otp-code">Authentication Code</Label>
                  <InputOTP 
                     id="otp-code" 
                     maxLength={6} 
                     value={code} 
                     onChange={(value: string) => setCode(value)}
                     disabled={isLoading}
                     autoComplete="one-time-code"
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
            )}

            <Button type="submit" className="w-full" disabled={isLoading || (isUsingBackupCode ? !backupCode : code.length < 6)}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Verify Code
            </Button>
          </form>
            
          <Button 
            variant="link" 
            className="w-full text-sm text-muted-foreground" 
            onClick={() => {
                setIsUsingBackupCode(!isUsingBackupCode); 
                setError(null); // Clear error when switching mode
                setCode(''); 
                setBackupCode('');
            }}
            disabled={isLoading}
          >
            {isUsingBackupCode ? "Use authenticator app code" : "Use a backup code"}
          </Button>

        </CardContent>
      </Card>
    </div>
  );
} 