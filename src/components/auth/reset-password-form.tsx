
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
import { resetPasswordWithOobCode } from '@/app/actions/auth';
import { passwordSchema } from '@/types';
import { Loader2, Eye, EyeOff } from 'lucide-react';

const resetPasswordFormSchema = z.object({
  newPassword: passwordSchema,
  confirmNewPassword: passwordSchema,
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "Passwords don't match.",
  path: ['confirmNewPassword'],
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;

// This form is for the "forgot password" flow, using the oobCode from the email link
export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const oobCode = searchParams.get('oobCode');

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: {
      newPassword: '',
      confirmNewPassword: '',
    },
  });
  
  useEffect(() => {
    if (!oobCode) {
        setError("Invalid or missing password reset link. Please try the 'Forgot Password' process again.");
    }
  }, [oobCode]);

  const onSubmit = (values: ResetPasswordFormValues) => {
    setError(null);
    if (!oobCode) {
        setError("Invalid or missing password reset link.");
        toast({ title: 'Error', description: "The reset link is invalid.", variant: 'destructive'});
        return;
    }

    startTransition(async () => {
      const result = await resetPasswordWithOobCode(oobCode, values.newPassword);

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
      
      <div className="space-y-2">
        <Label htmlFor="newPassword">New Password</Label>
        <div className="relative">
            <Input
            id="newPassword"
            type={showNewPassword ? 'text' : 'password'}
            placeholder="••••••••"
            {...form.register('newPassword')}
            disabled={isPending || !oobCode}
            autoComplete="new-password"
            />
            <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowNewPassword(!showNewPassword)} disabled={isPending || !oobCode}>
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
            disabled={isPending || !oobCode}
            autoComplete="new-password"
            />
            <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowConfirmPassword(!showConfirmPassword)} disabled={isPending || !oobCode}>
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

      <Button type="submit" className="w-full" disabled={isPending || !oobCode}>
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Reset Password'}
      </Button>
    </form>
  );
}
