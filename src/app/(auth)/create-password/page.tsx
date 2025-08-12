import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/server';
import CreatePasswordForm from '@/components/auth/CreatePasswordForm';
import { headers } from 'next/headers';

export default async function CreatePasswordPage() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session?.user) {
    redirect('/login');
  }
  return <CreatePasswordForm />;
}


