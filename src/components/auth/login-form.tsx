
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
import type { LoginResult, AppAuthStateCookie } from '@/types';
import { setCookie, getCookie } from '@/lib/cookie-utils';

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
  
  // This state tracks if the current instance of the form initiated the login
  const [loginServerActionInitiated, setLoginServerActionInitiated] = useState(false);


  // Effect to handle redirection once AuthContext is resolved
  useEffect(() => {
    const effectTimestamp = new Date().toISOString();
    console.log(`[LoginForm AuthEffect @ ${effectTimestamp}] Triggered. auth.loading: ${auth.loading}, auth.user: ${!!auth.user}, auth.userProfile: ${!!auth.userProfile}, loginServerActionInitiated: ${loginServerActionInitiated}`);

    // Primary condition: If auth is done loading and we have a user and their profile, then redirect.
    if (!auth.loading && auth.user && auth.userProfile) {
      console.log(`  [LoginForm AuthEffect @ ${effectTimestamp}] Auth context resolved with user ${auth.user.uid}. Profile setup complete: ${auth.userProfile.profileSetupComplete}. Redirecting from /login.`);
      if (auth.userProfile.profileSetupComplete) {
        router.replace('/'); // Redirect to dashboard
      } else {
        router.replace('/profile'); // Redirect to profile setup
      }
      return; // Redirected.
    }

    // This condition handles a very specific (and possibly rare) edge case:
    // If this form initiated a login (loginServerActionInitiated is true),
    // AND AuthProvider is done loading (auth.loading is false),
    // BUT there's NO user in the context (auth.user is null).
    // This implies the login attempt might have failed at a Firebase level or some other issue
    // prevented AuthProvider from recognizing the user.
    if (loginServerActionInitiated && !auth.user && !auth.loading) {
        console.warn(`  [LoginForm AuthEffect @ ${effectTimestamp}] Auth context resolved with NO USER, despite a login attempt being initiated by this form. Resetting loginServerActionInitiated.`);
        // Optionally, display an error to the user here if not already handled by onSubmit's error state.
        // setError("Login verification failed. Please try again.");
        setLoginServerActionInitiated(false); // Reset the flag as this attempt didn't resolve to a user in context.
    }

  }, [auth.user, auth.userProfile, auth.loading, router, loginServerActionInitiated]);


  const onSubmit = (values: LoginFormValues) => {
    setError(null);
    setLoginServerActionInitiated(false); 
    console.log('[LOGIN_FORM_SUBMIT_START] Submitting login form with email:', values.email);
    
    startServerActionTransition(async () => {
      try {
        const result: LoginResult = await loginUser(values);
        console.log('[LOGIN_FORM_SUBMIT_RESULT] Received result from loginUser server action:', result);

        if (result && result.success && result.userId) {
          setLoginServerActionInitiated(true); // Mark that this form instance initiated a login

          if (result.initialCookieState) {
            const clientSideInitialCookie: AppAuthStateCookie = {
              isProfileCreated: result.initialCookieState.isProfileCreated,
              authSyncComplete: false, 
            };
            console.log('[LOGIN_FORM_SUBMIT] Setting app_auth_state cookie with initial state from server:', clientSideInitialCookie);
            setCookie('app_auth_state', JSON.stringify(clientSideInitialCookie), 1);
          } else {
            console.warn('[LOGIN_FORM_SUBMIT] Login successful but no initialCookieState received from server.');
          }
          
          // DO NOT redirect from here. The useEffect above handles redirection when AuthContext is ready.
          // The UI will show "Verifying Session..." due to isLoadingUI.
          console.log('[LOGIN_FORM_SUBMIT] Login successful. Cookie set. Waiting for AuthProvider to update context, then LoginForm AuthEffect to redirect.');

        } else {
          console.log('[LOGIN_FORM_FAILURE] Login server action reported failure. Result:', result);
          setError(result?.error || 'An unknown error occurred during login.');
          toast({ title: 'Login Failed', description: result?.error || 'Please check your credentials.', variant: 'destructive' });
          setLoginServerActionInitiated(false);
        }
      } catch (transitionError: any) {
        console.error('[LOGIN_FORM_ERROR] Error within startServerActionTransition async block:', transitionError);
        setError(transitionError.message || 'An unexpected error occurred.');
        toast({ title: 'Login Error', description: 'An unexpected client-side error occurred.', variant: 'destructive' });
        setLoginServerActionInitiated(false);
      }
    });
  };
  
  // isLoadingUI should be true if server action is pending,
  // OR if this form initiated a login and AuthProvider hasn't fully resolved the user context yet.
  const isLoadingUI = isServerActionPending || (loginServerActionInitiated && (!auth.user || auth.loading));


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
