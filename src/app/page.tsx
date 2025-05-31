
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export default function RootPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log('[RootPage useEffect] Triggered. AuthLoading:', authLoading, 'User:', !!user);

    if (authLoading) {
      console.log('[RootPage useEffect] Auth state is loading, waiting...');
      return; // Wait if auth state is still loading
    }

    if (user) {
      // User is authenticated.
      // AuthenticatedAppLayout will handle profile checks, T&C, password expiry from here.
      console.log('[RootPage useEffect] User is authenticated. Redirecting to "/".');
      router.replace('/'); // Redirect to the authenticated app root
    } else {
      // No user object and not loading auth state, so user is not logged in.
      console.log('[RootPage useEffect] User is NOT authenticated. Redirecting to "/login".');
      router.replace('/login');
    }
  }, [user, authLoading, router]); // Dependencies that trigger the effect

  // Display a loader while auth state is being determined or redirection is happening
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Loader2 className="h-16 w-16 animate-spin text-primary" />
      <p className="ml-4 text-lg text-foreground">Initializing...</p>
    </div>
  );
}
