
'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
import type { SyncResult, SyncAllResults } from '@/app/actions/syncActions';

const LATEST_TERMS_VERSION = "1.0";

export default function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, userProfile, loading } = useAuth(); // Removed setUserProfile, checkAuthState from destructuring
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const combinedLoading = loading; // Simplified: AuthProvider's `loading` now covers both auth and initial profile fetch

  console.log(`[AuthenticatedAppLayout TOP RENDER - Path: ${pathname}] Timestamp: ${new Date().toISOString()}`);
  console.log(`  User UID: ${user?.uid}, UserProfile ID: ${userProfile?.id}, CombinedLoading: ${combinedLoading}, ProfileSetupComplete: ${userProfile?.profileSetupComplete}`);

  useEffect(() => {
    console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] TRIGGERED. Timestamp: ${new Date().toISOString()}`);
    console.log(`  EFFECT STATE: User UID: ${user?.uid}, UserProfile ID: ${userProfile?.id}, CombinedLoading: ${combinedLoading}, ProfileSetupComplete: ${userProfile?.profileSetupComplete}`);
    console.log(`  EFFECT STATE: Accepted Terms: ${userProfile?.acceptedLatestTerms}, Version: ${userProfile?.termsVersionAccepted} (Latest: ${LATEST_TERMS_VERSION})`);

    if (combinedLoading) {
      console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] CombinedLoading is TRUE. Waiting...`);
      return;
    }
    console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] CombinedLoading is FALSE. Proceeding with checks.`);

    // Check 1: No User
    if (!user) {
      console.log(`[AuthenticatedAppLayout useEffect DECISION - Path: ${pathname}] User is NULL.`);
      if (pathname !== '/login') {
        console.log(`  Redirecting to /login.`);
        router.replace('/login');
      } else {
        console.log(`  Already on /login. No redirect needed.`);
      }
      return;
    }
    console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] User is PRESENT (UID: ${user.uid}).`);

    // Check 2: No User Profile (but user exists)
    if (!userProfile) {
      console.log(`[AuthenticatedAppLayout useEffect DECISION - Path: ${pathname}] User present, UserProfile is NULL.`);
      if (pathname !== '/profile') {
        console.log(`  Redirecting to /profile for setup as UserProfile is missing.`);
        router.replace('/profile');
      } else {
        console.log(`  Already on /profile. No redirect needed (UserProfile missing).`);
      }
      return;
    }
    console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] UserProfile is PRESENT (ID: ${userProfile.id}).`);

    // Check 3: Password Expiry (User and UserProfile exist)
    if (userProfile.lastPasswordChangeDate) {
      const lastPasswordChange = new Date(userProfile.lastPasswordChangeDate);
      const now = new Date();
      const daysSinceLastChange = (now.getTime() - lastPasswordChange.getTime()) / (1000 * 3600 * 24);
      if (daysSinceLastChange >= 90) {
        console.log(`[AuthenticatedAppLayout useEffect DECISION - Path: ${pathname}] Password EXPIRED.`);
        if (pathname !== '/reset-password-required') {
            console.log(`  Showing password reset modal.`);
            setShowPasswordResetModal(true); // Modal will handle navigation
        } else {
            console.log(`  Already on /reset-password-required.`);
        }
        return; // Return here to ensure other checks don't run if password expired
      }
    } else {
      console.warn(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] Last password change date missing for user ${userProfile.id}.`);
    }
    console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] Password not expired or date missing.`);

    // Check 4: Terms and Conditions (only if password not expired)
    if (userProfile.acceptedLatestTerms !== true || userProfile.termsVersionAccepted !== LATEST_TERMS_VERSION) {
      console.log(`[AuthenticatedAppLayout useEffect DECISION - Path: ${pathname}] Terms NOT ACCEPTED or version mismatch.`);
      setShowTermsModal(true);
      return; // Return here to ensure profile setup check doesn't run if terms modal is shown
    } else {
      setShowTermsModal(false);
    }
    console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] Terms are ACCEPTED.`);

    // Check 5: Profile Setup Completion (only if terms accepted and password not expired)
    if (userProfile.profileSetupComplete !== true) {
      console.log(`[AuthenticatedAppLayout useEffect DECISION - Path: ${pathname}] Profile setup INCOMPLETE.`);
      if (pathname !== '/profile') {
        console.log(`  Redirecting to /profile because profile setup is incomplete.`);
        router.replace('/profile');
      } else {
        console.log(`  Already on /profile. No redirect needed (profile setup incomplete).`);
      }
      return;
    }
    console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] Profile setup is COMPLETE.`);

    // If user is on /login or /signup page but is fully authenticated and profile complete, redirect to dashboard
    if (pathname === '/login' || pathname === '/signup') { // No need to check user/profile again here, already confirmed above
        console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] User is authenticated, profile complete, but on an auth page. Redirecting to /.`);
        router.replace('/');
        return;
    }

    console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] All checks passed or handled. User: ${user.uid}, Profile: ${userProfile.id}.`);

  }, [user, userProfile, combinedLoading, router, pathname]); // Simplified dependencies

  const handleAcceptTerms = async () => {
    if (!user || !userProfile) return;
    // optimistic update for setUserProfile is removed as setUserProfile is no longer in useAuth destructuring here
    // AuthProvider's onAuthStateChanged -> fetchUserProfile will eventually get the latest profile
    const result = await updateUserTermsAcceptance(user.uid, true, LATEST_TERMS_VERSION);
    if (result.success) {
      toast({ title: "Terms Accepted", description: "Thank you for accepting the terms and conditions." });
      setShowTermsModal(false);
      // Re-trigger checks by causing a state change that useEffect depends on, or rely on next natural re-render.
      // For now, the effect will re-run due to userProfile potentially changing after fetch.
      // If profile was incomplete, it will redirect to /profile; otherwise, it stays or goes to /.
    } else {
      toast({ title: "Error", description: result.error || "Could not update terms acceptance.", variant: "destructive" });
    }
  };

  const handleSyncAll = async () => {
    if (!userProfile) {
        toast({ title: "Sync Error", description: "User profile not available.", variant: "destructive" });
        return;
    }
    // Subscription tier check logic...
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

    const response: SyncAllResults = await syncAllConnectedData();
    let overallSuccess = response.success;
    let successCount = 0;
    let errorCount = 0;

    if (response.results && Array.isArray(response.results)) {
      response.results.forEach((result: SyncResult) => {
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
                  description: result.message || result.errorCode || "An unknown error occurred.",
                  variant: "destructive"
              });
          }
      });
    }

    if (!response.results || response.results.length === 0) {
         toast({ title: "Sync Complete", description: response.error || "No services were actively synced or configured for sync.", variant: response.error ? "destructive" : "default"});
    } else if (overallSuccess && errorCount === 0) {
        toast({ title: "Sync Successful", description: `All connected services synced successfully. ${successCount} services updated.`, duration: 5000 });
    } else {
        toast({ title: "Sync Partially Successful", description: `${successCount} services synced, ${errorCount} encountered errors. Check individual notifications.`, variant: "default", duration: 7000 });
    }
    setIsSyncing(false);
    // await checkAuthState(); // checkAuthState removed from useAuth destructuring; onAuthStateChanged handles updates.
    // Re-fetching profile might be needed if sync affects profile details directly in UserProfile object,
    // but for now, sync primarily affects sub-collections.
  };

  if (combinedLoading) {
    console.log(`[AuthenticatedAppLayout RENDER - Path: ${pathname}] CombinedLoading is TRUE. Displaying main loader.`);
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">Loading session...</p>
      </div>
    );
  }

  // The checks below are fallbacks; useEffect should handle redirection if conditions met.
  if (!user) {
    console.log(`[AuthenticatedAppLayout RENDER - Path: ${pathname}] User is NULL (and not combinedLoading). useEffect should redirect to /login.`);
     return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-destructive" />
        <p className="ml-4 text-lg text-destructive">Session not found. Redirecting to login...</p>
      </div>
    );
  }

  if (!userProfile) {
    console.log(`[AuthenticatedAppLayout RENDER - Path: ${pathname}] UserProfile is NULL (User: ${user.uid}, and not combinedLoading). useEffect should redirect to /profile for setup.`);
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-amber-500" />
        <p className="ml-4 text-lg text-amber-600">Profile data missing. Redirecting to profile setup...</p>
      </div>
    );
  }
  
  // This specific render-time check is only for when not on /profile page itself.
  // If on /profile, we let it render even if setup is incomplete, as that's where setup happens.
  if (userProfile.profileSetupComplete !== true && pathname !== '/profile') {
    console.log(`[AuthenticatedAppLayout RENDER - Path: ${pathname}] Profile setup INCOMPLETE and NOT on /profile page. useEffect should redirect. Displaying interim loader.`);
     return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">Profile setup incomplete. Redirecting...</p>
      </div>
    );
  }

  console.log(`[AuthenticatedAppLayout RENDER - Path: ${pathname}] All checks passed or modals/redirects handle state. Rendering AppLayoutClient.`);
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
            <Button type="button" onClick={() => { setShowPasswordResetModal(false); router.push('/reset-password-required'); }}>Reset Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

    