
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
        // Check for T&C and password expiry before redirecting to dashboard
        // This logic is now primarily handled in AuthenticatedAppLayout
        router.replace('/dashboard');
      } else if (user && !userProfile && !profileLoading) {
        // User exists but profile might be loading or missing, redirect to profile to complete
        // Or if profile is truly missing after loading, this is an issue.
        // For now, assuming new users are guided to /profile after signup.
        // Existing users should have a profile.
        router.replace('/profile'); // Or /dashboard and let AuthenticatedAppLayout handle it
      } else if (!user && !authLoading) {
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
  // or if there's a state not covered (should ideally not happen).
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <p>Loading application...</p>
    </div>
  );
}
