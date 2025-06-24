
'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

// This page serves as a robust redirect mechanism for any authenticated
// user who happens to land on the root URL. It ensures they are always
// taken to their dashboard.
export default function AuthenticatedRootRedirectPage() {
  const { loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for the auth state to be determined before redirecting.
    if (!loading) {
      router.replace('/dashboard');
    }
  }, [loading, router]);

  // Display a loader to provide visual feedback during the brief redirection moment.
  return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">Redirecting...</p>
      </div>
  );
}
