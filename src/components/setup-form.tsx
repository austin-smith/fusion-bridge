"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
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
import { createFirstAdminUser } from "@/lib/actions/auth-actions"; // We'll create this action next

export function SetupForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false); // To show success message

  const handleSetup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await createFirstAdminUser({
          name,
          email,
          password,
      });

      if (result.success) {
        setSuccess(true);
        setError(null);
        // Optionally redirect from client-side after a delay or on button click
        // router.push('/login'); 
      } else {
        setError(result.error || "Failed to create admin user.");
      }
    } catch (err) {
      console.error("Setup failed:", err);
      setError("An unexpected error occurred during setup.");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
       <div className={cn("flex flex-col items-center gap-4", className)} {...props}>
            <Card>
                 <CardHeader>
                    <CardTitle>Setup Complete!</CardTitle>
                    <CardDescription>The initial admin account has been created.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        You can now proceed to the login page.
                    </p>
                    <Button asChild className="mt-4 w-full">
                        <a href="/login">Go to Login</a>
                    </Button>
                </CardContent>
            </Card>
       </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Create Initial Admin</CardTitle>
          <CardDescription>
            Enter details for the first administrator account.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {error}
            </div>
          )}
          <form onSubmit={handleSetup}>
            <div className="grid gap-4">
               <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Admin User"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  placeholder="Min 8 characters"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Creating Account..." : "Create Admin Account"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
} 