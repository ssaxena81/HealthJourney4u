
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

// This is a client component that immediately redirects any authenticated user
// who happens to land on the root URL ('/') inside the (app) group to their dashboard.
// This resolves routing conflicts by ensuring this path doesn't try to render a page
// and relies on the same client-side auth context as the rest of the app.
export default function AuthenticatedRootRedirectPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for the auth state to be determined
    if (!loading) {
      // If we have a user, redirect them to the dashboard.
      // If for some reason we don't have a user, the layout's check will redirect to login.
      if (user) {
        router.replace('/dashboard');
      }
    }
  }, [user, loading, router]);
  
  // Render a loader while the redirect is in progress.
  return (
     <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">Redirecting...</p>
      </div>
  );
}
