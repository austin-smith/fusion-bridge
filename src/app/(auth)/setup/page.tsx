import { redirect } from 'next/navigation';
import { db } from '@/data/db'; // Assuming DB instance path
import { user } from '@/data/db/schema'; // Import the renamed 'user' table
import { sql } from 'drizzle-orm';
import { SetupForm } from "@/components/auth/setup-form"; // We'll create this next

export default async function SetupPage() {
  // Check if any user exists in the database
  try {
    const result = await db.select({ count: sql<number>`count(*)` }).from(user).limit(1);
    const userCount = result[0]?.count ?? 0;

    // If users already exist, redirect back to login (setup already done)
    if (userCount > 0) {
      console.log("[Setup Page] Users found, redirecting to login...");
      redirect('/login');
    }
  } catch (error) {
    console.error("[Setup Page] Error checking user count:", error);
    // Redirect to login on error to be safe
    redirect('/login');
  }

  // If no users exist, render the setup form
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <SetupForm />
      </div>
    </div>
  );
} 