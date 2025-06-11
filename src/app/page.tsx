
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
      console.log('[RootPage useEffect] Auth is loading. Waiting...');
      return; 
    }

    // Auth is NOT loading anymore, proceed with checks
    if (user) {
      // User is authenticated. Now check profile.
      if (userProfile) { // Profile is loaded
        if (userProfile.profileSetupComplete === true) {
          setStatusMessage('Loading your dashboard...');
          console.log('[RootPage useEffect] User authenticated, profile complete. Dashboard should load via (app) layout.');
          // No redirect needed from here if profile is complete, AuthenticatedAppLayout will handle it.
          // If this page IS the dashboard, it will render its content.
          // If '/' is supposed to be the dashboard and is wrapped by AuthenticatedAppLayout, that layout will take over.
        } else { // profileSetupComplete is false or undefined
          setStatusMessage('Profile setup incomplete. Redirecting to profile page...');
          console.log('[RootPage useEffect] User authenticated, profile NOT complete. Redirecting to /profile.');
          router.replace('/profile');
        }
      } else { 
        // User is authenticated, but profile is not yet loaded (userProfile is null).
        // This state should ideally be brief if fetchUserProfile is efficient.
        // Or it means profile fetch failed or no profile exists.
        setStatusMessage('Finalizing session & fetching profile...');
        console.log('[RootPage useEffect] User authenticated, but userProfile is null (and not authLoading). This might indicate profile fetch issue or new user without profile yet.');
        // Consider redirecting to /profile if this state persists or is for a new user scenario not handled by signup.
        // For now, AuthProvider's fetchUserProfile is expected to set this. If it remains null, AuthenticatedAppLayout will likely redirect to /profile.
      }
    } else {
      // No user object and not authLoading, so user is definitively not logged in.
      setStatusMessage('Redirecting to login...');
      console.log('[RootPage useEffect] No user and not authLoading. Redirecting to /login.');
      router.replace('/login');
    }
  }, [user, userProfile, authLoading, router]);

  // Show loader if auth is still loading, or if user exists but profile is still loading/being checked.
  if (authLoading || (user && !userProfile && !authLoading) ) { 
    // The second condition (user && !userProfile && !authLoading) covers the brief period where auth is resolved but profile fetch might still be in progress
    // or if the profile is genuinely missing (which AuthenticatedAppLayout might handle by redirecting to /profile).
    console.log(`[RootPage Render] Showing loader. AuthLoading: ${authLoading}, User: ${!!user}, UserProfile: ${!!userProfile}`);
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">{statusMessage}</p>
      </div>
    );
  }
  
  // If user is logged in AND profile is complete, this component (if it's the dashboard route itself) will render its content.
  // If AuthenticatedAppLayout wraps this, AuthenticatedAppLayout will show its children.
  if (user && userProfile && userProfile.profileSetupComplete === true) {
    console.log('[RootPage Render] User authenticated and profile complete. Actual page content for "/" should be rendered by AuthenticatedAppLayout children or this page if it is the final destination.');
    // This page is the entry point for authenticated users if their profile is complete.
    // It will be wrapped by AuthenticatedAppLayout, which then renders the (app)/page.tsx (My Health Overview)
    // So, we show a loader here while that happens.
     return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">{statusMessage}</p>
      </div>
    );
  }

  // Fallback if no user (and not loading), which should have been caught by redirect logic in useEffect.
  // Or if user exists, profile exists, but profileSetupComplete is false (also caught by useEffect redirect).
  // This state implies a redirect is imminent or has just been triggered.
  console.log(`[RootPage Render] Fallback loader / redirecting. AuthLoading: ${authLoading}, User: ${!!user}, UserProfile Complete: ${userProfile?.profileSetupComplete}`);
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Loader2 className="h-16 w-16 animate-spin text-primary" />
      <p className="ml-4 text-lg text-foreground">{statusMessage}</p>
    </div>
  );
}
