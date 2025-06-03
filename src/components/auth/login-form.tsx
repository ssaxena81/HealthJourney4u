
'use client';

import React, { useState, useTransition } from 'react';
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
  // mfaCode: z.string().length(8, { message: "MFA code must be 8 digits."}).optional().or(z.literal('')), // MFA removed
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export default function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { setUserProfile: setAuthUserProfile, checkAuthState } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  // const [requiresMfa, setRequiresMfa] = useState(false); // MFA removed

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
      // mfaCode: '', // MFA removed
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    setError(null);
    console.log('[LOGIN_FORM_SUBMIT_START] Submitting login form with values:', values);
    startTransition(async () => {
      const result = await loginUser(values);
      console.log('[LOGIN_FORM_SUBMIT_RESULT] Received result from loginUser action:', JSON.stringify(result, null, 2));

      if (result.success) {
        console.log('[LOGIN_FORM_SUCCESS] Login action reported success.');
        toast({
          title: 'Login Successful!',
          description: 'Welcome back.',
        });

        if (result.userProfile && setAuthUserProfile) {
          console.log('[LOGIN_FORM_SUCCESS] Setting user profile in AuthContext from login action:', result.userProfile);
          setAuthUserProfile(result.userProfile);
        } else {
           await checkAuthState();
        }
        
        console.log('[LOGIN_FORM_SUCCESS] Redirecting to "/".');
        router.push('/');
        router.refresh(); 

      } else {
        console.log('[LOGIN_FORM_FAILURE] Login action reported failure. Result:', result);
        // MFA logic removed
        // if (result.requiresMfa) {
        //   setRequiresMfa(true);
        //   setError(result.error || "MFA code required. Please check your device.");
        //    console.log('[LOGIN_FORM_MFA_REQUIRED] MFA is required. Prompting for code.');
        // } else {
        //   setRequiresMfa(false);
          setError(result.error || 'An unknown error occurred.');
          toast({
            title: 'Login Failed',
            description: result.error || 'Please check your credentials.',
            variant: 'destructive',
          });
           console.log('[LOGIN_FORM_ERROR] Login failed with error:', result.error, 'Code:', result.errorCode);
        // }
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
      
      {/* Removed requiresMfa condition wrapper */}
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

      {/* Removed MFA code input block */}
      {/* {requiresMfa && ( ... )} */}

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

    