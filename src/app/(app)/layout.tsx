
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import AppLayoutClient from '@/components/layout/app-layout-client';
import { Toaster } from "@/components/ui/toaster";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { UserProfile } from '@/types';
import { updateUserTermsAcceptance } from '@/app/actions/auth';
import { Loader2 } from 'lucide-react';

const LATEST_TERMS_AND_CONDITIONS = `
Version 2.0 - Effective Date: ${new Date().toLocaleDateString()}

Welcome to Health Timeline!

1. Acceptance of Terms
   By accessing or using Health Timeline ("the App"), you agree to be bound by these Terms and Conditions ("T&C"). If you do not agree to all of these T&C, do not use this App.

2. Description of Service
   The App provides users with tools to track and visualize their health data from various sources. Features may vary based on subscription tier.

3. User Accounts
   You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account.

4. User Data and Privacy
   We are committed to protecting your privacy. Our Privacy Policy, which is incorporated into these T&C by reference, explains how we collect, use, and share your personal information.
   You grant us a license to use the data you provide through the App solely for the purpose of providing and improving the App's services.
   We do not own your data. You retain all ownership rights to your data.

5. Subscription Tiers and Payments
   The App offers different subscription tiers. Fees for paid tiers are billed in advance on a recurring basis. All payments are non-refundable except as required by law or as explicitly stated.

6. Prohibited Conduct
   You agree not to use the App for any unlawful purpose or in any way that could damage, disable, overburden, or impair the App.

7. Disclaimers
   THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE APP WILL BE UNINTERRUPTED, ERROR-FREE, OR COMPLETELY SECURE. HEALTH TIMELINE IS NOT A MEDICAL DEVICE AND SHOULD NOT BE USED FOR SELF-DIAGNOSIS OR TREATMENT. ALWAYS CONSULT WITH A QUALIFIED HEALTHCARE PROFESSIONAL FOR ANY HEALTH CONCERNS OR BEFORE MAKING ANY DECISIONS RELATED TO YOUR HEALTH.

8. Limitation of Liability
   TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL HEALTH TIMELINE OR ITS AFFILIATES, OFFICERS, EMPLOYEES, AGENTS, SUPPLIERS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM YOUR ACCESS TO OR USE OF OR INABILITY TO ACCESS OR USE THE APP.

9. Changes to Terms
   We reserve the right to modify these T&C at any time. We will notify you of any changes by posting the new T&C on this page and updating the "Effective Date" at the top. Your continued use of the App after any such change constitutes your acceptance of the new T&C. If you do not agree to any of these T&C or any changes to these T&C, do not use, access or continue to access the App.

10. Governing Law
    These T&C shall be governed by and construed in accordance with the laws of the jurisdiction in which the App provider is based, without regard to its conflict of law provisions.

11. Contact Us
    If you have any questions about these T&C, please contact us at support@healthtimeline.example.com.
    
This is a very long text to ensure scrolling is needed. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
Section 2: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
Section 3: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
End of Terms and Conditions.
`;


export default function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, loading: authLoading, userProfile, setUserProfile, loading: profileLoading } = useAuth();
  const router = useRouter();
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsScrolledToEnd, setTermsScrolledToEnd] = useState(false);
  const [termsAcceptedCheckbox, setTermsAcceptedCheckbox] = useState(false);
  
  const isLoading = authLoading || profileLoading;

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (userProfile) { // Profile is loaded
        // Check for password expiry
        const lastPasswordChange = new Date(userProfile.lastPasswordChangeDate);
        const now = new Date();
        const daysSinceLastChange = (now.getTime() - lastPasswordChange.getTime()) / (1000 * 3600 * 24);
        
        if (daysSinceLastChange >= 90) {
          router.replace('/reset-password-required');
          return; 
        }

        // Check for T&C acceptance
        // Assuming '2.0' is the latest version. This should ideally come from a config.
        if (!userProfile.acceptedLatestTerms || userProfile.termsVersionAccepted !== '2.0') {
          setShowTermsModal(true);
          return;
        }
        // All checks passed, user can see content
      } else if (!userProfile && !profileLoading && user) {
        // User is authenticated, profile loading finished, but profile is null
        // This might mean the profile document doesn't exist in Firestore yet.
        // For new users, they are redirected to /profile from signup-flow.tsx.
        // If an existing user somehow loses their profile doc, this is an edge case.
        // Consider redirecting to /profile or showing an error.
        // For now, if they reach here and profile is null, it's an issue.
        // However, the T&C check above might catch this if acceptedLatestTerms defaults to false.
        // Let's assume T&C check handles the initial state for new profiles.
        // If `acceptedLatestTerms` is not present (e.g. truly new profile not yet in DB), it will be false.
         if (!userProfile?.acceptedLatestTerms || userProfile?.termsVersionAccepted !== '2.0') {
            setShowTermsModal(true);
            return;
        }
      }
    }
  }, [user, isLoading, userProfile, profileLoading, router]);

  const handleScrollTerms = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 1) { // Added +1 for small pixel differences
      setTermsScrolledToEnd(true);
    }
  };

  const handleAcceptTerms = async () => {
    if (user && userProfile && termsAcceptedCheckbox && setUserProfile) {
      const result = await updateUserTermsAcceptance(user.uid, true, '2.0');
      if (result.success) {
         setUserProfile(prev => prev ? ({...prev, acceptedLatestTerms: true, termsVersionAccepted: '2.0'}) : null);
         setShowTermsModal(false);
         // No need to push, useEffect will re-evaluate and allow content rendering.
      } else {
        // Handle error - maybe show a toast
        console.error("Failed to update terms acceptance:", result.error);
      }
    }
  };

  if (isLoading) {
    return (
      <html lang="en">
        <body className="bg-background">
          <div className="flex min-h-screen items-center justify-center">
            <div className="flex flex-col items-center space-y-2">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading application...</p>
            </div>
          </div>
          <Toaster />
        </body>
      </html>
    );
  }
  
  // If user is null after loading, useEffect should have redirected to /login.
  // This is a fallback or for the brief moment before redirect.
  if (!user) {
     return (
        <html lang="en">
            <body className="bg-background">
                <div className="flex min-h-screen items-center justify-center">
                    <div className="flex flex-col items-center space-y-2">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        <p className="text-muted-foreground">Redirecting to login...</p>
                    </div>
                </div>
                <Toaster/>
            </body>
        </html>
    );
  }

  if (showTermsModal) {
    return (
      <html lang="en">
        <body className="bg-background">
        <Dialog open={showTermsModal} onOpenChange={(open) => { 
            // Prevent closing via overlay click or escape key if not scrolled and accepted
            if (!open && (!termsScrolledToEnd || !termsAcceptedCheckbox)) {
                setShowTermsModal(true); 
            } else if (!open) {
                setShowTermsModal(false);
            }
        }}>
          <DialogContent className="max-w-2xl" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Terms and Conditions</DialogTitle>
              <DialogDescription>
                Please review and accept our updated terms and conditions to continue.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[400px] border rounded-md p-4" onScroll={handleScrollTerms}>
              <pre className="text-sm whitespace-pre-wrap">{LATEST_TERMS_AND_CONDITIONS}</pre>
            </ScrollArea>
            <div className="flex items-center space-x-2 mt-4">
              <Checkbox 
                id="terms-accept" 
                disabled={!termsScrolledToEnd}
                checked={termsAcceptedCheckbox}
                onCheckedChange={(checked) => setTermsAcceptedCheckbox(!!checked)}
                aria-label="I have read the terms and conditions and agree with them."
              />
              <Label htmlFor="terms-accept" className={!termsScrolledToEnd ? "text-muted-foreground" : ""}>
                I have read the terms and conditions and agree with them.
              </Label>
            </div>
            <Button 
              onClick={handleAcceptTerms} 
              disabled={!termsAcceptedCheckbox || !termsScrolledToEnd} 
              className="mt-4 w-full"
            >
              Agree and Continue
            </Button>
          </DialogContent>
        </Dialog>
        <Toaster />
      </body>
      </html>
    );
  }

  // If user is authenticated, password not expired, T&C accepted (or modal not shown yet), render the app
  // This check is crucial: if userProfile is still null here, it means something is wrong or still loading
  // The isLoading check at the top should handle cases where userProfile is still fetching.
  // If it gets here and userProfile is null but auth/profile loading is done, it means profile truly doesn't exist.
  // New users are directed to /profile from signup. Existing users *should* have a profile.
  if (!userProfile && !isLoading) { // Additional check if profile is crucial before rendering children
    // This state implies user is logged in, but no profile document.
    // This could be a brief state if profile creation is slightly delayed post-signup.
    // Or, it could be an error state for an existing user if their profile doc is missing.
    // For a new user, they are normally redirected from signup to /profile page.
    // If an existing user logs in and has no profile, this is an issue.
    // The T&C modal logic *might* implicitly handle this for new users if `acceptedLatestTerms` is missing.
    // For safety, showing a loading or error state, or redirecting to /profile might be needed.
    // For now, let's assume the T&C flow or a direct redirect to /profile on signup covers new users.
    // If userProfile is required for children, then showing loading is appropriate.
    return (
         <html lang="en">
            <body className="bg-background">
                <div className="flex min-h-screen items-center justify-center">
                    <div className="flex flex-col items-center space-y-2">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        <p className="text-muted-foreground">Finalizing session...</p>
                    </div>
                </div>
                <Toaster/>
            </body>
        </html>
    );
  }


  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <SidebarProvider defaultOpen={true}>
          <AppLayoutClient>
            {children}
          </AppLayoutClient>
          <Toaster />
        </SidebarProvider>
      </body>
    </html>
  );
}
