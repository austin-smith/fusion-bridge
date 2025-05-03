'use client';

import { useState, useRef, useEffect } from 'react';
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

// Define type for OTP input ref (needed for focusing)
type OtpInputHandle = {
    focus: () => void;
};

export default function Verify2faPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Future use: Allow backup code entry
  const [isUsingBackupCode, setIsUsingBackupCode] = useState(false); 
  const [backupCode, setBackupCode] = useState('');

  // Ref for the OTP input container to manage focus
  const otpInputRef = useRef<HTMLInputElement>(null); // Ref for the main InputOTP component

  // Function to handle the verification logic using onError callback
  const triggerVerification = async (currentCode: string) => {
      setIsLoading(true);
      setError(null);

      const handleVerificationError = (errorMessage: string) => {
          setIsLoading(false); 
          setCode(''); 
          setError(errorMessage || "Invalid code. Please try again.");
      };

      const handleVerificationSuccess = () => {
           console.log("2FA verification successful, redirecting...");
           // Explicitly redirect on success
           window.location.href = callbackUrl; 
      };

      try { // Keep outer try/catch for unexpected network/config errors
          if (isUsingBackupCode) {
              console.log(`Verifying backup code: ${backupCode}`);
              await authClient.twoFactor.verifyBackupCode({ code: backupCode }, {
                  onSuccess: handleVerificationSuccess,
                  onError: (ctx) => handleVerificationError(ctx.error.message)
              });
          } else {
              console.log(`Verifying TOTP code: ${currentCode}`);
              await authClient.twoFactor.verifyTotp({ code: currentCode }, {
                  onSuccess: handleVerificationSuccess,
                  onError: (ctx) => handleVerificationError(ctx.error.message)
              });
          }
      } catch (err: any) {
            // Catch unexpected errors not handled by onError (e.g., network fail)
            console.error("Unexpected error during 2FA verification:", err);
            handleVerificationError("An unexpected error occurred. Please try again.");
      }
  };

  // Handler for form submission (can be triggered by button or auto-submit)
  const handleVerifySubmit = (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault(); // Prevent default form submission if triggered by form
      if (!isLoading) { // Only proceed if not already loading
          triggerVerification(code);
      }
  };

  // Handle changes in the OTP input
  const handleOtpChange = (value: string) => {
      setCode(value);
      
      // Auto-submit when 6 digits are entered
      if (value.length === 6 && !isUsingBackupCode) {
          console.log("OTP complete, triggering verification...");
          triggerVerification(value);
      }
  };

  // Effect to focus the first OTP input on mount if not using backup code
  useEffect(() => {
    if (!isUsingBackupCode && otpInputRef.current) {
        // Directly focus the InputOTP component itself, which should handle the first slot
        otpInputRef.current.focus();
    }
  }, [isUsingBackupCode]); // Re-run if the mode changes

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
          <form onSubmit={handleVerifySubmit} className="space-y-6">
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
                        autoFocus // Auto-focus backup code field when visible
                    />
                </div>
            ) : (
                <div className="space-y-2 flex flex-col items-center">
                  <Label htmlFor="otp-code">Authentication Code</Label>
                  <InputOTP 
                     ref={otpInputRef} 
                     id="otp-code" 
                     maxLength={6} 
                     value={code} 
                     onChange={handleOtpChange} 
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

            <Button type="submit" className="w-full" disabled={isLoading || (isUsingBackupCode ? !backupCode : code.length < 6 && !isLoading)}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isLoading ? 'Verifying...' : 'Verify Code'}
            </Button>
          </form>
            
          <Button 
            variant="link" 
            className="w-full text-sm text-muted-foreground" 
            onClick={() => {
                setIsUsingBackupCode(!isUsingBackupCode); 
                setError(null); 
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