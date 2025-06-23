
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
  const auth = useAuth();
  const { user, userProfile, loading: authAndProfileLoading, setUserProfileStateOnly } = auth;
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [isSyncing, startDataSyncTransition] = useReactTransition();

  useEffect(() => {
    // This hook now runs only when the user's state is stable and loaded.
    if (authAndProfileLoading) {
      return; // Wait for auth context to be fully resolved
    }

    // 1. No user -> must go to login
    if (!user) {
      if (pathname !== '/login') router.replace('/login');
      return;
    }

    // After this point, the user object is guaranteed to exist.

    // 2. Password expired -> show modal. The modal button will navigate.
    if (userProfile?.lastPasswordChangeDate) {
      const lastPasswordChange = new Date(userProfile.lastPasswordChangeDate);
      const daysSinceLastChange = (new Date().getTime() - lastPasswordChange.getTime()) / (1000 * 3600 * 24);
      if (daysSinceLastChange >= 90) {
        if (pathname !== '/reset-password-required') {
          setShowPasswordResetModal(true);
        }
        return; // Stop further checks if password needs reset
      }
    }

    // 3. Terms not accepted -> show modal.
    if (userProfile && (userProfile.acceptedLatestTerms !== true || userProfile.termsVersionAccepted !== LATEST_TERMS_VERSION)) {
      setShowTermsModal(true);
      return; // Stop further checks if terms need acceptance
    }

    // 4. Profile not set up -> must go to profile page for setup
    if (userProfile && userProfile.profileSetupComplete !== true) {
      if (pathname !== '/profile') {
        // Use a full page reload to avoid race conditions with the auth context
        window.location.assign('/profile');
      }
      return;
    }
    
    // 5. User is fully authenticated and set up, but on an auth page -> redirect to dashboard
    if (pathname === '/login' || pathname === '/signup') {
        router.replace('/dashboard');
        return;
    }

  }, [user, userProfile, authAndProfileLoading, router, pathname]);

  const handleAcceptTerms = async () => {
    if (!user || !userProfile || !setUserProfileStateOnly) return;
    const result = await updateUserTermsAcceptance(user.uid, true, LATEST_TERMS_VERSION);
    if (result.success) {
      toast({ title: "Terms Accepted", description: "Thank you for accepting the terms and conditions." });
      
      // Manually update the profile in the context to prevent stale state
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

    startDataSyncTransition(async () => {
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
    });
  };

  // --- FIX [2024-07-26] ---
  // The race condition fix is here.
  // We show a consistent loading screen if the auth state is still loading OR if there is no user yet.
  // The useEffect hook above will handle the actual redirection while this loader is displayed,
  // preventing a "flash" of incorrect content or a premature redirect to login.
  if (authAndProfileLoading || !user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">Loading session...</p>
      </div>
    );
  }
  
  // If user is present but profile checks in useEffect are still pending redirection (e.g., to /profile)
  // this prevents rendering children that might not be appropriate for the intermediate state.
  if ((!userProfile || userProfile.profileSetupComplete !== true) && pathname !== '/profile') {
     return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">Loading profile...</p>
      </div>
    );
  }
  // --- END FIX ---


  // If all checks passed, render the full layout and any necessary modals.
  return (
    <>
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

1. Acceptance of Terms
By using this application (“App”), you (“User” or “Member”) agree to be bound by these Terms and Conditions, our Privacy Policy, and any additional terms and conditions that may apply to specific sections of the App or to products and services available through the App.

2. Modification of Terms
We reserve the right to change, modify, or update these Terms and Conditions at any time. You will be required to accept the revised terms before continuing to use the App.

3. User Accounts
You must be 18 years or older to create an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.

4. Subscription Services
Certain features of the App may require a paid subscription. Subscription fees, terms, and features for different tiers (Free, Silver, Gold, Platinum) will be clearly communicated.

5. Data Privacy and Security
We are committed to protecting your privacy. Our Privacy Policy, incorporated herein by reference, explains how we collect, use, and disclose your personal information and health data.

6. User Conduct
You agree not to use the App for any unlawful purpose or in any way that could damage, disable, overburden, or impair the App.

7. Intellectual Property
All content and materials available on the App, including but not limited to text, graphics, website name, code, images, and logos are the intellectual property of [Your Company Name] and are protected by applicable copyright and trademark law.

8. Termination
We may terminate or suspend your access to the App at any time, without prior notice or liability, for any reason, including if you breach these Terms and Conditions.

9. Disclaimers
The App is provided "as is" and "as available" without any warranties of any kind, express or implied. We do not warrant that the App will be uninterrupted, error-free, or free of viruses or other harmful components. This App does not provide medical advice.

10. Limitation of Liability
In no event shall [Your Company Name] be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the App.

11. Governing Law
These Terms and Conditions shall be governed by and construed in accordance with the laws of [Your Jurisdiction].

12. API Call Limits for Connected Services
Use of connected third-party services (e.g., Fitbit, Strava, Google Fit) through the App is subject to API call limits. These limits vary based on your subscription tier. Exceeding these limits may temporarily restrict data synchronization.
  - Free/Silver/Gold Tiers: Typically 1 manual full sync per 24 hours per service.
  - Platinum Tier: Typically 3 manual full syncs per 24 hours per service.
  Automated daily syncs are generally performed once per 24 hours for all tiers with connected services.

13. Password Security
Users are responsible for maintaining the security of their passwords. Passwords must be changed every 90 days.

14. Data from Connected Services
By connecting third-party services, you authorize us to access and store data as per our Privacy Policy and the terms of those services. We are not responsible for the accuracy or availability of data from third-party services.

15. Health Information
The App may allow you to store and track health information. You are responsible for the accuracy of any manually entered data. This App is not a substitute for professional medical advice, diagnosis, or treatment.

16. Emergency Situations
Do not rely on this App for emergency medical needs. If you experience a medical emergency, call your local emergency services immediately.

17. User-Generated Content
If you post content, you grant us a non-exclusive, royalty-free license to use, reproduce, and display such content in connection with the App.

18. Contact Information
For any questions about these Terms, please contact us at [Your Support Email Address].

19. Limitations on Medical Data Storage
We do not store raw lab results, clinical notes, or full medical records unless explicitly authorized by you. If authorized, data is encrypted and only retained as needed for your selected services.
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
    </>
  );
}

    