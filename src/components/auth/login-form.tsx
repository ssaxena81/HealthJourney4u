
'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation'; // useRouter for client-side navigation
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { loginUser } from '@/app/actions/auth';
import { Loader2, Eye, EyeOff } from 'lucide-react';
// UserProfile type might still be useful if the server action eventually returns it fully.
// import type { UserProfile } from '@/types'; 
// Auth context is not directly used for setting user/profile here anymore,
// relying on AuthProvider and onAuthStateChanged after navigation.

const loginFormSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(1, {message: "Password is required."}),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export default function LoginForm() {
  const { toast } = useToast();
  const router = useRouter(); // Initialize useRouter
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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

        if (result.success && result.userProfile) { // This is the ideal success case
          toast({
            title: 'Login Successful!',
            description: 'Welcome back. Redirecting...',
          });
          
          const serverProfile = result.userProfile;
          console.log('[LOGIN_FORM_SUCCESS] Profile from server for redirection check:', serverProfile);

          const profileSetupComplete = serverProfile?.profileSetupComplete;
          console.log(`[LOGIN_FORM_SUCCESS] Profile setup complete status from server: ${profileSetupComplete}`);

          if (profileSetupComplete === true) {
            console.log('[LOGIN_FORM_SUCCESS] Redirecting (client-side) to dashboard page (/).');
            router.push('/'); // Use router.push for client-side navigation
          } else {
            console.log(`[LOGIN_FORM_SUCCESS] Redirecting (client-side) to profile setup page (/profile). Reason: profileSetupComplete is ${profileSetupComplete}`);
            router.push('/profile'); // Use router.push
          }
        } else if (result.success && result.userId && result.userProfile === null) { 
          // This case was for testing, where userProfile was explicitly null
          // It implies profile setup is needed.
          console.log('[LOGIN_FORM_SUCCESS_PROFILE_NULL] Login succeeded, got userId, profile is null. Redirecting to /profile for setup.');
          toast({ title: 'Login Successful', description: 'Redirecting to complete profile setup.' });
          router.push('/profile'); // Use router.push
        } else if (result.success && result.message && !result.userId && !result.userProfile) { 
            // This was the "super simple test" case
            console.warn('[LOGIN_FORM_WARNING_SUPER_SIMPLE] Login action returned minimal success. This was a test state.');
            setError('Test login succeeded but full data not returned. Please contact support or try again if this is unexpected.');
            toast({ title: 'Test Login Succeeded', description: 'Full user data not available in this test response.', variant: 'default' });
            // No redirect here as it's a test state that shouldn't go to profile/dashboard
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
