
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
    console.log('[RootPage useEffect] Running. isLoading:', isLoading, 'User:', !!user, 'UserProfile:', !!userProfile);
    if (!isLoading) {
      if (user) {
        // User object exists, means they are authenticated or auth state is known.
        // Redirect to the authenticated app root.
        // AuthenticatedAppLayout will handle profile checks, T&C, password expiry.
        console.log('[RootPage useEffect] User authenticated, redirecting to "/".');
        router.replace('/');
      } else {
        // No user object and not loading auth state, so user is not logged in.
        console.log('[RootPage useEffect] User not authenticated, redirecting to "/login".');
        router.replace('/login');
      }
    } else {
      console.log('[RootPage useEffect] Still loading auth/profile state.');
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
  // Or if there's a brief moment where isLoading is false but user state isn't yet definitive.
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <p>Loading application state...</p>
    </div>
  );
}
