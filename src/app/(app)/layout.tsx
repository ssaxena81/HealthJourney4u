
'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter }
from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import AppLayoutClient from '@/components/layout/app-layout-client';
import { updateUserTermsAcceptance } from '@/app/actions/auth';
import { useToast } from '@/hooks/use-toast';
import { syncAllConnectedData } from '@/app/actions/syncActions';
import type { SyncResult } from '@/app/actions/syncActions';

// Define LATEST_TERMS_VERSION, ensure it's consistent or fetched
const LATEST_TERMS_VERSION = "1.0"; // Replace with actual or fetched version

export default function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, userProfile, loading: authLoading, profileLoading, checkAuthState, setUserProfile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Combined loading state
  const combinedLoading = authLoading || profileLoading;

  console.log(`[AuthenticatedAppLayout RENDER] Path: ${pathname}, CombinedLoading: ${combinedLoading}, User: ${!!user}, UserProfile: ${!!userProfile}, AuthLoading: ${authLoading}, ProfileLoading: ${profileLoading}`);

  useEffect(() => {
    console.log(`[AuthenticatedAppLayout useEffect RUN] Path: ${pathname}, CombinedLoading: ${combinedLoading}, User: ${!!user}, UserProfile: ${!!userProfile}, ProfileSetupComplete: ${userProfile?.profileSetupComplete}`);

    if (combinedLoading) {
      console.log(`[AuthenticatedAppLayout useEffect - WAITING] Path: ${pathname}. Still loading auth/profile. No action.`);
      return;
    }

    // AFTER LOADING IS COMPLETE:
    console.log(`[AuthenticatedAppLayout useEffect - LOADED] Path: ${pathname}. Auth and profile loading complete. User: ${user?.uid}, Profile: ${userProfile?.id}`);

    // 1. Check for authenticated user
    if (!user) {
      console.log(`[AuthenticatedAppLayout useEffect - NO USER] Path: ${pathname}. User is null. Redirecting to /login.`);
      if (pathname !== '/login') {
        router.replace('/login');
      }
      return;
    }

    // 2. User exists, check for profile
    if (!userProfile) {
      console.log(`[AuthenticatedAppLayout useEffect - NO PROFILE] Path: ${pathname}. User exists, but no profile. Redirecting to /profile for setup.`);
      if (pathname !== '/profile') {
        router.replace('/profile');
      }
      return;
    }

    // 3. User and Profile exist, check password expiry
    if (userProfile.lastPasswordChangeDate) {
      const lastPasswordChange = new Date(userProfile.lastPasswordChangeDate);
      const now = new Date();
      const daysSinceLastChange = (now.getTime() - lastPasswordChange.getTime()) / (1000 * 3600 * 24);
      if (daysSinceLastChange >= 90) {
        console.log(`[AuthenticatedAppLayout useEffect - PASSWORD EXPIRED] Path: ${pathname}. Password expired. Showing reset modal.`);
        if (pathname !== '/reset-password-required') {
          setShowPasswordResetModal(true); // Show modal, navigation handled by modal action
        }
        return; // Stop further checks if password reset is required
      }
    } else {
      console.warn(`[AuthenticatedAppLayout useEffect - NO PASSWORD CHANGE DATE] Path: ${pathname}. Last password change date missing. Consider forcing reset.`);
      // Potentially treat as expired or prompt user. For now, logging and proceeding.
      // setShowPasswordResetModal(true);
    }

    // 4. Check Terms and Conditions
    if (userProfile.acceptedLatestTerms !== true || userProfile.termsVersionAccepted !== LATEST_TERMS_VERSION) {
      console.log(`[AuthenticatedAppLayout useEffect - TERMS NOT ACCEPTED] Path: ${pathname}. Terms not accepted or version mismatch. Showing terms modal.`);
      setShowTermsModal(true);
      return; // Stop further checks if terms modal is shown
    } else {
      setShowTermsModal(false); // Ensure it's closed if terms are fine
    }
    
    // 5. Check profile setup completion (if not already on /profile)
    if (userProfile.profileSetupComplete !== true) {
      console.log(`[AuthenticatedAppLayout useEffect - PROFILE NOT COMPLETE] Path: ${pathname}. Profile setup incomplete. Redirecting to /profile.`);
      if (pathname !== '/profile') {
        router.replace('/profile');
      }
      return;
    }

    console.log(`[AuthenticatedAppLayout useEffect - ALL CHECKS PASSED] Path: ${pathname}. User authenticated, profile complete, terms accepted, password not expired.`);

  }, [user, userProfile, authLoading, profileLoading, router, pathname]);

  const handleAcceptTerms = async () => {
    if (!user || !userProfile) return;
    const result = await updateUserTermsAcceptance(user.uid, true, LATEST_TERMS_VERSION);
    if (result.success) {
      toast({ title: "Terms Accepted", description: "Thank you for accepting the terms and conditions." });
      setUserProfile(prev => prev ? ({ ...prev, acceptedLatestTerms: true, termsVersionAccepted: LATEST_TERMS_VERSION }) : null);
      setShowTermsModal(false);
      // Re-run checks or simply let the normal flow continue
      if (userProfile.profileSetupComplete !== true && pathname !== '/profile') {
        router.replace('/profile');
      } else if (userProfile.profileSetupComplete === true && pathname === '/profile') {
        // If profile is complete and they were on /profile just for terms, send to dashboard
        router.replace('/');
      }
    } else {
      toast({ title: "Error", description: result.error || "Could not update terms acceptance.", variant: "destructive" });
    }
  };

  const handleSyncAll = async () => {
    if (!userProfile) {
        toast({ title: "Sync Error", description: "User profile not available.", variant: "destructive" });
        return;
    }
    if (userProfile.subscriptionTier === 'free') {
        toast({
            title: "Sync Feature",
            description: "Manual 'Sync All' is available for Silver tier and above. Free tier syncs data sources automatically upon initial connection.",
            variant: "default",
            duration: 7000,
        });
        return;
    }

    setIsSyncing(true);
    toast({ title: "Sync Started", description: "Fetching latest data from connected services...", duration: 3000 });

    const results: SyncResult[] = await syncAllConnectedData();
    let overallSuccess = true;
    let successCount = 0;
    let errorCount = 0;

    results.forEach(result => {
        if (result.success) {
            successCount++;
            toast({
                title: `Sync Success: ${result.service}`,
                description: result.message || `${result.activitiesProcessed || 0} activities/items processed.`,
                variant: "default"
            });
        } else {
            errorCount++;
            overallSuccess = false;
            toast({
                title: `Sync Error: ${result.service}`,
                description: result.error || "An unknown error occurred.",
                variant: "destructive"
            });
        }
    });

    if (results.length === 0) {
         toast({ title: "Sync Complete", description: "No services were actively synced or configured for sync.", variant: "default"});
    } else if (overallSuccess) {
        toast({ title: "Sync Successful", description: `All connected services synced successfully. ${successCount} services updated.`, duration: 5000 });
    } else {
        toast({ title: "Sync Partially Successful", description: `${successCount} services synced, ${errorCount} encountered errors. Check individual notifications.`, variant: "default", duration: 7000 });
    }
    setIsSyncing(false);
    await checkAuthState(); // Refresh auth state and profile to get latest sync timestamps
  };


  if (combinedLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">Loading session...</p>
      </div>
    );
  }

  // If, after loading, there's no user, something is wrong (useEffect should redirect)
  // This is a fallback visual state.
  if (!user && !combinedLoading) {
     console.log(`[AuthenticatedAppLayout RENDER - NO USER FALLBACK] Path: ${pathname}. No user and not loading. Redirect to /login expected from useEffect.`);
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-destructive" />
        <p className="ml-4 text-lg text-destructive">Session expired or not found. Redirecting...</p>
      </div>
    );
  }
  
  // If user exists, but profile doesn't (and not loading profile), also problematic.
  if (user && !userProfile && !profileLoading && !authLoading) {
    console.log(`[AuthenticatedAppLayout RENDER - NO PROFILE FALLBACK] Path: ${pathname}. User exists, no profile, not loading. Redirect to /profile expected from useEffect.`);
     return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-amber-500" />
        <p className="ml-4 text-lg text-amber-600">Profile data missing. Redirecting to setup...</p>
      </div>
    );
  }
  
  // If user and profile exist, but setup is not complete AND we are NOT on /profile page
  // This can happen if a direct navigation attempt is made to another page before profile setup
  if (user && userProfile && userProfile.profileSetupComplete !== true && pathname !== '/profile') {
    console.log(`[AuthenticatedAppLayout RENDER - PROFILE INCOMPLETE & NOT ON /profile] Path: ${pathname}. Redirect to /profile expected from useEffect.`);
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">Profile setup incomplete. Redirecting...</p>
      </div>
    );
  }


  return (
    <>
      <AppLayoutClient onSyncAllClick={handleSyncAll} >
        {children}
      </AppLayoutClient>

      <Dialog open={showTermsModal} onOpenChange={setShowTermsModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Terms and Conditions</DialogTitle>
            <DialogDescription>
              Please review and accept the latest terms and conditions to continue.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {/* Placeholder for terms content - ideally fetched or imported */}
            <p className="text-sm text-muted-foreground">
              The full terms and conditions text would be displayed here.
              For now, this is a placeholder. By clicking "Accept", you agree to version {LATEST_TERMS_VERSION}.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" onClick={handleAcceptTerms}>Accept Terms</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPasswordResetModal} onOpenChange={setShowPasswordResetModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Password Expired</DialogTitle>
            <DialogDescription>
              For your security, your password has expired. Please create a new one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => router.push('/reset-password-required')}>Reset Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

