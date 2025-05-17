
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
import { resetPassword } from '@/app/actions/auth'; // passwordSchema removed from here
import { passwordSchema } from '@/types'; // Import from types
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
      email: isForcedReset && user?.email ? user.email : emailFromQuery || '',
      newPassword: '',
      confirmNewPassword: '',
    },
  });
  
  useEffect(() => {
    // Pre-fill email if available from context
    if (isForcedReset && user?.email) {
        form.setValue('email', user.email);
    } else if (emailFromQuery) {
        form.setValue('email', emailFromQuery);
    }
    // TODO: If oobCode is present, could verify it and fetch email if needed
  }, [isForcedReset, user, emailFromQuery, form, oobCode]);


  const onSubmit = (values: ResetPasswordFormValues) => {
    setError(null);
    startTransition(async () => {
      let emailToUse = values.email;
      if (isForcedReset && user?.email) {
        emailToUse = user.email;
      } else if (oobCode) {
        // TODO: For oobCode flow, the server action would use `verifyPasswordResetCode` from Firebase Admin SDK first,
        // then `updatePassword`. The `email` might not be strictly needed if oobCode is the primary identifier.
        // The current `resetPassword` action assumes email + newPassword for a logged-in user or a custom flow.
        // It needs to be enhanced to handle oobCode directly from Firebase.
      } else if (emailFromQuery) {
        emailToUse = emailFromQuery;
      }

      if (!emailToUse && !oobCode) {
        setError("Email is required or session is invalid for password reset.");
        toast({ title: 'Error', description: "Email not found for password reset.", variant: 'destructive'});
        return;
      }

      const result = await resetPassword({
        email: emailToUse!, 
        newPassword: values.newPassword,
        confirmNewPassword: values.confirmNewPassword,
        // oobCode: oobCode, // TODO: Pass oobCode to action and handle it there
      });

      if (result.success) {
        toast({
          title: 'Password Reset Successful!',
          description: result.message || 'You can now log in with your new password.',
        });
        // TODO: Update lastPasswordChangeDate in userProfile context if applicable
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
      
      {(emailFromQuery || (isForcedReset && user?.email)) && !oobCode && (
        <div className="space-y-2">
            <Label htmlFor="email-reset">Email</Label>
            <Input
            id="email-reset"
            type="email"
            readOnly 
            disabled
            className="bg-muted/50 cursor-not-allowed"
            // {...form.register('email')} // Registering causes issues if trying to set value manually too
            value={form.getValues('email')}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.email.message}</p>
            )}
        </div>
      )}

      {/* TODO: If oobCode is present, you might not need to show email, or show it after verifying code */}

      <div className="space-y-2">
        <Label htmlFor="newPassword">New Password</Label>
        <div className="relative">
            <Input
            id="newPassword"
            type={showNewPassword ? 'text' : 'password'}
            placeholder="••••••••"
            {...form.register('newPassword')}
            disabled={isPending}
            autoComplete="new-password"
            />
            <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowNewPassword(!showNewPassword)} disabled={isPending} aria-label={showNewPassword ? "Hide new password" : "Show new password"}>
            {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
        </div>
        {form.formState.errors.newPassword && (
          <p className="text-sm text-destructive mt-1">{form.formState.errors.newPassword.message}</p>
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
            autoComplete="new-password"
            />
            <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowConfirmPassword(!showConfirmPassword)} disabled={isPending} aria-label={showConfirmPassword ? "Hide confirm new password" : "Show confirm new password"}>
            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
        </div>
        {form.formState.errors.confirmNewPassword && (
          <p className="text-sm text-destructive mt-1">{form.formState.errors.confirmNewPassword.message}</p>
        )}
      </div>
       <p className="text-xs text-muted-foreground">
         Password must be at least 8 characters, include one uppercase letter, one number, and one special character.
       </p>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Reset Password'}
      </Button>
    </form>
  );
}
