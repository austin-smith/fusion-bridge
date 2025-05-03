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

export default async function AccountSettingsPage() {
  let apiResponse: SessionApiResponse | null = null;
  let user: UserSessionData | undefined | null = null;

  try {
    // Await cookies() to get the actual store
    const cookieStore = await cookies(); 
    
    // Construct URL from environment variable (ensure NEXTAUTH_URL or equivalent is set!)
    const baseURL = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000'; // Add fallbacks
    if (!baseURL) {
         throw new Error("Base URL could not be determined. Set NEXTAUTH_URL or VERCEL_URL.");
    }
    const sessionCheckUrl = new URL('/api/auth/check-session', baseURL.startsWith('http') ? baseURL : `https://${baseURL}`); // Ensure protocol

    // Correctly construct the Cookie header string from the resolved cookie store
    const cookieHeader = cookieStore.getAll().map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

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
      console.error(`Check session API fetch failed with status: ${response.status}`);
      apiResponse = { isAuthenticated: false, error: `API fetch failed: ${response.status}` };
    }
  } catch (error) {
    console.error("Error fetching check session API:", error);
    apiResponse = { isAuthenticated: false, error: "Fetch error" };
  }

  // Check authentication based on API response
  if (!apiResponse?.isAuthenticated || !user) {
    console.error("Not authenticated based on API response, redirecting.", apiResponse);
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
          icon={<Settings className="h-6 w-6" />}
        />
         <div className="max-w-2xl">
            <AccountSettingsForm user={userData} />
        </div>
    </main>
  );
} 