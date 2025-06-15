
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
import type { LoginResult } from '@/types'; // Assuming LoginResult is exported from types or auth actions

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
  const [loginAttemptedSuccessfully, setLoginAttemptedSuccessfully] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // This useEffect handles redirection AFTER the AuthContext is updated
  useEffect(() => {
    console.log(`[LoginForm useEffect] Triggered. loginAttemptedSuccessfully: ${loginAttemptedSuccessfully}, auth.user: ${!!auth.user}, auth.loading: ${auth.loading}, auth.userProfile: ${!!auth.userProfile}`);
    
    if (loginAttemptedSuccessfully && auth.user && !auth.loading) {
      // This block means:
      // 1. Login server action was successful.
      // 2. onAuthStateChanged in AuthProvider has fired for the new user.
      // 3. User profile has been fetched (or attempted).
      // 4. AuthProvider is no longer in a "loading" state for this auth change.
      console.log('[LoginForm useEffect] AuthContext updated. Proceeding with redirection logic.');
      
      const profileSetupComplete = auth.userProfile?.profileSetupComplete;
      console.log(`[LoginForm useEffect] Profile setup complete from AuthContext: ${profileSetupComplete}`);

      if (profileSetupComplete === true) {
        console.log('[LoginForm useEffect] Redirecting (client-side) to dashboard page (/).');
        router.push('/');
      } else {
        console.log(`[LoginForm useEffect] Redirecting (client-side) to profile setup page (/profile). Reason: profileSetupComplete is ${profileSetupComplete}`);
        router.push('/profile');
      }
      setLoginAttemptedSuccessfully(false); // Reset flag after successful redirect attempt
    } else if (loginAttemptedSuccessfully && !auth.user && !auth.loading) {
        // This case means login server action was successful, but AuthProvider finished loading
        // without setting a user. This could happen if onAuthStateChanged fires with null user
        // *after* the login, or if there's a race condition.
        console.warn("[LoginForm useEffect] Login server action completed, but AuthContext.user is still null and AuthContext is not loading. This might indicate an issue with onAuthStateChanged propagation or profile fetch failure leading to premature loading=false.");
        // Optionally set an error here or advise user to try again.
        // setError("Login verification failed on client. Please try again.");
        // toast({ title: "Verification Issue", description: "Could not verify your session. Please try logging in again.", variant: "destructive"});
        // setLoginAttemptedSuccessfully(false); // Reset to allow another attempt
    }
  }, [auth.user, auth.userProfile, auth.loading, loginAttemptedSuccessfully, router, toast, auth]);


  const onSubmit = (values: LoginFormValues) => {
    setError(null);
    setLoginAttemptedSuccessfully(false); 
    console.log('[LOGIN_FORM_SUBMIT_START] Submitting login form with email:', values.email);
    startServerActionTransition(async () => {
      try {
        const result: LoginResult = await loginUser(values); // Ensure LoginResult is typed
        console.log('[LOGIN_FORM_SUBMIT_RESULT] Received result from loginUser server action:', result);

        if (result && result.success && result.userId) {
          console.log('[LOGIN_FORM_SERVER_SUCCESS] Login server action successful. Waiting for AuthProvider to update context via onAuthStateChanged.');
          toast({
            title: 'Login Submitted',
            description: 'Verifying session...',
          });
          setLoginAttemptedSuccessfully(true); 
          // IMPORTANT: Do NOT redirect here. Let the useEffect handle it after AuthContext updates.
          // IMPORTANT: Do NOT call auth.checkAuthState() here. Let onAuthStateChanged handle it.
        } else {
          console.log('[LOGIN_FORM_FAILURE] Login server action reported failure. Result:', result);
          setError(result?.error || 'An unknown error occurred during login.');
          toast({
            title: 'Login Failed',
            description: result?.error || 'Please check your credentials.',
            variant: 'destructive',
          });
          setLoginAttemptedSuccessfully(false); // Ensure flag is false on failure
        }
      } catch (transitionError: any) {
        console.error('[LOGIN_FORM_ERROR] Error within startServerActionTransition async block:', transitionError);
        setError(transitionError.message || 'An unexpected error occurred.');
        toast({ title: 'Login Error', description: 'An unexpected client-side error occurred.', variant: 'destructive' });
        setLoginAttemptedSuccessfully(false); // Ensure flag is false on client error
      }
    });
  };
  
  // Determine overall loading state for the UI
  const isLoadingUI = isServerActionPending || (loginAttemptedSuccessfully && auth.loading);

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
