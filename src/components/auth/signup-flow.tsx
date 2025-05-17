
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
import { checkEmailAvailability, signUpUser, passwordSchema } from '@/app/actions/auth';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SubscriptionTier } from '@/types';
import { subscriptionTiers } from '@/types';
import ComparePlansDialog from '@/components/ui/compare-plans-dialog'; // Create this component

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
    startTransition(async () => {
      const result = await checkEmailAvailability({ email: values.email });
      if (result.available) {
        setEmail(values.email);
        setCurrentStep(2);
      } else {
        setError(result.error || 'This email is already registered or invalid.');
        step1Form.setError('email', { type: 'manual', message: result.error || 'This email is already registered or invalid.' });
      }
    });
  };

  const handleStep2Submit = (values: Step2Values) => {
    setError(null);
    startTransition(async () => {
      const result = await signUpUser({
        email: email,
        password: values.password,
        confirmPassword: values.confirmPassword,
        subscriptionTier: values.subscriptionTier,
      });

      if (result.success) {
        toast({
          title: 'Account Created!',
          description: 'You have successfully signed up. Please complete your profile.',
        });
        // Firebase handles login automatically after signup with createUserWithEmailAndPassword
        // Redirect to profile setup page
        router.push('/profile');
      } else {
        setError(result.error || 'An unknown error occurred.');
        toast({
          title: 'Sign Up Failed',
          description: result.error || 'Please try again.',
          variant: 'destructive',
        });
        if (result.details?.fieldErrors.password) {
            step2Form.setError('password', { type: 'manual', message: result.details.fieldErrors.password.join(', ') });
        }
        if (result.details?.fieldErrors.confirmPassword) {
            step2Form.setError('confirmPassword', { type: 'manual', message: result.details.fieldErrors.confirmPassword.join(', ') });
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
            />
            {step1Form.formState.errors.email && (
              <p className="text-sm text-destructive">{step1Form.formState.errors.email.message}</p>
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
            <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => {setCurrentStep(1); setError(null);}}>Change email</Button>
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
              />
              <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)} disabled={isPending}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {step2Form.formState.errors.password && (
              <p className="text-sm text-destructive">{step2Form.formState.errors.password.message}</p>
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
              />
              <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowConfirmPassword(!showConfirmPassword)} disabled={isPending}>
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {step2Form.formState.errors.confirmPassword && (
              <p className="text-sm text-destructive">{step2Form.formState.errors.confirmPassword.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
                <Label htmlFor="subscriptionTier">Subscription Plan</Label>
                <ComparePlansDialog trigger={<Button variant="link" type="button" size="sm" className="p-0 h-auto text-xs">Compare Plans</Button>} />
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
              <p className="text-sm text-destructive">{step2Form.formState.errors.subscriptionTier.message}</p>
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
