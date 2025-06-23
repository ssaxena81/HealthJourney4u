
'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { auth as firebaseAuthInstance, db } from '@/lib/firebase/clientApp';
import { doc, updateDoc } from 'firebase/firestore';

const loginFormSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(1, {message: "Password is required."}),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export default function LoginForm() {
  const { toast } = useToast();
  const router = useRouter();
  const auth = useAuth();
  const [isClientActionPending, startClientActionTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // This effect handles redirecting the user AFTER the useAuth hook has confirmed
  // they are logged in. This is triggered both for users who are already logged in
  // when they visit the page, and for users who have just successfully signed in.
  useEffect(() => {
    if (!auth.loading && auth.user) {
      if (auth.userProfile?.profileSetupComplete) {
        router.replace('/dashboard');
      } else {
        router.replace('/profile');
      }
    }
  }, [auth.user, auth.userProfile, auth.loading, router]);


  const onSubmit = (values: LoginFormValues) => {
    setError(null);
    startClientActionTransition(async () => {
      try {
        const userCredential = await signInWithEmailAndPassword(
          firebaseAuthInstance,
          values.email,
          values.password
        );
        
        // After successful sign-in, onAuthStateChanged in useAuth.tsx will fire.
        // We just show a toast here. The useEffect above will handle redirection.
        toast({ title: "Login Successful", description: "Redirecting..." });
        
        // We can also perform post-login actions like updating the lastLoggedInDate.
        if (userCredential.user) {
          const userProfileDocRef = doc(db, "users", userCredential.user.uid);
          await updateDoc(userProfileDocRef, { lastLoggedInDate: new Date().toISOString() });
        }

      } catch (authError: any) {
        let errorMessage = 'An unknown error occurred during login.';
        if (authError.code) {
          switch (authError.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
              errorMessage = 'Invalid email or password.';
              break;
            default:
              errorMessage = authError.message;
              break;
          }
        }
        setError(errorMessage);
        toast({ title: 'Login Failed', description: errorMessage, variant: 'destructive' });
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
            disabled={isClientActionPending}
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
              disabled={isClientActionPending}
              autoComplete="current-password"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isClientActionPending}
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

      <Button type="submit" className="w-full" disabled={isClientActionPending}>
        {isClientActionPending ? (
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
