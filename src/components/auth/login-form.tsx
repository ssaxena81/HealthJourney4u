
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
import { setCookie } from '@/lib/cookie-utils';
import { auth as firebaseAuthClientInstance } from '@/lib/firebase/clientApp'; // Import client auth instance

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
  
  const [loginServerActionInitiated, setLoginServerActionInitiated] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    const effectTimestamp = new Date().toISOString();
    console.log(`[LoginForm AuthEffect @ ${effectTimestamp}] Triggered. auth.loading: ${!!auth.loading}, auth.user UID: ${auth.user?.uid || 'null'}, auth.userProfile ID: ${auth.userProfile?.id || 'null'}, loginServerActionInitiated: ${loginServerActionInitiated}`);

    // Scenario 1: User is already logged in when they visit /login, or login process just completed successfully.
    if (!auth.loading && auth.user && auth.userProfile) {
      console.log(`  [LoginForm AuthEffect @ ${effectTimestamp}] Auth context has user. Profile setup complete: ${auth.userProfile.profileSetupComplete}. Redirecting from /login.`);
      if (loginServerActionInitiated) {
        setLoginServerActionInitiated(false); // Reset flag as we are now handling the post-login state.
      }
      if (auth.userProfile.profileSetupComplete) {
        router.replace('/'); 
      } else {
        router.replace('/profile'); 
      }
      return; 
    }

    // Scenario 2: This form initiated a login, AuthProvider has finished loading, but NO user/profile in context.
    // This indicates a genuine problem with the authentication state update after the server action reported success.
    if (loginServerActionInitiated && !auth.loading && !auth.user) {
      console.warn(`  [LoginForm AuthEffect @ ${effectTimestamp}] Auth context resolved with NO USER (auth.loading is false), despite a login attempt being initiated by this form. This indicates a sync issue or login failure at Firebase level. Resetting loginServerActionInitiated.`);
      setError("Login verification failed or session timed out. Please try again."); 
      toast({ title: "Login Error", description: "Login verification failed or session timed out. Please try again.", variant: "destructive" });
      setLoginServerActionInitiated(false); // Allow user to try again
      return;
    }
    
    // Scenario 3: Login initiated, AuthProvider still loading. Wait.
    if (loginServerActionInitiated && auth.loading) {
        console.log(`  [LoginForm AuthEffect @ ${effectTimestamp}] Login initiated by this form, AuthProvider is currently loading (auth.loading is true). Waiting...`);
        return;
    }

    // Scenario 4: Initial state or navigated to login page: Not loading, no user, and no active login attempt by this form.
    if (!loginServerActionInitiated && !auth.loading && !auth.user) {
        console.log(`  [LoginForm AuthEffect @ ${effectTimestamp}] Initial state or navigated to login page: Not loading, no user, and no active login attempt by this form.`);
        return;
    }
    
  }, [auth.user, auth.userProfile, auth.loading, router, loginServerActionInitiated, toast, setError]);


  const onSubmit = (values: LoginFormValues) => {
    setError(null);
    setLoginServerActionInitiated(false); 
    console.log('[LOGIN_FORM_SUBMIT_START] Submitting login form with email:', values.email);
    
    startServerActionTransition(async () => {
      try {
        const result: LoginResult = await loginUser(values);
        console.log('[LOGIN_FORM_SUBMIT_RESULT] Received result from loginUser server action:', result);

        if (result && result.success && result.userId) {
          console.log('[LOGIN_FORM_SUBMIT] user id received in result is: ',result.userId);
          setLoginServerActionInitiated(true); 

          if (result.initialCookieState) {
            const clientSideInitialCookie: AppAuthStateCookie = {
              isProfileCreated: result.initialCookieState.isProfileCreated,
              authSyncComplete: false, 
            };
            console.log('[LOGIN_FORM_SUBMIT] Setting app_auth_state cookie with initial state from server:', clientSideInitialCookie);
            setCookie('app_auth_state', JSON.stringify(clientSideInitialCookie), 1);
          } else {
            console.warn('[LOGIN_FORM_SUBMIT] Login successful but no initialCookieState received from server.');
            setCookie('app_auth_state', JSON.stringify({ isProfileCreated: false, authSyncComplete: false }), 1);
          }
          
          console.log('[LOGIN_FORM_SUBMIT] Login successful. Cookie set. Explicitly calling auth.checkAuthState().');
          // Give Firebase client a millisecond to potentially sync
          // await new Promise(resolve => setTimeout(resolve, 50)); 
          if (auth.checkAuthState) {
             await auth.checkAuthState(); // This will make AuthProvider re-evaluate using its firebaseAuthInstance.currentUser
          } else {
             console.error("[LOGIN_FORM_SUBMIT] auth.checkAuthState is not available. Cannot force context update.");
             // Fallback or error handling if checkAuthState is unexpectedly undefined
             setError("Failed to verify session. Please refresh the page.");
             toast({ title: "Session Error", description: "Could not verify your session. Please refresh.", variant: "destructive"});
             setLoginServerActionInitiated(false);
             return;
          }
          console.log('[LOGIN_FORM_SUBMIT] auth.checkAuthState() completed. LoginForm AuthEffect should now handle redirection based on updated context.');
          // The AuthEffect, driven by AuthContext changes, will handle redirection.

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
  
  // isLoadingUI should reflect that the form is waiting for the server action OR
  // after the server action, it's waiting for the AuthProvider to update the context.
  const isLoadingUI = isServerActionPending || (loginServerActionInitiated && (!auth.user || auth.loading));
  console.log('[LoginForm] isLoadingUI:',isLoadingUI, 'isServerActionPending:', isServerActionPending, 'loginServerActionInitiated:', loginServerActionInitiated, 'auth.user:', !!auth.user, 'auth.loading:', auth.loading);


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
