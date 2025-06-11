
'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
// useRouter is not strictly needed if we use window.location for redirect, but keep for now if other links exist.
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { loginUser } from '@/app/actions/auth';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { UserProfile } from '@/types';
import { auth as firebaseAuthModule } from '@/lib/firebase/clientApp'; // For direct currentUser check

const loginFormSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(1, {message: "Password is required."}),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export default function LoginForm() {
  const { toast } = useToast();
  const router = useRouter(); // Keep for other navigation (e.g. forgot password link)
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  // checkAuthState removed from here, as we will rely on full page reload
  const { setUserProfile: setContextUserProfile, setUser: setContextUser } = useAuth();


  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    setError(null);
    console.log('[LOGIN_FORM_SUBMIT_START] Submitting login form with values:', values.email);
    startTransition(async () => {
      try {
        const result = await loginUser(values);
        console.log('[LOGIN_FORM_SUBMIT_RESULT] Received result from loginUser action:', JSON.stringify(result, null, 2));

        if (result.success && result.userProfile) {
          toast({
            title: 'Login Successful!',
            description: 'Welcome back. Redirecting...',
          });
          
          // Server action returned success, and userProfile is available.
          const serverProfile = result.userProfile;
          console.log('[LOGIN_FORM_SUCCESS] Profile from server for redirection check:', serverProfile);

          const profileSetupComplete = serverProfile?.profileSetupComplete;
          console.log(`[LOGIN_FORM_SUCCESS] Profile setup complete status from server: ${profileSetupComplete}`);

          // Forcing a full page reload to ensure client-side Firebase SDK picks up the auth state
          if (profileSetupComplete === true) {
            console.log('[LOGIN_FORM_SUCCESS] Redirecting (full page reload) to dashboard page (/).');
            window.location.href = '/';
          } else {
            console.log('[LOGIN_FORM_SUCCESS] Redirecting (full page reload) to profile setup page (/profile). Reason: profileSetupComplete is', profileSetupComplete);
            window.location.href = '/profile';
          }

        } else if (result.success && !result.userProfile) {
           console.warn('[LOGIN_FORM_WARNING] Login succeeded but server action did not return userProfile.');
           setError('Login succeeded but profile data could not be retrieved. Please try again or contact support.');
           toast({ title: 'Profile Data Missing', description: 'Login succeeded but profile data is missing. Please try again.', variant: 'destructive' });
        } else {
          console.log('[LOGIN_FORM_FAILURE] Login action reported failure. Result:', result);
          setError(result.error || 'An unknown error occurred.');
          toast({
            title: 'Login Failed',
            description: result.error || 'Please check your credentials.',
            variant: 'destructive',
          });
        }
      } catch (transitionError: any) {
        console.error('[LOGIN_FORM_ERROR] Error within startTransition async block:', transitionError);
        setError(transitionError.message || 'An unexpected error occurred during login process.');
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
            disabled={isPending}
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
              disabled={isPending}
              autoComplete="current-password"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isPending}
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

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? (
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
