// import { auth } from "@/lib/auth/server"; // Use server auth
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers'; // Import cookies
import { PageHeader } from "@/components/layout/page-header";
import { Settings } from 'lucide-react';
import { AccountSettingsForm } from "@/components/features/account/account-settings-form";

// Define the expected shape of the user data from the API
// This now directly matches the /api/auth/profile response structure
interface UserProfileData {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  twoFactorEnabled: boolean; // Now boolean, non-optional from profile endpoint
}

// Define the component as async
export default async function AccountSettingsPage() {
  let user: UserProfileData | null = null;
  let profileApiUrl: URL | null = null;
  let fetchError: string | null = null;

  try {
    const cookieStore = await cookies();
    
    const port = process.env.PORT;
    if (port) {
      try {
          // Update URL to point to the new profile endpoint
          profileApiUrl = new URL(`http://localhost:${port}/api/auth/profile`); 
      } catch (e) {
          console.error("[AccountSettingsPage] Failed to construct URL with localhost:PORT", e);
          fetchError = 'Internal Server Configuration Error (URL Port)';
      }
    } else {
        console.error("[AccountSettingsPage] PORT environment variable not found. Cannot fetch session.");
        fetchError = 'Internal Server Configuration Error (Missing PORT)';
    }

    if (profileApiUrl && !fetchError) { 
        const allCookies = cookieStore.getAll(); 
        const cookieHeader = allCookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
        console.log(`[AccountSettingsPage] Fetching user profile from ${profileApiUrl.toString()}`);

        const response = await fetch(profileApiUrl.toString(), {
          headers: { 'Cookie': cookieHeader },
          cache: 'no-store',
        });

        if (response.ok) {
          // Directly parse the user profile data
          user = await response.json(); 
        } else if (response.status === 401) {
            // Handle unauthorized specifically - user needs to log in
            console.log("[AccountSettingsPage] Profile API returned 401 Unauthorized. Redirecting to login.");
            fetchError = 'Unauthorized'; // Set error to trigger redirect below
        } else {
          console.error(`[AccountSettingsPage] Profile API fetch failed with status: ${response.status}`);
          fetchError = `API fetch failed: ${response.status}`;
        }
    }
  } catch (error) {
    console.error("[AccountSettingsPage] Error during page load fetch:", error);
    fetchError = (error instanceof Error) ? error.message : "Fetch error";
  }

  // If there was any fetch error OR user data is null, redirect to login
  if (fetchError || !user) {
    console.error(`[AccountSettingsPage] Fetch error ('${fetchError}') or user data missing, redirecting to login.`);
    redirect('/login');
  }

  // Prepare user data for the form, ensuring correct types
  const userData = {
    id: user.id, // id is guaranteed by successful fetch
    name: user.name ?? '', // Ensure name is string
    email: user.email ?? '', // Ensure email is string (though it should always exist)
    image: user.image ?? null,
    twoFactorEnabled: user.twoFactorEnabled, // Already boolean
  };

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:p-6 lg:gap-6">
        <PageHeader
          title="Account Settings"
          description="Manage your personal profile information."
          icon={<Settings className="h-6 w-6" />} />
         <div className="max-w-2xl">
            <AccountSettingsForm user={userData} />
        </div>
    </main>
  );
} 