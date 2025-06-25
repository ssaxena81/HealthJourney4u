
'use client';

import React, { useEffect, useState, useTransition as useReactTransition } from 'react';
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
import { updateUserTermsAcceptance } from '@/lib/firebase/client-firestore';
import { useToast } from '@/hooks/use-toast';
import { syncAllConnectedData } from '@/app/actions/syncActions';
import type { SyncResult, SyncAllResults } from '@/app/actions/syncActions';
import { SidebarProvider } from '@/components/ui/sidebar';

const LATEST_TERMS_VERSION = "1.0";

export default function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = useAuth();
  const { user, userProfile, loading: authAndProfileLoading, setUserProfileStateOnly } = auth;
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [isSyncing, startDataSyncTransition] = useReactTransition();

  useEffect(() => {
    if (authAndProfileLoading) {
      return; 
    }

    if (!user) {
      if (pathname !== '/login') {
         router.replace('/login');
      }
      return;
    }

    // After this point, the user object is guaranteed to exist.
    // The userProfile object may still be loading if getDoc is slow, but useAuth handles this.

    // If profile is loaded, perform checks
    if (userProfile) {
        // 1. Password expired -> show modal.
        if (userProfile.lastPasswordChangeDate) {
            const lastPasswordChange = new Date(userProfile.lastPasswordChangeDate);
            const daysSinceLastChange = (new Date().getTime() - lastPasswordChange.getTime()) / (1000 * 3600 * 24);
            if (daysSinceLastChange >= 90) {
                if (pathname !== '/reset-password-required') {
                    setShowPasswordResetModal(true);
                }
                return; 
            }
        }

        // 2. Terms not accepted -> show modal.
        if (userProfile.acceptedLatestTerms !== true || userProfile.termsVersionAccepted !== LATEST_TERMS_VERSION) {
            setShowTermsModal(true);
            return; 
        }

        // 3. Profile not set up -> must go to profile page for setup
        if (userProfile.profileSetupComplete !== true) {
            if (pathname !== '/profile') {
                router.replace('/profile');
            }
            return;
        }
    }
    
    // 4. User is fully authenticated and set up, but on an auth page -> redirect to dashboard
    if (pathname === '/login' || pathname === '/signup') {
        router.replace('/dashboard');
    }

  }, [user, userProfile, authAndProfileLoading, router, pathname]);

  const handleAcceptTerms = async () => {
    if (!user || !userProfile || !setUserProfileStateOnly) return;
    const result = await updateUserTermsAcceptance(user.uid, true, LATEST_TERMS_VERSION);
    if (result.success) {
      toast({ title: "Terms Accepted", description: "Thank you for accepting the terms and conditions." });
      
      setUserProfileStateOnly(prev => {
        if (!prev) return null;
        return {
          ...prev,
          acceptedLatestTerms: true,
          termsVersionAccepted: LATEST_TERMS_VERSION,
        };
      });
      setShowTermsModal(false);
    } else {
      toast({ title: "Error", description: result.error || "Could not update terms acceptance.", variant: "destructive" });
    }
  };

  const handleSyncAll = async () => {
    if (!user || !userProfile) {
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

    startDataSyncTransition(async () => {
      toast({ title: "Sync Started", description: "Fetching latest data from connected services...", duration: 3000 });
      const response: SyncAllResults = await syncAllConnectedData(user.uid);
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
    });
  };

  if (authAndProfileLoading || !user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">Loading session...</p>
      </div>
    );
  }
  
  // This state covers both initial profile loading and cases where the profile is not yet setup.
  // It prevents rendering children until the profile is confirmed to be ready and setup.
  if (!userProfile || (userProfile.profileSetupComplete !== true && pathname !== '/profile')) {
     return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">Loading profile...</p>
      </div>
    );
  }
  
  return (
    <SidebarProvider>
      <AppLayoutClient onSyncAllClick={handleSyncAll}>
        {children}
      </AppLayoutClient>

      <Dialog open={showTermsModal} onOpenChange={setShowTermsModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Terms and Conditions</DialogTitle>
            <DialogDescription>
              Please review and accept the latest terms and conditions (v{LATEST_TERMS_VERSION}) to continue.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-[60vh] overflow-y-auto">
            <p className="text-sm text-muted-foreground whitespace-pre-line">
              {`
Last Updated: [Current Date]
(Terms and Conditions text placeholder...)
              `}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" onClick={handleAcceptTerms}>Accept Terms (v{LATEST_TERMS_VERSION})</Button>
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
    </SidebarProvider>
  );
}
