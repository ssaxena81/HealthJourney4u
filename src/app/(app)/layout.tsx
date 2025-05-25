
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import AppLayoutClient from '@/components/layout/app-layout-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { UserProfile } from '@/types';
import { updateUserTermsAcceptance } from '@/app/actions/auth';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Define the latest version of T&C here or import from a config file
const LATEST_TERMS_AND_CONDITIONS = `
Last Updated: [Date - Replace with Current Date]

Welcome to Health Timeline!

1. Acceptance of Terms
   By accessing or using Health Timeline ("the App"), you agree to be bound by these Terms and Conditions ("T&C"). If you disagree with any part of the terms, then you may not access the App.

2. User Accounts
   When you create an account with us, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the T&C, which may result in immediate termination of your account on our App.
   You are responsible for safeguarding the password that you use to access the App and for any activities or actions under your password.
   You agree not to disclose your password to any third party. You must notify us immediately upon becoming aware of any breach of security or unauthorized use of your account.

3. Age Requirement
   You must be at least 18 years old to use this App. By using this App, you represent and warrant that you are 18 years of age or older.

4. Subscription Tiers & Payments
   The App may offer different subscription tiers ("Free", "Silver", "Gold", "Platinum"). Features available may vary by tier.
   For paid tiers, you agree to pay all applicable fees as described on the App for the services you select. All fees are in [Currency, e.g., USD] and are non-refundable except as required by law or as explicitly stated.
   We reserve the right to change subscription fees at any time.

5. Data Privacy
   Your privacy is important to us. Our Privacy Policy, which is incorporated into these T&C by reference, explains how we collect, use, and share your personal information. By using the App, you agree to the collection and use of information in accordance with our Privacy Policy.

6. User Conduct
   You agree not to use the App for any unlawful purpose or in any way that interrupts, damages, or impairs the service.
   You agree not to attempt to gain unauthorized access to the App or any networks, servers or computer systems connected to the App.

7. Intellectual Property
   The App and its original content (excluding content provided by users), features, and functionality are and will remain the exclusive property of [Your Company Name] and its licensors.

8. Connections to Third-Party Services
   The App allows you to connect to third-party services (e.g., fitness trackers, diagnostic labs, insurance providers). You acknowledge that [Your Company Name] is not responsible for the data, content, or practices of these third-party services. Your interaction with any third-party service is subject to that service's own terms and policies.

9. Disclaimer of Warranties
   The App is provided on an "AS IS" and "AS AVAILABLE" basis. [Your Company Name] makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.

10. Limitation of Liability
    In no event shall [Your Company Name], nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from (i) your access to or use of or inability to access or use the App; (ii) any conduct or content of any third party on the App; (iii) any content obtained from the App; and (iv) unauthorized access, use or alteration of your transmissions or content, whether based on warranty, contract, tort (including negligence) or any other legal theory, whether or not we have been informed of the possibility of such damage, and even if a remedy set forth herein is found to have failed of its essential purpose.

11. Changes to Terms and Conditions
    We reserve the right, at our sole discretion, to modify or replace these T&C at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
    By continuing to access or use our App after any revisions become effective, you agree to be bound by the revised terms. If you do not agree to the new terms, you are no longer authorized to use the App.

12. Governing Law
    These T&C shall be governed and construed in accordance with the laws of [Your Jurisdiction, e.g., State of California, USA], without regard to its conflict of law provisions.

13. Contact Us
    If you have any questions about these Terms, please contact us at [Your Support Email Address].
`;
const LATEST_TERMS_VERSION = "1.0"; // Example version

export default function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, loading: authLoading, userProfile, setUserProfile, loading: profileLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsScrolledToEnd, setTermsScrolledToEnd] = useState(false);
  const [termsAcceptedCheckbox, setTermsAcceptedCheckbox] = useState(false);
  const [isSavingTerms, setIsSavingTerms] = useState(false);

  const isLoading = authLoading || profileLoading;

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (user && !userProfile && !profileLoading) {
        // User exists, but profile isn't loaded or doesn't exist yet
        // This could be a new user who hasn't completed profile setup
        // Or, profile fetch failed during login.
        router.replace('/profile'); // Force to profile if userProfile is missing after loading
      } else if (user && userProfile) {
        // Check for password expiry first
        if (userProfile.lastPasswordChangeDate) {
          const lastChange = new Date(userProfile.lastPasswordChangeDate);
          const daysSinceChange = (new Date().getTime() - lastChange.getTime()) / (1000 * 3600 * 24);
          if (daysSinceChange >= 90) {
            router.replace('/reset-password-required');
            return; // Stop further checks if redirecting for password reset
          }
        } else {
          // If lastPasswordChangeDate is missing, treat as needing reset (security precaution)
          console.warn("User profile missing lastPasswordChangeDate, redirecting to password reset.");
          router.replace('/reset-password-required');
          return;
        }

        // Then check T&C acceptance if password is not expired
        if (!userProfile.acceptedLatestTerms || userProfile.termsVersionAccepted !== LATEST_TERMS_VERSION) {
          setShowTermsModal(true);
        }
      }
    }
  }, [user, userProfile, isLoading, authLoading, profileLoading, router]);

  const handleScrollTerms = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    // Add a small buffer to ensure it's truly at the end
    if (scrollHeight - scrollTop <= clientHeight + 10) {
      setTermsScrolledToEnd(true);
    }
  };

  const handleAcceptTerms = async () => {
    if (!user || !termsAcceptedCheckbox || !termsScrolledToEnd) return;
    setIsSavingTerms(true);
    try {
      const result = await updateUserTermsAcceptance(user.uid, true, LATEST_TERMS_VERSION);
      if (result.success) {
        if (setUserProfile) {
          setUserProfile(prev => prev ? ({ ...prev, acceptedLatestTerms: true, termsVersionAccepted: LATEST_TERMS_VERSION }) : null);
        }
        setShowTermsModal(false);
        toast({ title: "Terms Accepted", description: "Thank you for accepting the terms." });
      } else {
        console.error("Failed to update terms acceptance:", result.error);
        toast({ title: "Error", description: result.error || "Could not save terms acceptance. Please try again.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Exception updating terms acceptance:", error);
      toast({ title: "Error", description: "An unexpected error occurred. Please try again.", variant: "destructive" });
    }
    setIsSavingTerms(false);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // This case should ideally be caught by the useEffect redirect,
    // but as a fallback, show loading or a redirect message.
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Redirecting to login...</p>
      </div>
    );
  }
  
  // If user is logged in but profile is still null after loading, redirect to /profile.
  // This handles cases where profile creation might have failed or is pending.
  if (user && !userProfile && !profileLoading) {
    // The useEffect should handle this, but this is an extra safeguard.
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4">Loading profile or redirecting...</p>
      </div>
    );
  }


  if (showTermsModal) {
    return (
      <Dialog open={showTermsModal} onOpenChange={(open) => {
        // Prevent closing via overlay click or escape key if terms not accepted
        if (!open && (!termsAcceptedCheckbox || !userProfile?.acceptedLatestTerms)) {
          return;
        }
        setShowTermsModal(open);
      }}>
        <DialogContent className="sm:max-w-[600px] flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Terms and Conditions Update</DialogTitle>
            <DialogDescription>
              Please review and accept our updated Terms and Conditions to continue.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-grow border rounded-md p-4 text-sm whitespace-pre-wrap" onScroll={handleScrollTerms}>
            <pre className="font-sans">{LATEST_TERMS_AND_CONDITIONS}</pre>
          </ScrollArea>
          <div className="items-top flex space-x-2 pt-4">
            <Checkbox
              id="terms-acceptance"
              checked={termsAcceptedCheckbox}
              onCheckedChange={(checked) => setTermsAcceptedCheckbox(!!checked)}
              disabled={!termsScrolledToEnd || isSavingTerms}
            />
            <Label htmlFor="terms-acceptance" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              I have read the terms and conditions and agree with them.
            </Label>
          </div>
          <Button
            onClick={handleAcceptTerms}
            disabled={!termsAcceptedCheckbox || !termsScrolledToEnd || isSavingTerms}
            className="mt-4 w-full"
          >
            {isSavingTerms ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Agree and Continue"}
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
      <AppLayoutClient>
        {children}
      </AppLayoutClient>
  );
}
    