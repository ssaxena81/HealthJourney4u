
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export default function RootPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [statusMessage, setStatusMessage] = useState('Initializing...');

  useEffect(() => {
    console.log(`[RootPage useEffect] Triggered. AuthLoading: ${authLoading}, User: ${!!user}, UserProfile: ${!!userProfile}, ProfileSetupComplete: ${userProfile?.profileSetupComplete}`);

    if (authLoading) {
      setStatusMessage('Verifying authentication...');
      return; 
    }

    if (user) {
      // User is authenticated. Now check profile setup.
      if (userProfile && userProfile.profileSetupComplete === true) {
        setStatusMessage('Loading your dashboard...');
        // AuthenticatedAppLayout will handle rendering, no redirect needed FROM here if profile is complete.
        // If router.replace('/') were here, it could cause loop with AuthenticatedAppLayout if it also checks profile.
      } else if (userProfile && userProfile.profileSetupComplete === false) {
        setStatusMessage('Profile setup incomplete. Redirecting to profile page...');
        console.log('[RootPage useEffect] User authenticated, profile NOT complete. Redirecting to /profile.');
        router.replace('/profile');
      } else if (!userProfile) {
        // This case might happen briefly if user is authenticated but profile hasn't loaded into context yet.
        // Or if profile fetch failed. AuthProvider should ideally handle this.
        setStatusMessage('Finalizing session...');
        console.log('[RootPage useEffect] User authenticated, but userProfile is null/undefined. Waiting for profile or further action from AuthProvider.');
        // Potentially, could redirect to /profile if this state persists, but usually AuthProvider handles it.
      } else {
         // User authenticated, userProfile exists, but profileSetupComplete is undefined (treat as incomplete)
        setStatusMessage('Profile setup status unknown. Redirecting to profile page...');
        console.log('[RootPage useEffect] User authenticated, profileSetupComplete is undefined. Redirecting to /profile.');
        router.replace('/profile');
      }
    } else {
      // No user object and not loading auth state, so user is not logged in.
      setStatusMessage('Redirecting to login...');
      console.log('[RootPage useEffect] No user and not authLoading. Redirecting to /login.');
      router.replace('/login');
    }
  }, [user, userProfile, authLoading, router]);

  // Show loader if auth is still loading, or if redirect decision is pending.
  if (authLoading || (user && !userProfile) || (user && userProfile && userProfile.profileSetupComplete !== true && !authLoading)) {
    // The last condition covers the case where we decided to redirect to /profile but the redirect hasn't happened yet.
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">{statusMessage}</p>
      </div>
    );
  }
  
  // If user is logged in AND profile is complete, this component's job is to let AuthenticatedAppLayout take over.
  // It can show a loader or nothing. A loader is safer if AuthenticatedAppLayout has its own checks.
  if (user && userProfile && userProfile.profileSetupComplete === true) {
    console.log('[RootPage] User authenticated and profile complete. Rendering passthrough loader for AuthenticatedAppLayout.');
     return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">{statusMessage}</p>
      </div>
    );
  }


  // Fallback loader if none of the above conditions were met to render content or redirect explicitly.
  // This should ideally not be hit if logic is correct.
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Loader2 className="h-16 w-16 animate-spin text-primary" />
      <p className="ml-4 text-lg text-foreground">{statusMessage}</p>
    </div>
  );
}
