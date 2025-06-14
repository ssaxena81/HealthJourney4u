
'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation'; // Ensure usePathname is imported
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

const LATEST_TERMS_VERSION = "1.0";

export default function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, userProfile, loading: authLoading, profileLoading, checkAuthState, setUserProfile } = useAuth();
  const router = useRouter();
  const pathname = usePathname(); // Get current pathname
  const { toast } = useToast();

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const combinedLoading = authLoading || profileLoading;

  console.log(`[AuthenticatedAppLayout TOP RENDER - Path: ${pathname}] Timestamp: ${new Date().toISOString()}`);
  console.log(`  AuthLoading: ${authLoading}, ProfileLoading: ${profileLoading}, CombinedLoading: ${combinedLoading}`);
  console.log(`  User Exists: ${!!user} (UID: ${user?.uid})`);
  console.log(`  UserProfile Exists: ${!!userProfile} (ID: ${userProfile?.id}, SetupComplete: ${userProfile?.profileSetupComplete})`);

  useEffect(() => {
    console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] Timestamp: ${new Date().toISOString()}`);
    console.log(`  AuthLoading: ${authLoading}, ProfileLoading: ${profileLoading}, CombinedLoading: ${combinedLoading}`);
    console.log(`  User Exists: ${!!user} (UID: ${user?.uid})`);
    console.log(`  UserProfile Exists: ${!!userProfile} (ID: ${userProfile?.id}, SetupComplete: ${userProfile?.profileSetupComplete})`);
    console.log(`  Accepted Terms: ${userProfile?.acceptedLatestTerms}, Version: ${userProfile?.termsVersionAccepted} (Latest: ${LATEST_TERMS_VERSION})`);


    if (combinedLoading) {
      console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] CombinedLoading is TRUE. Waiting...`);
      return;
    }
    console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] CombinedLoading is FALSE. Proceeding with checks.`);

    // Check 1: No User
    if (!user) {
      console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] User is NULL. Current path: ${pathname}.`);
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
      console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] UserProfile is NULL (User UID: ${user.uid}). Current path: ${pathname}.`);
      if (pathname !== '/profile') {
        console.log(`  Redirecting to /profile for setup.`);
        router.replace('/profile');
      } else {
        console.log(`  Already on /profile. No redirect needed.`);
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
        console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] Password EXPIRED. Current path: ${pathname}.`);
        if (pathname !== '/reset-password-required') {
            console.log(`  Showing password reset modal and will navigate via modal button.`);
            setShowPasswordResetModal(true);
        } else {
            console.log(`  Already on /reset-password-required. Modal might show if not dismissed.`);
        }
        return; 
      }
    } else {
      console.warn(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] Last password change date missing for user ${userProfile.id}. Consider forcing reset.`);
      // setShowPasswordResetModal(true); // Optionally force reset if date is missing
    }
    console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] Password not expired or date missing (logged warning).`);


    // Check 4: Terms and Conditions
    if (userProfile.acceptedLatestTerms !== true || userProfile.termsVersionAccepted !== LATEST_TERMS_VERSION) {
      console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] Terms NOT ACCEPTED or version mismatch. Current path: ${pathname}.`);
      setShowTermsModal(true);
      return; 
    } else {
      setShowTermsModal(false);
    }
    console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] Terms are ACCEPTED.`);

    // Check 5: Profile Setup Completion
    if (userProfile.profileSetupComplete !== true) {
      console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] Profile setup INCOMPLETE. Current path: ${pathname}.`);
      if (pathname !== '/profile') {
        console.log(`  Redirecting to /profile.`);
        router.replace('/profile');
      } else {
        console.log(`  Already on /profile. No redirect needed.`);
      }
      return;
    }
    console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] Profile setup is COMPLETE.`);

    console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] All checks passed. User: ${user.uid}, Profile: ${userProfile.id}.`);

  }, [user, userProfile, combinedLoading, authLoading, profileLoading, router, pathname, setUserProfile /* Added setUserProfile as it's used in handleAcceptTerms which is in scope */]);

  const handleAcceptTerms = async () => {
    if (!user || !userProfile) return;
    const result = await updateUserTermsAcceptance(user.uid, true, LATEST_TERMS_VERSION);
    if (result.success) {
      toast({ title: "Terms Accepted", description: "Thank you for accepting the terms and conditions." });
      // Critical: Update local userProfile state
      if (setUserProfile) {
        setUserProfile(prev => prev ? ({ ...prev, acceptedLatestTerms: true, termsVersionAccepted: LATEST_TERMS_VERSION }) : null);
      }
      setShowTermsModal(false);
      // After accepting terms, if profile setup is still incomplete and not on profile, redirect.
      // This re-evaluates the useEffect conditions.
      if (userProfile.profileSetupComplete !== true && pathname !== '/profile') {
        console.log('[AuthenticatedAppLayout handleAcceptTerms] Terms accepted, profile incomplete, redirecting to /profile.');
        router.replace('/profile');
      } else if (userProfile.profileSetupComplete === true && (pathname === '/profile' || pathname ==='/')) {
        // If profile is complete AND they were on /profile (perhaps just for terms) or on root, ensure they go to the main app view.
        console.log('[AuthenticatedAppLayout handleAcceptTerms] Terms accepted, profile complete, ensuring navigation to / (dashboard).');
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
    await checkAuthState();
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

  // --- Post-loading checks for rendering ---
  // These are fallbacks; useEffect should handle redirects.
  // If these are hit, it means a redirect is likely imminent or there's a rapid state change.

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
    console.log(`[AuthenticatedAppLayout RENDER - Path: ${pathname}] UserProfile is NULL (User: ${user.uid}, and not combinedLoading). useEffect should redirect to /profile.`);
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-amber-500" />
        <p className="ml-4 text-lg text-amber-600">Profile data missing. Redirecting to setup...</p>
      </div>
    );
  }

  // If terms are not accepted, the modal will show. The useEffect handles this.
  // If profile setup is not complete and we are NOT on /profile, useEffect redirects.
  // If we are on /profile and setup is not complete, we should render the profile page.
  // This explicit check is a safeguard in case useEffect redirect is slow or there's a specific scenario.
  if (userProfile.profileSetupComplete !== true && pathname !== '/profile') {
    console.log(`[AuthenticatedAppLayout RENDER - Path: ${pathname}] Profile setup INCOMPLETE and NOT on /profile page. useEffect should redirect.`);
     return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">Profile setup incomplete. Redirecting...</p>
      </div>
    );
  }

  // If all checks pass (or modals are handling their state), render the app.
  console.log(`[AuthenticatedAppLayout RENDER - Path: ${pathname}] All checks passed or modals handle state. Rendering AppLayoutClient.`);
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

    