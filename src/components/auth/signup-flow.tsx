
'use client';

import React, { useState, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { signUpUser } from '@/app/actions/auth'; // checkEmailAvailability removed
import { passwordSchema } from '@/types';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SubscriptionTier, UserProfile } from '@/types';
import { subscriptionTiers } from '@/types';
// import ComparePlansDialog from '@/components/ui/compare-plans-dialog'; // Kept commented
import { useAuth } from '@/hooks/useAuth';

const signUpFormSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: passwordSchema,
  confirmPassword: passwordSchema,
  subscriptionTier: z.custom<SubscriptionTier>((val) => subscriptionTiers.includes(val as SubscriptionTier), {
    message: "Invalid subscription tier.",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match.",
  path: ['confirmPassword'],
});

type SignUpFormValues = z.infer<typeof signUpFormSchema>;

export default function SignUpFlow() {
  const router = useRouter();
  const { toast } = useToast();
  const { checkAuthState } = useAuth(); // setUserProfile removed as it's not directly used here now
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      subscriptionTier: 'free'
    },
  });


  const handleFormSubmit = (values: SignUpFormValues) => {
    setError(null);
    console.log('[SignUpFlow handleFormSubmit] Submitting Sign Up form with values:', values);
    startTransition(async () => {
      const result = await signUpUser({
        email: values.email,
        password: values.password,
        confirmPassword: values.confirmPassword,
        subscriptionTier: values.subscriptionTier,
      });
      
      console.log('[SignUpFlow handleFormSubmit] Server action result from signUpUser:', result);

      if (result.success && result.userId) { 
        toast({
          title: 'Account Created!',
          description: 'You have successfully signed up. Please complete your profile.',
        });
        
        await checkAuthState(); 

        router.push('/profile'); 
      } else {
        const displayError = result.error || 'An unknown error occurred during sign up.';
        const displayErrorCode = result.errorCode ? ` (Code: ${result.errorCode})` : '';
        
        console.error(`[SignUpFlow] Sign up failed. Error: ${displayError}, Code: ${result.errorCode}, Details:`, result.details);
        setError(`${displayError}${displayErrorCode}`);
        toast({
          title: 'Sign Up Failed',
          description: `${displayError}${displayErrorCode}`,
          variant: 'destructive',
        });
        
        if (result.errorCode === 'auth/email-already-in-use') {
            form.setError('email', { type: 'manual', message: 'This email is already registered. Please log in or use a different email.' });
        }
        if (result.details?.fieldErrors?.password) {
            form.setError('password', { type: 'manual', message: (result.details.fieldErrors.password as string[]).join(', ') });
        }
        if (result.details?.fieldErrors?.confirmPassword) {
            form.setError('confirmPassword', { type: 'manual', message: (result.details.fieldErrors.confirmPassword as string[]).join(', ') });
        }
      }
    });
  };

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email-signup">Email</Label>
            <Input
              id="email-signup"
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
            <Label htmlFor="password-signup">Password</Label>
            <div className="relative">
              <Input
                id="password-signup"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                {...form.register('password')}
                disabled={isPending}
                autoComplete="new-password"
              />
              <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)} disabled={isPending} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {form.formState.errors.password && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword-signup">Confirm Password</Label>
             <div className="relative">
              <Input
                id="confirmPassword-signup"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="••••••••"
                {...form.register('confirmPassword')}
                disabled={isPending}
                autoComplete="new-password"
              />
              <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowConfirmPassword(!showConfirmPassword)} disabled={isPending} aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}>
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {form.formState.errors.confirmPassword && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.confirmPassword.message}</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Password must be at least 8 characters, include one uppercase letter, one number, and one special character.
          </p>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
                <Label htmlFor="subscriptionTier">Subscription Plan</Label>
                {/* <ComparePlansDialog trigger={<Button variant="link" type="button" size="sm" className="p-0 h-auto text-xs">Compare Plans</Button>} /> */}
            </div>
            <Controller
              name="subscriptionTier"
              control={form.control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isPending}>
                  <SelectTrigger id="subscriptionTier">
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {subscriptionTiers.map(tier => (
                      <SelectItem key={tier} value={tier} className="capitalize">
                        {tier.charAt(0).toUpperCase() + tier.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.subscriptionTier && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.subscriptionTier.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Create Account'}
          </Button>
        </form>
    </div>
  );
}

    