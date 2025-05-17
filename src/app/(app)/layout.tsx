
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth'; // We'll create this hook
import AppLayoutClient from '@/components/layout/app-layout-client'; // Renamed AppLayout to avoid conflict
import { Toaster } from "@/components/ui/toaster";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { UserProfile } from '@/types';
import { updateUserTermsAcceptance } from '@/app/actions/auth'; // Assuming this action exists

// Mock T&C content
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
  const { user, loading, userProfile, setUserProfile } = useAuth(); // Assume userProfile is part of useAuth now
  const router = useRouter();
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsScrolledToEnd, setTermsScrolledToEnd] = useState(false);
  const [termsAcceptedCheckbox, setTermsAcceptedCheckbox] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
      } else if (userProfile) {
        // Check for password expiry
        const lastPasswordChange = new Date(userProfile.lastPasswordChangeDate);
        const now = new Date();
        const daysSinceLastChange = (now.getTime() - lastPasswordChange.getTime()) / (1000 * 3600 * 24);
        
        if (daysSinceLastChange >= 90) {
          router.replace('/reset-password-required'); // A dedicated page for this
          return; // Stop further checks
        }

        // Check for T&C acceptance
        if (!userProfile.acceptedLatestTerms) {
          setShowTermsModal(true);
          setIsCheckingAuth(false); // Stop checking auth, show modal
          return;
        }
        setIsCheckingAuth(false); // All checks passed
      } else {
        // User is authenticated but profile might still be loading or missing
        // useAuth should handle fetching profile
        setIsCheckingAuth(false); // Or keep it true until profile loads
      }
    }
  }, [user, loading, userProfile, router]);

  const handleScrollTerms = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    if (scrollHeight - scrollTop === clientHeight) {
      setTermsScrolledToEnd(true);
    }
  };

  const handleAcceptTerms = async () => {
    if (user && termsAcceptedCheckbox) {
      const result = await updateUserTermsAcceptance(user.uid, true, '2.0'); // Assume '2.0' is current version
      if (result.success && setUserProfile) {
         setUserProfile(prev => prev ? ({...prev, acceptedLatestTerms: true, termsVersionAccepted: '2.0'}) : null);
      }
      setShowTermsModal(false);
      // Potentially redirect to dashboard or let the useEffect re-evaluate
      router.push('/'); // Or wherever the main dashboard is
    }
  };

  if (loading || isCheckingAuth) {
    return (
      <html lang="en">
        <body>
          <div className="flex min-h-screen items-center justify-center">
            <p>Loading application...</p> {/* Or a proper spinner */}
          </div>
          <Toaster />
        </body>
      </html>
    );
  }
  
  if (showTermsModal) {
    return (
      <html lang="en">
        <body>
        <Dialog open={showTermsModal} onOpenChange={(open) => { if (!open) setShowTermsModal(false); }}>
          <DialogContent className="max-w-2xl">
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


  if (!user) {
     // This case should be handled by the redirect in useEffect, but as a fallback:
    return (
        <html lang="en">
            <body>
                <div className="flex min-h-screen items-center justify-center"><p>Redirecting to login...</p></div>
                <Toaster/>
            </body>
        </html>
    );
  }

  // User is authenticated, password not expired, T&C accepted
  return (
    <html lang="en">
      <body>
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
