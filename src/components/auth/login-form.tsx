
'use client';

import React, { useState, useTransition, useEffect, useMemo } from 'react';
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
// Removed: import { getAuth } from 'firebase/auth';
// Removed: import { firebaseApp } from '@/lib/firebase/clientApp';

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
    console.log(`[LoginForm AuthEffect @ ${effectTimestamp}] Triggered. auth.loading: ${auth.loading}, auth.user UID: ${auth.user?.uid || 'null'}, loginServerActionInitiated: ${loginServerActionInitiated}`);

    // Scenario 1: User is ALREADY authenticated & context loaded (e.g., direct navigation to /login or refresh)
    // This form did NOT just initiate the login.
    if (!loginServerActionInitiated && !auth.loading && auth.user && auth.userProfile) {
      console.log(`  [LoginForm AuthEffect @ ${effectTimestamp}] User ALREADY authenticated & context loaded. Redirecting from /login.`);
      if (auth.userProfile.profileSetupComplete) {
        router.replace('/'); 
      } else {
        router.replace('/profile'); 
      }
      return;
    }

    // Scenario 2: This form INITIATED a login, and AuthProvider has finished processing
    if (loginServerActionInitiated) {
      if (!auth.loading) { // AuthProvider has finished its work
        if (auth.user && auth.userProfile) {
          console.log(`  [LoginForm AuthEffect @ ${effectTimestamp}] Login initiated by THIS form, AuthProvider COMPLETED (auth.loading is false). User & Profile PRESENT. Redirecting.`);
          if (auth.userProfile.profileSetupComplete) {
            router.replace('/');
          } else {
            router.replace('/profile');
          }
        } else {
          // AuthProvider finished, but no user/profile. This is an actual login failure post-server action.
          console.warn(`  [LoginForm AuthEffect @ ${effectTimestamp}] Auth context resolved with NO USER (auth.loading is false), despite a login attempt being initiated by this form. This indicates a sync issue or login failure at Firebase level.`);
          setError("Login verification failed. Please check your credentials or try again."); 
          toast({ title: "Login Error", description: "Login verification failed. Please try again.", variant: "destructive" });
        }
        setLoginServerActionInitiated(false); // Reset flag, as this login attempt has been processed
      } else {
        // loginServerActionInitiated is true, but auth.loading is also true. AuthProvider is still working.
        console.log(`  [LoginForm AuthEffect @ ${effectTimestamp}] Login initiated by THIS form, AuthProvider is still loading (auth.loading is true). Waiting...`);
      }
      return;
    }
    
    // Scenario 3: Initial state or navigated to login page: Not loading, no user, and no active login attempt by this form.
    if (!loginServerActionInitiated && !auth.loading && !auth.user) {
        console.log(`  [LoginForm AuthEffect @ ${effectTimestamp}] Initial state or navigated to login page: Not loading, no user, and no active login attempt by this form.`);
        return;
    }
    
  }, [auth.user, auth.userProfile, auth.loading, router, loginServerActionInitiated, toast, setError]); // Added setError to dependencies


  const onSubmit = (values: LoginFormValues) => {
    setError(null);
    const submitTime = new Date().toISOString();
    console.log(`[LOGIN_FORM_SUBMIT_START @ ${submitTime}] Submitting login form with email:`, values.email);
    
    startServerActionTransition(async () => {
      setLoginServerActionInitiated(true); 
      try {
        const result: LoginResult = await loginUser(values);
        console.log(`[LOGIN_FORM_SUBMIT_RESULT @ ${new Date().toISOString()}] Received result from loginUser server action:`, result);

        if (result && result.success && result.userId) {
          console.log(`[LOGIN_FORM_SUBMIT @ ${new Date().toISOString()}] user id received in result is: `,result.userId);
          
          if (result.initialCookieState) {
            const clientSideInitialCookie: AppAuthStateCookie = {
              isProfileCreated: result.initialCookieState.isProfileCreated,
              authSyncComplete: false, 
            };
            console.log(`[LOGIN_FORM_SUBMIT @ ${new Date().toISOString()}] Setting app_auth_state cookie with initial state from server:`, clientSideInitialCookie);
            setCookie('app_auth_state', JSON.stringify(clientSideInitialCookie), 1);
          } else {
            console.warn(`[LOGIN_FORM_SUBMIT @ ${new Date().toISOString()}] Login successful but no initialCookieState received from server.`);
            setCookie('app_auth_state', JSON.stringify({ isProfileCreated: false, authSyncComplete: false }), 1);
          }
          
          // Removed explicit client-side Firebase interaction and auth.checkAuthState() call.
          // Relying on AuthProvider's onAuthStateChanged to pick up the session.
          console.log(`[LOGIN_FORM_SUBMIT @ ${new Date().toISOString()}] Login successful. Cookie set. Waiting for AuthProvider to update context and trigger AuthEffect for redirection.`);
          // loginServerActionInitiated is true, auth.loading should become true via AuthProvider,
          // then false when onAuthStateChanged completes. AuthEffect will then handle redirection.

        } else {
          console.log(`[LOGIN_FORM_FAILURE @ ${new Date().toISOString()}] Login server action reported failure. Result:`, result);
          setError(result?.error || 'An unknown error occurred during login.');
          toast({ title: 'Login Failed', description: result?.error || 'Please check your credentials.', variant: 'destructive' });
          setLoginServerActionInitiated(false); 
        }
      } catch (transitionError: any) {
        console.error(`[LOGIN_FORM_ERROR @ ${new Date().toISOString()}] Error within startServerActionTransition async block:`, transitionError);
        setError(transitionError.message || 'An unexpected error occurred.');
        toast({ title: 'Login Error', description: 'An unexpected client-side error occurred.', variant: 'destructive' });
        setLoginServerActionInitiated(false); 
      }
    });
  };
  
  const isLoadingUI = isServerActionPending || (loginServerActionInitiated && auth.loading);
  
  const formRenderTimestamp = useMemo(() => new Date().toISOString(), []);
  console.log(`[LoginForm RENDER @ ${formRenderTimestamp}] isLoadingUI: ${isLoadingUI}, isServerActionPending: ${isServerActionPending}, loginServerActionInitiated: ${loginServerActionInitiated}, auth.user: ${!!auth.user}, auth.loading: ${auth.loading}`);

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
