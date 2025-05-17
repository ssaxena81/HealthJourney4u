
'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { resetPassword, passwordSchema } from '@/app/actions/auth';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth'; // For logged-in user context

const resetPasswordFormSchema = z.object({
  email: z.string().email().optional(), // Optional if using oobCode or for logged-in user
  newPassword: passwordSchema,
  confirmNewPassword: passwordSchema,
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "Passwords don't match.",
  path: ['confirmNewPassword'],
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;

interface ResetPasswordFormProps {
  oobCode?: string | null; // Out-of-band code from Firebase email link
  isForcedReset?: boolean; // True if user is logged in and password expired
}

export default function ResetPasswordForm({ oobCode, isForcedReset = false }: ResetPasswordFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth(); // Get current user if it's a forced reset
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const emailFromQuery = searchParams.get('email'); // For custom flow after code verification

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: {
      email: isForcedReset ? user?.email || '' : emailFromQuery || '',
      newPassword: '',
      confirmNewPassword: '',
    },
  });
  
  useEffect(() => {
    if (isForcedReset && user) {
        form.setValue('email', user.email || '');
    } else if (emailFromQuery) {
        form.setValue('email', emailFromQuery);
    }
  }, [isForcedReset, user, emailFromQuery, form]);


  const onSubmit = (values: ResetPasswordFormValues) => {
    setError(null);
    startTransition(async () => {
      // TODO: Handle oobCode properly if using Firebase's standard reset links.
      // The `resetPassword` server action needs to be adapted for oobCode or know if user is logged in.
      // For now, it assumes user is logged in (for forced reset) or identity confirmed by prior step (for forgot pw).
      
      let emailToUse = values.email;
      if (isForcedReset && user?.email) {
        emailToUse = user.email;
      } else if (oobCode) {
        // If oobCode is present, email might not be needed or can be verified by Firebase Admin SDK with the code
        // For now, the action requires email.
      } else if (emailFromQuery) {
        emailToUse = emailFromQuery;
      }

      if (!emailToUse && !oobCode && !isForcedReset) {
        setError("Email is required or session is invalid.");
        return;
      }

      const result = await resetPassword({
        email: emailToUse!, // The action needs to handle this logic better
        newPassword: values.newPassword,
        confirmNewPassword: values.confirmNewPassword,
        // oobCode: oobCode, // Pass oobCode to action if using it
      });

      if (result.success) {
        toast({
          title: 'Password Reset Successful!',
          description: result.message || 'You can now log in with your new password.',
        });
        router.push('/login');
      } else {
        setError(result.error || 'An unknown error occurred.');
        toast({
          title: 'Password Reset Failed',
          description: result.error || 'Please try again.',
          variant: 'destructive',
        });
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
      
      {(emailFromQuery || (isForcedReset && user?.email)) && (
        <div className="space-y-2">
            <Label htmlFor="email-reset">Email</Label>
            <Input
            id="email-reset"
            type="email"
            readOnly // Email should be read-only in this form
            disabled
            className="bg-muted/50"
            value={isForcedReset ? user?.email : emailFromQuery || ''}
            />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="newPassword">New Password</Label>
        <div className="relative">
            <Input
            id="newPassword"
            type={showNewPassword ? 'text' : 'password'}
            placeholder="••••••••"
            {...form.register('newPassword')}
            disabled={isPending}
            />
            <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowNewPassword(!showNewPassword)} disabled={isPending}>
            {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
        </div>
        {form.formState.errors.newPassword && (
          <p className="text-sm text-destructive">{form.formState.errors.newPassword.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmNewPassword">Confirm New Password</Label>
        <div className="relative">
            <Input
            id="confirmNewPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="••••••••"
            {...form.register('confirmNewPassword')}
            disabled={isPending}
            />
            <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowConfirmPassword(!showConfirmPassword)} disabled={isPending}>
            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
        </div>
        {form.formState.errors.confirmNewPassword && (
          <p className="text-sm text-destructive">{form.formState.errors.confirmNewPassword.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Reset Password'}
      </Button>
    </form>
  );
}
