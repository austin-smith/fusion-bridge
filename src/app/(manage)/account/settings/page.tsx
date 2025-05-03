// import { auth } from "@/lib/auth/server"; // Use server auth
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers'; // Import cookies
import { PageHeader } from "@/components/layout/page-header";
import { Settings } from 'lucide-react';
import { AccountSettingsForm } from "@/components/features/account/account-settings-form";

// Define the expected shape of the user data from the API
interface UserSessionData {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  twoFactorEnabled?: boolean; // Add optional twoFactorEnabled field
}

// Define the expected shape of the API response
interface SessionApiResponse {
  isAuthenticated: boolean;
  user?: UserSessionData;
  error?: string;
}

// Define the component as async
export default async function AccountSettingsPage() {
  let apiResponse: SessionApiResponse | null = null;
  let user: UserSessionData | undefined | null = null;
  let sessionCheckUrl: URL | null = null;

  try {
    // Await cookies() FIRST to get the actual store
    const cookieStore = await cookies();
    
    // --- Construct internal URL using localhost and PORT --- 
    const port = process.env.PORT;
    if (port) {
      try {
          sessionCheckUrl = new URL(`http://localhost:${port}/api/auth/check-session`);
      } catch (e) {
          console.error("[AccountSettingsPage] Failed to construct URL with localhost:PORT", e);
          // Set error state or throw to prevent rendering potentially broken page
          apiResponse = { isAuthenticated: false, error: 'Internal Server Configuration Error (URL Port)' };
      }
    } else {
        console.error("[AccountSettingsPage] PORT environment variable not found. Cannot fetch session.");
        // Set error state or throw - cannot proceed without PORT
        apiResponse = { isAuthenticated: false, error: 'Internal Server Configuration Error (Missing PORT)' };
    }

    // Proceed only if URL construction was successful
    if (sessionCheckUrl && !apiResponse?.error) { 
        // Correctly construct the Cookie header string from the RESOLVED cookie store
        const allCookies = cookieStore.getAll(); // Now call getAll on the resolved store
        const cookieHeader = allCookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
        console.log(`[AccountSettingsPage] Fetching session from ${sessionCheckUrl.toString()}`);

        const response = await fetch(sessionCheckUrl.toString(), {
          headers: {
            'Cookie': cookieHeader,
          },
          cache: 'no-store', 
        });

        if (response.ok) {
          apiResponse = await response.json();
          user = apiResponse?.user;
        } else {
          console.error(`[AccountSettingsPage] Check session API fetch failed with status: ${response.status}`);
          apiResponse = { isAuthenticated: false, error: `API fetch failed: ${response.status}` };
        }
    }
  } catch (error) {
    console.error("[AccountSettingsPage] Error during page load fetch:", error);
    // Ensure apiResponse reflects the error
    if (!apiResponse || !apiResponse.error) {
      apiResponse = { isAuthenticated: false, error: (error instanceof Error) ? error.message : "Fetch error" };
    }
  }

  // Check authentication based on API response
  if (!apiResponse?.isAuthenticated || !user) {
    console.error("[AccountSettingsPage] Not authenticated based on API response, redirecting.", apiResponse);
    redirect('/login');
  }

  // Prepare user data for the form using fetched data
  const userData = {
    id: user.id,
    name: user.name ?? '',
    email: user.email ?? '', // Should always exist if authenticated
    image: user.image ?? null,
    twoFactorEnabled: user.twoFactorEnabled ?? false, // Include twoFactorEnabled, default to false
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