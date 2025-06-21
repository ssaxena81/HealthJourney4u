
'use client';

import React, { useState, useTransition, useEffect } from 'react';
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
  
  // This effect handles the case where a user is already logged in when they visit the /login page.
  useEffect(() => {
    if (!auth.loading && auth.user && auth.userProfile) {
      if (auth.userProfile.profileSetupComplete) {
        router.replace('/'); 
      } else {
        router.replace('/profile'); 
      }
    }
  }, [auth.user, auth.userProfile, auth.loading, router]);


  const onSubmit = (values: LoginFormValues) => {
    setError(null);
    const submitTime = new Date().toISOString();
    console.log(`[LOGIN_FORM_SUBMIT_START @ ${submitTime}] Submitting login form with email:`, values.email);
    
    startServerActionTransition(async () => {
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
          
          toast({ title: "Login Successful", description: "Redirecting to your dashboard..." });
          // Force a full page reload to the dashboard.
          // This ensures the AuthProvider re-initializes with the new session state from Firebase.
          window.location.href = '/';

        } else {
          console.log(`[LOGIN_FORM_FAILURE @ ${new Date().toISOString()}] Login server action reported failure. Result:`, result);
          setError(result?.error || 'An unknown error occurred during login.');
          toast({ title: 'Login Failed', description: result?.error || 'Please check your credentials.', variant: 'destructive' });
        }
      } catch (transitionError: any) {
        console.error(`[LOGIN_FORM_ERROR @ ${new Date().toISOString()}] Error within startServerActionTransition async block:`, transitionError);
        setError(transitionError.message || 'An unexpected error occurred.');
        toast({ title: 'Login Error', description: 'An unexpected client-side error occurred.', variant: 'destructive' });
      }
    });
  };
  
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
            disabled={isServerActionPending}
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
              disabled={isServerActionPending}
              autoComplete="current-password"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isServerActionPending}
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

      <Button type="submit" className="w-full" disabled={isServerActionPending}>
        {isServerActionPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {'Logging In...'}
          </>
        ) : (
          'Log In'
        )}
      </Button>
    </form>
  );
}
