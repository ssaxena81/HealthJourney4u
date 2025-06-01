
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
import { checkEmailAvailability, signUpUser } from '@/app/actions/auth';
import { passwordSchema } from '@/types';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SubscriptionTier, UserProfile } from '@/types';
import { subscriptionTiers } from '@/types';
import ComparePlansDialog from '@/components/ui/compare-plans-dialog'; 
import { useAuth } from '@/hooks/useAuth';

const step1Schema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
});
type Step1Values = z.infer<typeof step1Schema>;

const step2Schema = z.object({
  password: passwordSchema,
  confirmPassword: passwordSchema,
  subscriptionTier: z.custom<SubscriptionTier>((val) => subscriptionTiers.includes(val as SubscriptionTier), {
    message: "Invalid subscription tier.",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match.",
  path: ['confirmPassword'],
});
type Step2Values = z.infer<typeof step2Schema>;

export default function SignUpFlow() {
  const router = useRouter();
  const { toast } = useToast();
  const { checkAuthState, setUserProfile: setAuthUserProfile } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState(1);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const step1Form = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: { email: '' },
  });

  const step2Form = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { password: '', confirmPassword: '', subscriptionTier: 'free' },
  });

  const handleStep1Submit = (values: Step1Values) => {
    setError(null);
    console.log('[SignUpFlow handleStep1Submit] Checking email:', values.email);
    startTransition(async () => {
      const result = await checkEmailAvailability({ email: values.email });
      console.log('[SignUpFlow handleStep1Submit] Server action result from checkEmailAvailability:', result);
      if (result.available) {
        setEmail(values.email);
        setCurrentStep(2);
        toast({ title: 'Email Available', description: 'Please proceed to the next step.' });
      } else {
        const errorMessage = result.error || 'This email is already registered or invalid.';
        setError(errorMessage);
        step1Form.setError('email', { type: 'manual', message: errorMessage });
        toast({ title: 'Email Check Failed', description: errorMessage, variant: 'destructive' });
      }
    });
  };

  const handleStep2Submit = (values: Step2Values) => {
    setError(null);
    console.log('[SignUpFlow handleStep2Submit] Submitting Step 2 with email:', email, 'and values:', values);
    startTransition(async () => {
      const result = await signUpUser({
        email: email,
        password: values.password,
        confirmPassword: values.confirmPassword,
        subscriptionTier: values.subscriptionTier,
      });
      
      console.log('[SignUpFlow handleStep2Submit] Server action result from signUpUser:', result);

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

        if (result.details?.fieldErrors?.password) {
            step2Form.setError('password', { type: 'manual', message: (result.details.fieldErrors.password as string[]).join(', ') });
        }
        if (result.details?.fieldErrors?.confirmPassword) {
            step2Form.setError('confirmPassword', { type: 'manual', message: (result.details.fieldErrors.confirmPassword as string[]).join(', ') });
        }
        // If there's a general errorCode related to Firebase config, it will be in the main error message.
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

      {currentStep === 1 && (
        <form onSubmit={step1Form.handleSubmit(handleStep1Submit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email-step1">Email</Label>
            <Input
              id="email-step1"
              type="email"
              placeholder="you@example.com"
              {...step1Form.register('email')}
              disabled={isPending}
              autoComplete="email"
            />
            {step1Form.formState.errors.email && (
              <p className="text-sm text-destructive mt-1">{step1Form.formState.errors.email.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Continue'}
          </Button>
        </form>
      )}

      {currentStep === 2 && (
        <form onSubmit={step2Form.handleSubmit(handleStep2Submit)} className="space-y-6">
          <div>
            <p className="text-sm text-muted-foreground">Creating account for: <strong>{email}</strong></p>
            <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => {setCurrentStep(1); setError(null); step1Form.setValue('email', email);}}>Change email</Button>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password-step2">Password</Label>
            <div className="relative">
              <Input
                id="password-step2"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                {...step2Form.register('password')}
                disabled={isPending}
                autoComplete="new-password"
              />
              <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)} disabled={isPending} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {step2Form.formState.errors.password && (
              <p className="text-sm text-destructive mt-1">{step2Form.formState.errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword-step2">Confirm Password</Label>
             <div className="relative">
              <Input
                id="confirmPassword-step2"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="••••••••"
                {...step2Form.register('confirmPassword')}
                disabled={isPending}
                autoComplete="new-password"
              />
              <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowConfirmPassword(!showConfirmPassword)} disabled={isPending} aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}>
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {step2Form.formState.errors.confirmPassword && (
              <p className="text-sm text-destructive mt-1">{step2Form.formState.errors.confirmPassword.message}</p>
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
              control={step2Form.control}
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
            {step2Form.formState.errors.subscriptionTier && (
              <p className="text-sm text-destructive mt-1">{step2Form.formState.errors.subscriptionTier.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Create Account'}
          </Button>
        </form>
      )}
    </div>
  );
}

    

    
