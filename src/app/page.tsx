
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export default function RootPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [statusMessage, setStatusMessage] = useState('Initializing...');

  useEffect(() => {
    console.log('[RootPage useEffect] Triggered. AuthLoading:', authLoading, 'User:', !!user);

    if (authLoading) {
      setStatusMessage('Verifying authentication...');
      return; 
    }

    if (user) {
      // User is authenticated.
      // The (app) layout will handle rendering the authenticated content for the '/' route.
      // No redirect is needed from this RootPage component itself.
      setStatusMessage('Loading your dashboard...');
      // NOTE: router.replace('/') was removed here to prevent a loop.
    } else {
      // No user object and not loading auth state, so user is not logged in.
      setStatusMessage('Redirecting to login...');
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  // If auth is still loading, or if auth is done and there's no user (and redirect is pending), show loader.
  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">{statusMessage}</p>
      </div>
    );
  }

  // If authLoading is false AND user is true, this component's primary job (auth check) is done.
  // The actual content for '/' for an authenticated user will be rendered by (app)/page.tsx
  // via (app)/layout.tsx. This RootPage can effectively render nothing or a minimal passthrough loader
  // while (app)/layout.tsx does its own checks (profile, T&C, etc.) and shows its own loaders.
  // Returning a loader here ensures something is visible during that handoff.
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Loader2 className="h-16 w-16 animate-spin text-primary" />
      <p className="ml-4 text-lg text-foreground">{statusMessage}</p>
    </div>
  );
}
