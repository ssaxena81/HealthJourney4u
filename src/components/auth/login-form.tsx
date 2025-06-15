
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

const loginFormSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(1, {message: "Password is required."}),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export default function LoginForm() {
  const { toast } = useToast();
  const router = useRouter();
  const auth = useAuth();
  const [isTransitionPending, startTransition] = useTransition(); // Renamed isPending for clarity
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loginServerActionCompleted, setLoginServerActionCompleted] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    console.log(`[LoginForm useEffect] Triggered. loginServerActionCompleted: ${loginServerActionCompleted}, auth.user: ${!!auth.user}, auth.loading: ${auth.loading}, auth.userProfile: ${!!auth.userProfile}`);
    if (loginServerActionCompleted && auth.user && !auth.loading) {
      console.log('[LoginForm useEffect] Conditions met for redirect. AuthContext user and profile available, and not loading.');
      
      const profileSetupComplete = auth.userProfile?.profileSetupComplete;
      console.log(`[LoginForm useEffect] Profile setup complete from AuthContext: ${profileSetupComplete}`);

      if (profileSetupComplete === true) {
        console.log('[LoginForm useEffect] Redirecting (client-side) to dashboard page (/).');
        router.push('/');
      } else {
        console.log(`[LoginForm useEffect] Redirecting (client-side) to profile setup page (/profile). Reason: profileSetupComplete is ${profileSetupComplete}`);
        router.push('/profile');
      }
      setLoginServerActionCompleted(false); // Reset flag after redirect attempt
    } else if (loginServerActionCompleted && !auth.user && !auth.loading) {
        console.warn("[LoginForm useEffect] Login server action completed, but auth.user is still null and not loading. This might indicate an issue with onAuthStateChanged or profile fetch.");
        // Optionally set an error or toast here if this state persists.
    }
  }, [auth.user, auth.userProfile, auth.loading, loginServerActionCompleted, router, toast]);

  const onSubmit = (values: LoginFormValues) => {
    setError(null);
    setLoginServerActionCompleted(false); // Reset before new attempt
    console.log('[LOGIN_FORM_SUBMIT_START] Submitting login form with email:', values.email);
    startTransition(async () => {
      try {
        const result = await loginUser(values);
        console.log('[LOGIN_FORM_SUBMIT_RESULT] Received result from loginUser server action:', result);

        if (result && result.success && result.userId) {
          console.log('[LOGIN_FORM_SERVER_SUCCESS] Login server action successful. Waiting for AuthContext to update via onAuthStateChanged.');
          toast({
            title: 'Login Submitted',
            description: 'Verifying session, please wait...',
          });
          setLoginServerActionCompleted(true); // Signal that AuthContext should now update and trigger useEffect
          // DO NOT call auth.checkAuthState() here. Let onAuthStateChanged in AuthProvider handle it.
          // DO NOT redirect here. Let the useEffect handle it after AuthContext update.
        } else {
          console.log('[LOGIN_FORM_FAILURE] Login action reported failure. Result:', result);
          setError(result?.error || 'An unknown error occurred during login.');
          toast({
            title: 'Login Failed',
            description: result?.error || 'Please check your credentials.',
            variant: 'destructive',
          });
          setLoginServerActionCompleted(false);
        }
      } catch (transitionError: any) {
        console.error('[LOGIN_FORM_ERROR] Error within startTransition async block:', transitionError);
        setError(transitionError.message || 'An unexpected error occurred.');
        toast({ title: 'Login Error', description: 'An unexpected client-side error occurred.', variant: 'destructive' });
        setLoginServerActionCompleted(false);
      }
    });
  };
  
  const isLoadingState = isTransitionPending || (loginServerActionCompleted && auth.loading);

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
            disabled={isLoadingState}
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
              disabled={isLoadingState}
              autoComplete="current-password"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isLoadingState}
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

      <Button type="submit" className="w-full" disabled={isLoadingState}>
        {isLoadingState ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {loginServerActionCompleted && auth.loading ? 'Verifying...' : 'Logging In...'}
          </>
        ) : (
          'Log In'
        )}
      </Button>
    </form>
  );
}
    
