
'use client';

import React, { useEffect, useState, useTransition } from 'react';
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
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [isSyncing, setIsSyncing] = useTransition(); // Changed to useTransition

  // `loading` from useAuth now represents the combined auth and initial profile loading state.
  const combinedLoading = loading; 

  console.log(`[AuthenticatedAppLayout TOP RENDER - Path: ${pathname}] Timestamp: ${new Date().toISOString()}`);
  console.log(`  Auth State: User UID: ${user?.uid}, UserProfile ID: ${userProfile?.id}, CombinedLoading: ${combinedLoading}, ProfileSetupComplete: ${userProfile?.profileSetupComplete}`);

  useEffect(() => {
    const effectTimestamp = new Date().toISOString();
    console.log(`[AuthenticatedAppLayout useEffect - Path: ${pathname}] TRIGGERED. Timestamp: ${effectTimestamp}`);
    console.log(`  EFFECT STATE: User UID: ${user?.uid}, UserProfile ID: ${userProfile?.id}, CombinedLoading: ${combinedLoading}, ProfileSetupComplete: ${userProfile?.profileSetupComplete}`);
    console.log(`  EFFECT STATE: Terms: Accepted: ${userProfile?.acceptedLatestTerms}, Version: ${userProfile?.termsVersionAccepted} (Latest: ${LATEST_TERMS_VERSION})`);

    if (combinedLoading) {
      console.log(`  [useEffect DECISION @ ${effectTimestamp}] CombinedLoading is TRUE. Waiting...`);
      return;
    }
    console.log(`  [useEffect @ ${effectTimestamp}] CombinedLoading is FALSE. Proceeding with checks.`);

    // Check 1: No User
    if (!user) {
      console.log(`  [useEffect DECISION @ ${effectTimestamp}] User is NULL.`);
      if (pathname !== '/login') {
        console.log(`    Redirecting to /login. Current path: ${pathname}`);
        router.replace('/login');
      } else {
        console.log(`    Already on /login. No redirect needed.`);
      }
      return;
    }
    console.log(`  [useEffect @ ${effectTimestamp}] User is PRESENT (UID: ${user.uid}).`);

    // Check 2: No User Profile (but user exists)
    if (!userProfile) {
      console.log(`  [useEffect DECISION @ ${effectTimestamp}] User present, UserProfile is NULL.`);
      // This state implies initial profile fetch finished but found no profile,
      // or user signed up but profile creation in DB failed/is pending.
      if (pathname !== '/profile') {
        console.log(`    Redirecting to /profile for setup as UserProfile is missing. Current path: ${pathname}`);
        router.replace('/profile');
      } else {
        console.log(`    Already on /profile. No redirect needed (UserProfile missing).`);
      }
      return;
    }
    console.log(`  [useEffect @ ${effectTimestamp}] UserProfile is PRESENT (ID: ${userProfile.id}).`);

    // Check 3: Password Expiry (User and UserProfile exist)
    if (userProfile.lastPasswordChangeDate) {
      const lastPasswordChange = new Date(userProfile.lastPasswordChangeDate);
      const now = new Date();
      const daysSinceLastChange = (now.getTime() - lastPasswordChange.getTime()) / (1000 * 3600 * 24);
      if (daysSinceLastChange >= 90) {
        console.log(`  [useEffect DECISION @ ${effectTimestamp}] Password EXPIRED (Last change: ${userProfile.lastPasswordChangeDate}, Days: ${daysSinceLastChange.toFixed(1)}).`);
        if (pathname !== '/reset-password-required') {
            console.log(`    Showing password reset modal. Current path: ${pathname}`);
            setShowPasswordResetModal(true); // Modal will handle navigation
        } else {
            console.log(`    Already on /reset-password-required.`);
        }
        return; 
      }
    } else {
      console.warn(`  [useEffect @ ${effectTimestamp}] Last password change date missing for user ${userProfile.id}. Password expiry check skipped.`);
    }
    console.log(`  [useEffect @ ${effectTimestamp}] Password not expired or date missing.`);

    // Check 4: Terms and Conditions (only if password not expired)
    if (userProfile.acceptedLatestTerms !== true || userProfile.termsVersionAccepted !== LATEST_TERMS_VERSION) {
      console.log(`  [useEffect DECISION @ ${effectTimestamp}] Terms NOT ACCEPTED or version mismatch (Accepted: ${userProfile.acceptedLatestTerms}, Version: ${userProfile.termsVersionAccepted}).`);
      setShowTermsModal(true);
      return; 
    } else {
      setShowTermsModal(false); // Ensure modal is hidden if terms are accepted
    }
    console.log(`  [useEffect @ ${effectTimestamp}] Terms are ACCEPTED.`);

    // Check 5: Profile Setup Completion (only if terms accepted and password not expired)
    if (userProfile.profileSetupComplete !== true) {
      console.log(`  [useEffect DECISION @ ${effectTimestamp}] Profile setup INCOMPLETE (Value: ${userProfile.profileSetupComplete}).`);
      if (pathname !== '/profile') {
        console.log(`    Redirecting to /profile because profile setup is incomplete. Current path: ${pathname}`);
        router.replace('/profile');
      } else {
        console.log(`    Already on /profile. No redirect needed (profile setup incomplete).`);
      }
      return;
    }
    console.log(`  [useEffect @ ${effectTimestamp}] Profile setup is COMPLETE.`);

    // Check 6: If user is authenticated & profile complete but on an auth page, redirect to dashboard
    if (pathname === '/login' || pathname === '/signup') {
        console.log(`  [useEffect DECISION @ ${effectTimestamp}] User is authenticated, profile complete, but on auth page (${pathname}). Redirecting to /.`);
        router.replace('/');
        return;
    }

    console.log(`  [useEffect @ ${effectTimestamp}] All checks passed or handled. User: ${user.uid}, Profile: ${userProfile.id}. Pathname: ${pathname}`);

  }, [user, userProfile, combinedLoading, router, pathname]);

  const handleAcceptTerms = async () => {
    if (!user || !userProfile) return;
    const result = await updateUserTermsAcceptance(user.uid, true, LATEST_TERMS_VERSION);
    if (result.success) {
      toast({ title: "Terms Accepted", description: "Thank you for accepting the terms and conditions." });
      setShowTermsModal(false);
      // AuthProvider's onAuthStateChanged -> fetchUserProfile will eventually get the latest profile,
      // which will cause the useEffect to re-evaluate.
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

    startTransition(async () => {
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

  if (combinedLoading) {
    console.log(`[AuthenticatedAppLayout RENDER - Path: ${pathname}] CombinedLoading is TRUE. Displaying main loader.`);
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">Loading session...</p>
      </div>
    );
  }

  // The checks below are fallbacks or for pages that might render before useEffect completes its first full run after login.
  // The useEffect should be the primary driver of redirections for consistency.
  if (!user) {
    console.log(`[AuthenticatedAppLayout RENDER - Path: ${pathname}] User is NULL (and not combinedLoading). useEffect should handle redirect to /login if not already there.`);
     return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-destructive" />
        <p className="ml-4 text-lg text-destructive">Session not found. Redirecting to login...</p>
      </div>
    );
  }

  if (!userProfile && pathname !== '/profile') { // Allow /profile to render even if userProfile is briefly null, as that's where setup occurs
    console.log(`[AuthenticatedAppLayout RENDER - Path: ${pathname}] UserProfile is NULL (User: ${user.uid}, and not combinedLoading). useEffect should handle redirect to /profile for setup.`);
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-amber-500" />
        <p className="ml-4 text-lg text-amber-600">Profile data loading or missing. Redirecting...</p>
      </div>
    );
  }
  
  if (userProfile && userProfile.profileSetupComplete !== true && pathname !== '/profile') {
    console.log(`[AuthenticatedAppLayout RENDER - Path: ${pathname}] Profile setup INCOMPLETE and NOT on /profile page. useEffect should redirect.`);
     return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-foreground">Profile setup incomplete. Redirecting...</p>
      </div>
    );
  }

  console.log(`[AuthenticatedAppLayout RENDER - Path: ${pathname}] All checks passed or modals/redirects handled. Rendering AppLayoutClient.`);
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
