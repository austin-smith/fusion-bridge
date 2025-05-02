import { redirect } from 'next/navigation';
import { db } from '@/data/db'; // Assuming DB instance path
import { user } from '@/data/db/schema'; // Import the renamed 'user' table
import { sql } from 'drizzle-orm';
import { LoginForm } from "@/components/login-form"

export default async function LoginPage() {
  let userCount: number | null = null;

  // Check if any user exists in the database
  try {
    const result = await db.select({ count: sql<number>`count(*)` }).from(user).limit(1);
    userCount = result[0]?.count ?? 0;
  } catch (error) {
    console.error("[Login Page] Error checking user count:", error);
    // Set userCount to null or a non-zero value to prevent redirect on DB error
    userCount = null; // Or userCount = 1;
  }

  // If no users exist (and DB check didn't fail), redirect to the setup page
  // This redirect call is now outside the try...catch block
  if (userCount === 0) {
    console.log("[Login Page] No users found, redirecting to setup...");
    redirect('/setup');
  }

  // If users exist or the DB check failed, render the login form
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  )
}
