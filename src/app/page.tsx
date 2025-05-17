
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react'; // For a loading indicator

export default function RootPage() {
  const { user, loading: authLoading, userProfile, loading: profileLoading } = useAuth();
  const router = useRouter();

  const isLoading = authLoading || profileLoading;

  useEffect(() => {
    if (!isLoading) {
      if (user && userProfile) {
        // User is logged in and profile is loaded.
        // AuthenticatedAppLayout (for /dashboard) will handle T&C/password expiry checks.
        router.replace('/dashboard');
      } else if (user && !userProfile && !profileLoading) {
        // User is authenticated but profile hasn't loaded or is missing,
        // this case might indicate needing to go to profile setup if that's not handled by AuthenticatedAppLayout.
        // For now, AuthenticatedAppLayout handles missing profile by showing T&C or loading.
        // If profile setup is mandatory first, redirect to /profile.
        // However, our (app)/layout.tsx already has robust checks.
        router.replace('/dashboard'); // Let the (app) layout handle its logic
      } else if (!user && !authLoading) {
        // User is not logged in and auth state is confirmed.
        router.replace('/login');
      }
    }
  }, [user, userProfile, isLoading, authLoading, profileLoading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center space-y-2">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading Health Timeline...</p>
      </div>
    </div>
  );
}
