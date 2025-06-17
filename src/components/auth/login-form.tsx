
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
import { setCookie, getCookie, eraseCookie } from '@/lib/cookie-utils'; // Import cookie utils

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
  
  // This state signals that the login server action has completed and client-side effects should run
  const [loginServerActionCompleted, setLoginServerActionCompleted] = useState(false);
  // This state holds the cookie data read by the effect, to avoid multiple getCookie calls in one render cycle
  const [currentCookieState, setCurrentCookieState] = useState<AppAuthStateCookie | null>(null);


  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // Effect to react to AuthProvider completing its sync (signaled by app_auth_state cookie)
  // This is more of a reactive listener to the cookie now
  useEffect(() => {
    const effectTimestamp = new Date().toISOString();
    console.log(`[LoginForm CookieListenerEffect @ ${effectTimestamp}] Triggered. loginServerActionCompleted: ${loginServerActionCompleted}, auth.user: ${!!auth.user}, auth.loading: ${auth.loading}`);
    
    const cookieString = getCookie('app_auth_state');
    let parsedCookie: AppAuthStateCookie | null = null;
    if (cookieString) {
      try {
        parsedCookie = JSON.parse(cookieString);
        setCurrentCookieState(parsedCookie); // Update local state for other logic if needed
      } catch (e) {
        console.error("[LoginForm CookieListenerEffect] Error parsing app_auth_state cookie:", e);
        eraseCookie('app_auth_state'); // Clear malformed cookie
      }
    } else {
        setCurrentCookieState(null);
    }

    if (parsedCookie && parsedCookie.authSyncComplete) {
      console.log(`[LoginForm CookieListenerEffect @ ${effectTimestamp}] app_auth_state cookie found with authSyncComplete=true. Cookie state:`, parsedCookie);
      console.log(`  Auth context state: User UID: ${auth.user?.uid}, Profile ID: ${auth.userProfile?.id}, ProfileSetupComplete: ${auth.userProfile?.profileSetupComplete}`);

      // Double-check with AuthContext if it's also ready
      if (auth.user && !auth.loading) {
        const profileSetupComplete = auth.userProfile?.profileSetupComplete;
        console.log(`[LoginForm CookieListenerEffect @ ${effectTimestamp}] AuthProvider context ready. Profile setup complete: ${profileSetupComplete}`);
        
        // At this point, AuthProvider should have set the cookie correctly.
        // The redirection logic below (onSubmit or another effect if user already logged in) should handle it.
        // If login form is still visible, and auth is complete, redirect.
        if (profileSetupComplete) {
          console.log(`[LoginForm CookieListenerEffect @ ${effectTimestamp}] Redirecting to / (dashboard) as profile is complete.`);
          router.push('/');
        } else {
          console.log(`[LoginForm CookieListenerEffect @ ${effectTimestamp}] Redirecting to /profile as profile is not complete.`);
          router.push('/profile');
        }
        eraseCookie('app_auth_state'); // Clean up cookie once used for this redirection cycle
      } else {
        console.log(`[LoginForm CookieListenerEffect @ ${effectTimestamp}] Cookie has authSyncComplete=true, but AuthContext not fully ready (User: ${!!auth.user}, Loading: ${auth.loading}). Waiting for AuthContext.`);
      }
    } else if (loginServerActionCompleted && !parsedCookie?.authSyncComplete) {
      console.log(`[LoginForm CookieListenerEffect @ ${effectTimestamp}] Login server action completed, but app_auth_state cookie does not have authSyncComplete=true yet. Waiting for AuthProvider.`);
    }
  }, [auth.user, auth.userProfile, auth.loading, loginServerActionCompleted, router]); // Re-run when these change

  const onSubmit = (values: LoginFormValues) => {
    setError(null);
    setLoginServerActionCompleted(false); // Reset for new submission
    setCurrentCookieState(null); // Reset
    console.log('[LOGIN_FORM_SUBMIT_START] Submitting login form with email:', values.email);
    startServerActionTransition(async () => {
      try {
        // Scenario A: Cookie might not be present, or if present, might be stale.
        // Server action (`loginUser`) will handle DB checks and return initial state for the cookie.
        const result: LoginResult = await loginUser(values);
        console.log('[LOGIN_FORM_SUBMIT_RESULT] Received result from loginUser server action:', result);

        if (result && result.success && result.userId) {
          setLoginServerActionCompleted(true); // Signal server action done
          toast({ title: 'Login Submitted', description: 'Verifying session...' });

          if (result.initialCookieState) {
            const clientSideInitialCookie: AppAuthStateCookie = {
              isProfileCreated: result.initialCookieState.isProfileCreated,
              authSyncComplete: false, // Server action provides initial state; AuthProvider confirms full sync
            };
            console.log('[LOGIN_FORM_SUBMIT] Setting app_auth_state cookie with initial state from server:', clientSideInitialCookie);
            setCookie('app_auth_state', JSON.stringify(clientSideInitialCookie), 1);
            setCurrentCookieState(clientSideInitialCookie); // Update local state immediately

            // Immediate redirection based on isProfileCreated from server's response
            if (clientSideInitialCookie.isProfileCreated) {
              console.log('[LOGIN_FORM_SUBMIT] Initial redirection to / (dashboard) based on isProfileCreated=true from server.');
              router.push('/');
            } else {
              console.log('[LOGIN_FORM_SUBMIT] Initial redirection to /profile based on isProfileCreated=false from server.');
              router.push('/profile');
            }
            // AuthProvider's onAuthStateChanged will eventually fire, fetch full profile,
            // and update the app_auth_state cookie with authSyncComplete: true.
            // The useEffect above will catch this if further action/redirection is needed.
          } else {
            console.warn('[LOGIN_FORM_SUBMIT] Login successful but no initialCookieState received from server. Relying on AuthProvider.');
            // If no initialCookieState, we rely on AuthProvider to set the cookie.
            // The useEffect will pick up that change.
          }
        } else {
          console.log('[LOGIN_FORM_FAILURE] Login server action reported failure. Result:', result);
          setError(result?.error || 'An unknown error occurred during login.');
          toast({ title: 'Login Failed', description: result?.error || 'Please check your credentials.', variant: 'destructive' });
          setLoginServerActionCompleted(false);
        }
      } catch (transitionError: any) {
        console.error('[LOGIN_FORM_ERROR] Error within startServerActionTransition async block:', transitionError);
        setError(transitionError.message || 'An unexpected error occurred.');
        toast({ title: 'Login Error', description: 'An unexpected client-side error occurred.', variant: 'destructive' });
        setLoginServerActionCompleted(false);
      }
    });
  };
  
  // Determine overall loading state for UI
  // isLoadingUI is true if server action is pending, OR if server action completed but AuthProvider hasn't signaled full sync via cookie.
  const isLoadingUI = isServerActionPending || (loginServerActionCompleted && (!currentCookieState || !currentCookieState.authSyncComplete) && auth.loading);

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
