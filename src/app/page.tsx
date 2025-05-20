
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export default function RootPage() {
  const { user, loading: authLoading, userProfile, loading: profileLoading } = useAuth();
  const router = useRouter();

  const isLoading = authLoading || profileLoading;

  useEffect(() => {
    if (!isLoading) {
      if (user && userProfile) {
        // User logged in, profile exists
        // AppLayout in (app) group will handle T&C and password expiry checks
        router.replace('/'); // Redirect to the authenticated root, which is now the dashboard
      } else if (user && !userProfile && !profileLoading) {
        // User exists but profile might be loading or missing, redirect to profile to complete
        router.replace('/profile');
      } else if (!user && !authLoading) {
        // User not logged in
        router.replace('/login');
      }
    }
  }, [user, userProfile, isLoading, authLoading, profileLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  // Fallback content if redirection logic somehow doesn't kick in immediately
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <p>Loading application...</p>
    </div>
  );
}
