
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
  
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // This effect handles the case where a user is already logged in when they visit the /login page.
  useEffect(() => {
    if (!auth.loading && auth.user && auth.userProfile) {
      if (auth.userProfile.profileSetupComplete) {
        router.replace('/dashboard'); 
      } else {
        router.replace('/profile'); 
      }
    }
  }, [auth.user, auth.userProfile, auth.loading, router]);


  const onSubmit = (values: LoginFormValues) => {
    setError(null);
    startServerActionTransition(async () => {
      try {
        const result: LoginResult = await loginUser(values);

        if (result && result.success && result.userId) {
          
          if (result.initialCookieState) {
            const clientSideInitialCookie: AppAuthStateCookie = {
              isProfileCreated: result.initialCookieState.isProfileCreated,
              authSyncComplete: false, 
            };
            setCookie('app_auth_state', JSON.stringify(clientSideInitialCookie), 1);
          } else {
            setCookie('app_auth_state', JSON.stringify({ isProfileCreated: false, authSyncComplete: false }), 1);
          }
          
          toast({ title: "Login Successful", description: "Redirecting..." });
          
          // --- FIX [2024-07-26 19:14:00] ---
          // Replaced `window.location.href = '/'` with `window.location.assign()` and added intelligent routing.
          // This forces a full page reload to the *correct* page, ensuring the AuthProvider is 
          // re-initialized with the new authentication state and avoiding the race condition.

          // Case 1: Password has expired.
          if (result.passwordExpired) {
            window.location.assign('/reset-password-required');
            return;
          }

          // Case 2: User profile is fully set up.
          if (result.userProfile?.profileSetupComplete) {
            window.location.assign('/dashboard');
          } else {
            // Case 3: User profile is not yet complete.
            window.location.assign('/profile');
          }
          // --- END FIX ---

        } else {
          setError(result?.error || 'An unknown error occurred during login.');
          toast({ title: 'Login Failed', description: result?.error || 'Please check your credentials.', variant: 'destructive' });
        }
      } catch (transitionError: any) {
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
