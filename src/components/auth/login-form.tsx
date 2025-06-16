
'use client';

import React, { useState, useTransition, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { loginUser } from '@/app/actions/auth';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { LoginResult } from '@/types';
import { getCookie, eraseCookie } from '@/lib/cookie-utils'; // Import cookie utils

const loginFormSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(1, {message: "Password is required."}),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export default function LoginForm() {
  const { toast } = useToast();
  const router = useRouter();
  const auth = useAuth();
  const [isServerActionPending, startServerActionTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loginActionCompleted, setLoginActionCompleted] = useState(false);
  // New state to track the auth_sync_complete cookie
  const [isAuthSyncCookiePresent, setIsAuthSyncCookiePresent] = useState(false);

  // Check for sync cookie periodically after login action completes
  useEffect(() => {
    let intervalId: NodeJS.Timeout | undefined;
    if (loginActionCompleted && !auth.user) { // Only poll if login action done but context user not set
      console.log("[LoginForm CookiePollEffect] Starting to poll for auth_sync_complete cookie.");
      // Initial check
      if (getCookie('auth_sync_complete') === 'true') {
        console.log("[LoginForm CookiePollEffect] auth_sync_complete cookie found on initial check.");
        setIsAuthSyncCookiePresent(true);
      } else {
        // Poll every 250ms for a few seconds
        let attempts = 0;
        const maxAttempts = 20; // Poll for up to 5 seconds
        intervalId = setInterval(() => {
          attempts++;
          if (getCookie('auth_sync_complete') === 'true') {
            console.log(`[LoginForm CookiePollEffect] auth_sync_complete cookie found after ${attempts} attempts.`);
            setIsAuthSyncCookiePresent(true);
            clearInterval(intervalId);
          } else if (attempts >= maxAttempts) {
            console.log("[LoginForm CookiePollEffect] auth_sync_complete cookie not found after max attempts.");
            clearInterval(intervalId);
            // Optionally, handle timeout here if needed, e.g. show an error or different message
            // For now, we rely on the main redirection useEffect to see the stale context.
          }
        }, 250);
      }
    }
    return () => {
      if (intervalId) {
        console.log("[LoginForm CookiePollEffect] Clearing poll interval.");
        clearInterval(intervalId);
      }
    };
  }, [loginActionCompleted, auth.user]);


  // Main redirection logic
  useEffect(() => {
    const effectTimestamp = new Date().toISOString();
    console.log(`[LoginForm RedirectionEffect @ ${effectTimestamp}] Triggered. loginActionCompleted: ${loginActionCompleted}, auth.user: ${!!auth.user}, auth.loading: ${auth.loading}, isAuthSyncCookiePresent: ${isAuthSyncCookiePresent}, auth.userProfile: ${!!auth.userProfile}`);
    
    // Condition for redirection: login server action must have been completed AND
    // the auth_sync_complete cookie must be present (signaling AuthProvider has processed the user) AND
    // auth context must reflect the user AND auth context must not be loading.
    if (loginActionCompleted && isAuthSyncCookiePresent && auth.user && !auth.loading) {
      console.log(`[LoginForm RedirectionEffect @ ${effectTimestamp}] Conditions met. Proceeding with redirection logic.`);
      eraseCookie('auth_sync_complete'); // Clean up the sync cookie
      console.log(`[LoginForm RedirectionEffect @ ${effectTimestamp}] auth_sync_complete cookie erased.`);

      const profileSetupComplete = auth.userProfile?.profileSetupComplete;
      console.log(`[LoginForm RedirectionEffect @ ${effectTimestamp}] Profile setup complete from AuthContext: ${profileSetupComplete}`);

      if (profileSetupComplete === true) {
        console.log(`[LoginForm RedirectionEffect @ ${effectTimestamp}] Redirecting (client-side) to dashboard page (/).`);
        router.push('/');
      } else {
        console.log(`[LoginForm RedirectionEffect @ ${effectTimestamp}] Redirecting (client-side) to profile setup page (/profile). Reason: profileSetupComplete is ${profileSetupComplete}`);
        router.push('/profile');
      }
      setLoginActionCompleted(false); // Reset flag
      setIsAuthSyncCookiePresent(false); // Reset cookie state
    } else if (loginActionCompleted && isAuthSyncCookiePresent && !auth.user && !auth.loading) {
        console.warn(`[LoginForm RedirectionEffect @ ${effectTimestamp}] Auth sync cookie present, login action complete, but AuthContext.user is still null and AuthContext is not loading. This could indicate an issue with AuthProvider state propagation despite the cookie, or the cookie was set prematurely.`);
        // setError("Login verification failed on client. Please try again.");
        // toast({ title: "Verification Issue", description: "Could not verify your session. Please try logging in again.", variant: "destructive"});
    } else if (loginActionCompleted && !isAuthSyncCookiePresent && !auth.user && !auth.loading) {
        console.log(`[LoginForm RedirectionEffect @ ${effectTimestamp}] Login action complete, but sync cookie NOT present and user still not in context. Waiting or polling for cookie.`);
    }

  }, [auth.user, auth.userProfile, auth.loading, loginActionCompleted, isAuthSyncCookiePresent, router, toast, auth]);


  const onSubmit = (values: LoginFormValues) => {
    setError(null);
    setLoginActionCompleted(false);
    setIsAuthSyncCookiePresent(false); // Reset on new submission
    console.log('[LOGIN_FORM_SUBMIT_START] Submitting login form with email:', values.email);
    startServerActionTransition(async () => {
      try {
        const result: LoginResult = await loginUser(values);
        console.log('[LOGIN_FORM_SUBMIT_RESULT] Received result from loginUser server action:', result);

        if (result && result.success && result.userId) {
          console.log('[LOGIN_FORM_SERVER_SUCCESS] Login server action successful. Waiting for AuthProvider to update context and set auth_sync_complete cookie.');
          toast({
            title: 'Login Submitted',
            description: 'Verifying session...',
          });
          setLoginActionCompleted(true);
          // IMPORTANT: Do NOT redirect here. Let the useEffect handle it after AuthContext updates AND sync cookie is found.
        } else {
          console.log('[LOGIN_FORM_FAILURE] Login server action reported failure. Result:', result);
          setError(result?.error || 'An unknown error occurred during login.');
          toast({
            title: 'Login Failed',
            description: result?.error || 'Please check your credentials.',
            variant: 'destructive',
          });
          setLoginActionCompleted(false);
        }
      } catch (transitionError: any) {
        console.error('[LOGIN_FORM_ERROR] Error within startServerActionTransition async block:', transitionError);
        setError(transitionError.message || 'An unexpected error occurred.');
        toast({ title: 'Login Error', description: 'An unexpected client-side error occurred.', variant: 'destructive' });
        setLoginActionCompleted(false);
      }
    });
  };
  
  const isLoadingUI = isServerActionPending || (loginActionCompleted && auth.loading) || (loginActionCompleted && !isAuthSyncCookiePresent && !auth.user);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      
      <>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            {...form.register('email')}
            disabled={isLoadingUI}
            autoComplete="email"
          />
          {form.formState.errors.email && (
            <p className="text-sm text-destructive mt-1">{form.formState.errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              {...form.register('password')}
              disabled={isLoadingUI}
              autoComplete="current-password"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isLoadingUI}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {form.formState.errors.password && (
            <p className="text-sm text-destructive mt-1">{form.formState.errors.password.message}</p>
          )}
        </div>
      </>

      <Button type="submit" className="w-full" disabled={isLoadingUI}>
        {isLoadingUI ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isServerActionPending ? 'Logging In...' : 'Verifying Session...'}
          </>
        ) : (
          'Log In'
        )}
      </Button>
    </form>
  );
}
