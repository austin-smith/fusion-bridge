"use client"; // Required for useState and event handlers

import { useState } from "react";
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signIn } from "@/lib/auth/client"
import { Mail, Lock, AlertCircle } from "lucide-react" // Keep these icons
import FusionIcon from '@/components/icons/FusionIcon'; // Import FusionIcon

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState<boolean>(false); // Single loading state
  const [error, setError] = useState<string | null>(null);

  const handleCredentialsLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log("[Login Form] handleCredentialsLogin triggered.");
    setIsLoading(true);
    setError(null);

    console.log("[Login Form] Calling signIn.email with:", { email });
    // Initiate sign-in; redirects (including 2FA) are handled by better-auth client/plugins
    signIn.email({ email, password, callbackURL: "/" }); 
    
    // Note: setIsLoading(false) is removed as the component will likely unmount on redirect.
    // Error handling might need to rely on query params added by better-auth on redirect back to login.
  };

  // No GitHub login handler needed

  return (
    <div className={cn("flex justify-center items-center min-h-screen", className)} {...props}> {/* Centered layout, ensure it takes height */}
      <Card className="w-full max-w-md shadow-lg"> {/* Max width and shadow */}
        <CardHeader className="space-y-3 text-center pb-6"> {/* Added space-y-3 for icon margin */}
          <div className="flex justify-center"> {/* Center the icon */}
             <FusionIcon className="h-10 w-10 text-primary mb-2" /> {/* Add the icon */}
          </div>
          <CardTitle className="text-2xl font-bold">Sign In</CardTitle> {/* Changed title */}
          <CardDescription className="text-sm text-muted-foreground">
            Sign in to your account to continue
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5"> {/* Adjusted spacing */}
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm flex items-center gap-2"> {/* Error style with icon */}
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="font-medium text-destructive">{error}</span>
            </div>
          )}
          <form onSubmit={handleCredentialsLogin} className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <div className="relative"> {/* Input with icon */}
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="pl-10" // Padding for icon
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <div className="relative"> {/* Input with icon */}
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="password" 
                    type="password"
                    placeholder="Password" 
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="pl-10" // Padding for icon
                  />
                </div>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign in with Email"}
            </Button>
          </form>
          {/* No GitHub button or separator */}
        </CardContent>
        {/* No CardFooter with sign up link */}
      </Card>
    </div>
  )
}
