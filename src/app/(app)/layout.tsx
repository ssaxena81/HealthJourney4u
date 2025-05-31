
'use client';

import React, { useEffect, useState, useTransition } from 'react';
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
import { syncAllConnectedData } from '@/app/actions/syncActions'; 
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { isAfter, subHours } from 'date-fns';

// TODO: This LATEST_TERMS_AND_CONDITIONS and LATEST_TERMS_VERSION should eventually be fetched
// from Firestore using a server action like `getTermsAndConditionsConfig()` from `src/app/actions/adminConfigActions.ts`.
// For now, it's hardcoded here to keep the T&C modal functional.
const LATEST_TERMS_AND_CONDITIONS = `
Last Updated: [Current Date]

1. Acceptance of Terms
By using this application (“App”), you (“User” or “Member”) agree to be bound by these Terms and Conditions, our Privacy Policy, and any additional terms and conditions that may apply to specific sections of the App or to products and services available through the App.

2. Modification of Terms
We reserve the right to change, modify, or update these Terms and Conditions at any time. You will be required to accept the revised terms before continuing to use the App.

3. Geographic Scope
These Terms apply to users located in the continental United States. Certain provisions may vary based on state law and shall be interpreted accordingly.

4. Collection of Personal Identifiable Information
With your consent, we may collect your personal identifiable information, including but not limited to your name, email, contact information, device identifiers, and usage data.

5. Use of Cookies
The App uses cookies and similar technologies to provide a seamless user experience, personalize content, and perform analytics. You may manage your cookie preferences within the App settings.

6. Data Storage and Retention
Personal data collected through the App is stored securely. Data will be retained as long as the App is installed or in use. Upon uninstallation, your personal data will be deleted, subject to legal obligations.

7. Non-Discrimination
We do not discriminate against users on the basis of race, color, religion, gender, sexual orientation, or any other protected class.

8. Changes to Terms
We may update these Terms at our discretion. You must accept any changes to continue using the App.

9. Privacy Policy
Our Privacy Policy describes in detail the data we collect, how we use it, and your rights. The policy is available within the App and on our website.

10. Use of Personal Identifiable Information
        a) Delivering products and services.
        b) Personalizing your digital experience.
        c) Performing analytics.
        d) Complying with legal requirements.
        e) Enabling features within our App.

11. Terms of Use
        a) By using the App, you agree to be bound by these Terms.
        b) We may update these Terms at any time.
        c) These Terms apply throughout the continental United States.   
        d) All trademarks used in the App are the property of their respective owners.
        e) The App may access or display third-party content.
        f) We do not guarantee timeliness or accuracy of content.
        g) Users are responsible for password security.
        h) We are not liable for unauthorized access resulting from user negligence.
        i) We employ encryption and other security measures to protect communications.
        j) Our liability is limited to the maximum extent permitted by law.
        k) You agree to indemnify and hold harmless [Your Company Name] against claims arising from your use.
        l) We are not responsible for content or data sourced from third-party services.

12. Arbitration and Dispute Resolution
All disputes shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association. You waive the right to participate in class-action lawsuits.

13. Payment and Billing
If you upgrade the App, you authorize us to collect and store your payment details securely. You agree not to hold us liable for any payment-related issues caused by third-party processors.

14. Consent for Data Sharing with Affiliated Entities
By using the App, you consent to allow us to access your personal data from affiliated partners or third-party sources, where authorization is provided or APIs are integrated.

15. Aggregated Data Sources
Our App connects with external services such as Fitbit, Strava, Samsung Health, Quest Diagnostics, LabCorp, UnitedHealthcare, Aetna, Cigna, and others via secure APIs. You authorize us to access your data from these sources as part of the functionality.

16. Third-Party Integrations Policy
We access limited user data from connected third-party platforms to deliver app functionality, perform analytics, and provide personalized experiences. Data retrieved includes fitness metrics, diagnostic lab results, and insurance information, as permitted by you.

17. HIPAA Notice of Privacy Practices
This Notice describes how [Your Company Name] may use and disclose your protected health information (PHI). We operate as a Business Associate when connecting to Covered Entities and follow HIPAA standards. PHI is used solely for delivering services you've authorized.

18. Clickwrap Consent for Insurance and Medical Data Integration
Before connecting your insurance or medical accounts (e.g., UnitedHealthcare, LabCorp), you must accept a clickwrap agreement outlining the data access and usage, in accordance with HIPAA.

19. Limitations on Medical Data Storage
We do not store raw lab results, clinical notes, or full medical records unless explicitly authorized by you. If authorized, data is encrypted and only retained as needed for your selected services.
`;
const LATEST_TERMS_VERSION = "1.0"; // This should also be fetched dynamically with the terms text.

export default function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, loading: authLoading, userProfile, setUserProfile, loading: profileLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isSyncing, startSyncTransition] = useTransition();
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsScrolledToEnd, setTermsScrolledToEnd] = useState(false);
  const [termsAcceptedCheckbox, setTermsAcceptedCheckbox] = useState(false);
  const [isSavingTerms, setIsSavingTerms] = useState(false);

  const isLoading = authLoading || profileLoading;

  // --- AUTOMATIC DATA SYNC LOGIC ---
  useEffect(() => {
    const checkAndTriggerAutoSync = async () => {
      if (user && userProfile && userProfile.connectedFitnessApps && userProfile.connectedFitnessApps.length > 0) {
        let shouldSync = true; 
        const twentyFourHoursAgo = subHours(new Date(), 24);
        
        // More robust check: Consider last successful sync timestamps if available
        let mostRecentOverallSync: Date | null = null;
        if (userProfile.fitbitLastSuccessfulSync) {
            const lastFitbitSyncDate = parseISO(userProfile.fitbitLastSuccessfulSync);
             if (!mostRecentOverallSync || isAfter(lastFitbitSyncDate, mostRecentOverallSync)) {
                mostRecentOverallSync = lastFitbitSyncDate;
            }
        }
        if (userProfile.stravaLastSyncTimestamp) {
            const lastStravaSyncDate = new Date(userProfile.stravaLastSyncTimestamp * 1000);
            if (!mostRecentOverallSync || isAfter(lastStravaSyncDate, mostRecentOverallSync)) {
                mostRecentOverallSync = lastStravaSyncDate;
            }
        }
        if (userProfile.googleFitLastSuccessfulSync) {
            const lastGoogleFitSyncDate = parseISO(userProfile.googleFitLastSuccessfulSync);
             if (!mostRecentOverallSync || isAfter(lastGoogleFitSyncDate, mostRecentOverallSync)) {
                mostRecentOverallSync = lastGoogleFitSyncDate;
            }
        }

        if (mostRecentOverallSync && isAfter(mostRecentOverallSync, twentyFourHoursAgo)) {
            shouldSync = false;
            console.log('[AutoSync] Data for at least one connected service synced recently via specific sync timestamps, skipping general auto-sync.');
        } else if (!mostRecentOverallSync) { // Fallback to API call stats if specific sync timestamps are missing
            let mostRecentApiCall: Date | null = null;
            if (userProfile.fitbitApiCallStats?.dailyActivitySummary?.lastCalledAt) {
                const lastFitbitApi = new Date(userProfile.fitbitApiCallStats.dailyActivitySummary.lastCalledAt);
                 if (!mostRecentApiCall || isAfter(lastFitbitApi, mostRecentApiCall)) mostRecentApiCall = lastFitbitApi;
            }
            if (userProfile.stravaApiCallStats?.activities?.lastCalledAt) {
                 const lastStravaApi = new Date(userProfile.stravaApiCallStats.activities.lastCalledAt);
                 if (!mostRecentApiCall || isAfter(lastStravaApi, mostRecentApiCall)) mostRecentApiCall = lastStravaApi;
            }
            if (userProfile.googleFitApiCallStats?.sessions?.lastCalledAt) {
                const lastGoogleFitApi = new Date(userProfile.googleFitApiCallStats.sessions.lastCalledAt);
                if (!mostRecentApiCall || isAfter(lastGoogleFitApi, mostRecentApiCall)) mostRecentApiCall = lastGoogleFitApi;
            }
            if (mostRecentApiCall && isAfter(mostRecentApiCall, twentyFourHoursAgo)) {
                 shouldSync = false;
                 console.log('[AutoSync] Data for at least one connected service API called recently, skipping general auto-sync.');
            }
        }


        if (shouldSync) {
          console.log('[AutoSync] Triggering automatic data sync.');
          toast({
            title: "Auto-Syncing Data",
            description: "Refreshing data from your connected apps in the background...",
            duration: 5000,
          });
          await handleSyncAllData(true); 
        } else {
          console.log('[AutoSync] Auto-sync not needed, data is recent.');
        }
      }
    };

    if (!isLoading && userProfile) {
      checkAndTriggerAutoSync();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile, isLoading, user]); 


  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (user && !userProfile && !profileLoading) {
        // If user exists but profile is still loading or missing, redirect to /profile to complete setup
        // This helps ensure profile data (like T&C acceptance) is available before rendering main content
        router.replace('/profile'); 
      } else if (user && userProfile) {
        // Check password expiry
        if (userProfile.lastPasswordChangeDate) {
          const lastChange = new Date(userProfile.lastPasswordChangeDate);
          const daysSinceChange = (new Date().getTime() - lastChange.getTime()) / (1000 * 3600 * 24);
          if (daysSinceChange >= 90) {
            router.replace('/reset-password-required');
            return; // Important to return to prevent T&C check if password reset is required
          }
        } else {
          // If lastPasswordChangeDate is missing for some reason, treat as expired for security
          console.warn("User profile missing lastPasswordChangeDate, redirecting to password reset.");
          router.replace('/reset-password-required');
          return;
        }

        // Check T&C acceptance
        if (!userProfile.acceptedLatestTerms || userProfile.termsVersionAccepted !== LATEST_TERMS_VERSION) {
          setShowTermsModal(true);
        }
      }
    }
  }, [user, userProfile, isLoading, authLoading, profileLoading, router]);

  const handleScrollTerms = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    // Adding a small buffer (e.g., 5-10px) can help with fractional pixel values
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
        setTermsScrolledToEnd(false); // Reset for potential future display
        setTermsAcceptedCheckbox(false); // Reset checkbox
        toast({ title: "Terms Accepted", description: "Thank you for accepting the terms." });
      } else {
        console.error("Failed to update terms acceptance:", result.error, result.errorCode);
        toast({ title: "Error", description: result.error || "Could not save terms acceptance. Please try again.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Exception updating terms acceptance:", error);
      toast({ title: "Error", description: "An unexpected error occurred. Please try again.", variant: "destructive" });
    }
    setIsSavingTerms(false);
  };

  const handleSyncAllData = async (isAutoSync: boolean = false) => {
    if (isSyncing) return;
    startSyncTransition(async () => {
      if (!isAutoSync) {
        toast({
          title: "Syncing Data...",
          description: "Attempting to fetch latest data from all connected apps.",
          duration: 8000, 
        });
      }
      
      const result = await syncAllConnectedData();
      let authErrorServiceName: string | null = null;

      if (result.success) {
        let allIndividualSyncsSucceeded = true;
        let messages: string[] = [];
        result.results.forEach(res => {
          if (res.success) {
            if (res.activitiesProcessed && res.activitiesProcessed > 0) {
                messages.push(`${res.service}: Synced ${res.activitiesProcessed} item(s).`);
            } else if (res.message && res.message.includes("No new") ) { // Specific check for "No new activities"
                 messages.push(`${res.service}: No new data found.`);
            } else {
                messages.push(`${res.service}: Synced successfully.`);
            }
          } else {
            allIndividualSyncsSucceeded = false;
            messages.push(`${res.service}: ${res.message || 'Failed'}`);
            if (res.errorCode?.includes('AUTH_ERROR') || res.errorCode?.includes('AUTH_EXPIRED')) {
                authErrorServiceName = res.service.split(' ')[0]; // e.g., "Fitbit" from "Fitbit Daily Activity"
            }
          }
        });

        if (allIndividualSyncsSucceeded && result.results.length > 0) {
          if (!isAutoSync) {
            toast({ title: "Sync Complete", description: "All connected apps synced successfully." });
          } else {
             console.log("[AutoSync] Automatic sync completed successfully.");
          }
        } else if (result.results.length > 0) {
          toast({
            title: authErrorServiceName ? `${authErrorServiceName} Re-authentication Needed` : "Sync Partially Complete",
            description: (
              <div>
                {authErrorServiceName ? (
                  <p>Your connection with {authErrorServiceName} has expired. Please go to your Profile to reconnect.</p>
                ) : (
                  <p>Some services could not be synced or had issues:</p>
                )}
                {!authErrorServiceName && messages.filter(m => !m.includes('successfully') && !m.includes('No new data found')).length > 0 && (
                  <ul className="list-disc list-inside text-xs mt-1">
                    {messages.filter(m => !m.includes('successfully') && !m.includes('No new data found')).map((msg, i) => <li key={i}>{msg}</li>)}
                  </ul>
                )}
              </div>
            ),
            duration: authErrorServiceName ? 15000 : 10000,
            variant: authErrorServiceName ? "destructive" : "default", 
            action: authErrorServiceName ? (
                <Button variant="outline" size="sm" onClick={() => router.push('/profile')}>
                    Go to Profile
                </Button>
            ) : undefined,
          });
        } else if (!isAutoSync && result.results.length === 0) {
          toast({ title: "No Services Synced", description: "No connected services were available to sync at this time." });
        }
      } else { // General failure of syncAllConnectedData itself
        toast({
          title: "Sync Orchestration Failed",
          description: result.error || "Could not sync data from apps due to a system error.",
          variant: "destructive",
        });
      }
    });
  };


  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  // If user is not logged in but somehow this layout is reached, redirect (should be caught by useEffect too)
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Redirecting to login...</p>
      </div>
    );
  }
  
  // If user is logged in but profile isn't loaded yet or is missing (and we are not in profileLoading state anymore)
  // This case should ideally be handled by the redirect to /profile in the useEffect
  if (user && !userProfile && !profileLoading) {
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
        // Prevent closing the dialog by clicking outside or pressing Esc if terms are not accepted
        if (!open && (!termsAcceptedCheckbox || !userProfile?.acceptedLatestTerms)) {
          return; // Do not allow close if terms not accepted
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
            {/* Using <pre> preserves whitespace and line breaks from the template literal */}
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

  // Only render AppLayoutClient if user, profile exist, and T&C are accepted (or modal is not shown)
  return (
      <AppLayoutClient onSyncAllClick={handleSyncAllData}>
        {children}
      </AppLayoutClient>
  );
}
    
